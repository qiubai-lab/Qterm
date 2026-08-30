use super::*;

enum RunningNetworkRule {
    Listener(RunningListener),
    Remote { bind_host: String, bind_port: u16 },
}

pub(super) struct NetworkForwardRuntime {
    pub(super) direct_sender: mpsc::Sender<DirectConnection>,
    pub(super) direct_receiver: mpsc::Receiver<DirectConnection>,
    pub(super) remote_forwards: RemoteForwardMap,
    pub(super) forward_tasks: ForwardTaskRegistry,
    pub(super) forward_permits: ForwardPermits,
}

pub(super) async fn run_network_session(
    entry: &Arc<SessionEntry>,
    handle: &mut client::Handle<ClientHandler>,
    cancel: &mut oneshot::Receiver<()>,
    controls: &mut mpsc::Receiver<SessionControl>,
    mut runtime: NetworkForwardRuntime,
) {
    let mut rules: HashMap<String, RunningNetworkRule> = HashMap::new();
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut *cancel => { entry.transition(SessionState::Closing); }
            control = controls.recv() => match control {
                Some(SessionControl::StartNetworkRule { rule_id, kind, reply }) => {
                    if rules.contains_key(&rule_id) {
                        let _ = reply.send(Ok(()));
                        continue;
                    }
                    let result = match &kind {
                        ForwardRuleKind::Local { .. } | ForwardRuleKind::Socks5 { .. } => {
                            start_listener(&rule_id, &kind, runtime.direct_sender.clone()).await
                                .map(RunningNetworkRule::Listener)
                                .map_err(|_| SessionControlError::NetworkUnavailable)
                        }
                        ForwardRuleKind::Remote { bind_host, bind_port, target_host, target_port } => {
                            match handle.tcpip_forward(bind_host.clone(), (*bind_port).into()).await {
                                Ok(_) => {
                                    runtime.remote_forwards
                                        .lock()
                                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                                        .insert((bind_host.clone(), (*bind_port).into()), (rule_id.clone(), target_host.clone(), *target_port));
                                    Ok(RunningNetworkRule::Remote { bind_host: bind_host.clone(), bind_port: *bind_port })
                                }
                                Err(_) => Err(SessionControlError::NetworkUnavailable),
                            }
                        }
                    };
                    match result {
                        Ok(running) => { rules.insert(rule_id, running); let _ = reply.send(Ok(())); }
                        Err(error) => { let _ = reply.send(Err(error)); }
                    }
                }
                Some(SessionControl::StopNetworkRule { rule_id, reply }) => {
                    let result = match rules.remove(&rule_id) {
                        Some(RunningNetworkRule::Listener(listener)) => {
                            listener.stop();
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            Ok(())
                        }
                        Some(RunningNetworkRule::Remote { bind_host, bind_port }) => {
                            runtime.remote_forwards
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner())
                                .remove(&(bind_host.clone(), bind_port.into()));
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            handle.cancel_tcpip_forward(bind_host, bind_port.into()).await
                                .map_err(|_| SessionControlError::NetworkUnavailable)
                        }
                        None => {
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            Ok(())
                        },
                    };
                    let _ = reply.send(result);
                }
                Some(SessionControl::RunGit { reply, .. }) => { let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable)); }
                Some(SessionControl::RunGitCommitFiles { reply, .. }) => { let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable)); }
                Some(SessionControl::Write(_) | SessionControl::Resize(_) | SessionControl::StoreTerminalStaging { .. } | SessionControl::StartTransfer { .. } | SessionControl::ListDirectory { .. } | SessionControl::ReadFile { .. } | SessionControl::WriteTextFile { .. } | SessionControl::MutateEntry { .. }) => {}
                None => { entry.transition(SessionState::Closing); }
            },
            connection = runtime.direct_receiver.recv() => {
                let Some(mut connection) = connection else { continue };
                if !rules.contains_key(&connection.rule_id) {
                    continue;
                }
                let Ok(permit) = Arc::clone(&runtime.forward_permits).try_acquire_owned() else {
                    if connection.socks5 {
                        let _ = acknowledge_socks5(&mut connection.stream, false).await;
                    }
                    continue;
                };
                let opened = tokio::time::timeout(CONNECT_TIMEOUT, handle.channel_open_direct_tcpip(
                    connection.target_host.clone(),
                    connection.target_port.into(),
                    connection.originator_host.clone(),
                    connection.originator_port.into(),
                )).await;
                match opened {
                    Ok(Ok(channel)) => {
                        if connection.socks5 && acknowledge_socks5(&mut connection.stream, true).await.is_err() {
                            continue;
                        }
                        spawn_forward_task(&runtime.forward_tasks, connection.rule_id, async move {
                            let _permit = permit;
                            let _ = pump_tcp_channel(connection.stream, channel).await;
                        });
                    }
                    _ => {
                        if connection.socks5 {
                            let _ = acknowledge_socks5(&mut connection.stream, false).await;
                        }
                    }
                }
            }
        }
    }
    for (_, rule) in rules.drain() {
        match rule {
            RunningNetworkRule::Listener(listener) => listener.stop(),
            RunningNetworkRule::Remote {
                bind_host,
                bind_port,
            } => {
                let _ = handle
                    .cancel_tcpip_forward(bind_host, bind_port.into())
                    .await;
            }
        }
    }
    for rule_id in runtime
        .forward_tasks
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .keys()
        .cloned()
        .collect::<Vec<_>>()
    {
        abort_forward_tasks(&runtime.forward_tasks, &rule_id);
    }
    runtime
        .remote_forwards
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
    let _ = handle
        .disconnect(Disconnect::ByApplication, "network session closed", "en")
        .await;
    entry.transition(SessionState::Closed);
}
