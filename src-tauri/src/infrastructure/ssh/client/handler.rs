use super::*;

pub(super) struct ClientHandler {
    pub(super) entry: Arc<SessionEntry>,
    pub(super) node: RouteNodeMetadata,
    pub(super) host_keys: Arc<KnownHostService>,
    pub(super) remote_forwards: RemoteForwardMap,
    pub(super) forward_tasks: ForwardTaskRegistry,
    pub(super) forward_permits: ForwardPermits,
    pub(super) allow_remote_forwards: bool,
}

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, public_key: &PublicKey) -> Result<bool, Self::Error> {
        let presented = PresentedHostKey::new(
            public_key.algorithm().to_string(),
            public_key.to_openssh().map_err(russh::Error::from)?,
            public_key.fingerprint(HashAlg::Sha256).to_string(),
        );
        match self.host_keys.check(&self.node.endpoint, &presented) {
            Ok(HostKeyCheck::Trusted) => Ok(true),
            Ok(HostKeyCheck::Changed {
                trusted_fingerprint,
            }) => {
                self.entry.emit(SessionEvent::HostKeyChanged {
                    node: self.node.clone(),
                    trusted_fingerprint,
                    presented_fingerprint: presented.fingerprint().to_owned(),
                });
                self.entry.fail_at(
                    SessionFailure::HostKeyChanged,
                    self.node.clone(),
                    RouteStage::VerifyHostKey,
                );
                Ok(false)
            }
            Ok(HostKeyCheck::Unknown) => {
                self.entry.transition(SessionState::AwaitingHostKey);
                let algorithm = presented.algorithm().to_owned();
                let fingerprint = presented.fingerprint().to_owned();
                let (sender, receiver) = oneshot::channel();
                self.entry.set_pending(PendingHostKey {
                    endpoint: self.node.endpoint.clone(),
                    node: self.node.clone(),
                    key: presented,
                    decision: sender,
                });
                self.entry.emit(SessionEvent::HostKeyConfirmationRequired {
                    node: self.node.clone(),
                    algorithm,
                    fingerprint,
                });
                match tokio::time::timeout(HOST_KEY_DECISION_TIMEOUT, receiver).await {
                    Ok(Ok(HostKeyDecision::Accept)) => Ok(true),
                    Ok(Ok(HostKeyDecision::Reject)) => {
                        self.entry.fail_at(
                            SessionFailure::HostKeyRejected,
                            self.node.clone(),
                            RouteStage::VerifyHostKey,
                        );
                        Ok(false)
                    }
                    Ok(Ok(HostKeyDecision::Cancel)) => Ok(false),
                    _ => {
                        self.entry.take_pending();
                        self.entry.fail_at(
                            SessionFailure::HostKeyDecisionTimeout,
                            self.node.clone(),
                            RouteStage::VerifyHostKey,
                        );
                        Ok(false)
                    }
                }
            }
            Err(_) => {
                self.entry.fail_at(
                    SessionFailure::KnownHostsUnavailable,
                    self.node.clone(),
                    RouteStage::VerifyHostKey,
                );
                Ok(false)
            }
        }
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if self.allow_remote_forwards
            && let Some((rule_id, target_host, target_port)) =
                remote_target(&self.remote_forwards, connected_address, connected_port)
        {
            let Ok(permit) = Arc::clone(&self.forward_permits).try_acquire_owned() else {
                reply.reject(ChannelOpenFailure::ResourceShortage).await;
                return Ok(());
            };
            reply.accept().await;
            spawn_forward_task(&self.forward_tasks, rule_id, async move {
                let _permit = permit;
                pump_forwarded_channel(channel, target_host, target_port).await;
            });
        } else {
            reply
                .reject(ChannelOpenFailure::AdministrativelyProhibited)
                .await;
        }
        Ok(())
    }
}
