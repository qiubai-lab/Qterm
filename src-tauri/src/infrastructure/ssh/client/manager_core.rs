use super::*;

impl SshSessionManager {
    pub fn new(repository: JsonKnownHostRepository, shell_cache: JsonRemoteShellCache) -> Self {
        Self {
            host_keys: Arc::new(HostKeyService::new(repository)),
            shell_cache: Arc::new(shell_cache),
            sessions: Mutex::new(HashMap::new()),
            finished: Mutex::new(VecDeque::new()),
        }
    }

    pub fn connect(self: &Arc<Self>, request: SessionConnectRequest, events: EventSink) -> String {
        let id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        let (control_sender, control_receiver) = mpsc::channel(128);
        let route_length = request.route.len();
        let entry = Arc::new(SessionEntry::new(
            request
                .route
                .last()
                .map(|node| node.metadata(route_length - 1, route_length))
                .expect("validated session route"),
            request.purpose,
            request.profile_id.clone(),
            events,
            cancel_sender,
            control_sender,
        ));
        entry.emit(SessionEvent::StateChanged(SessionState::Connecting));
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id.clone(), Arc::clone(&entry));

        let host_keys = Arc::clone(&self.host_keys);
        let shell_cache = Arc::clone(&self.shell_cache);
        let manager = Arc::clone(self);
        let task_id = id.clone();
        tauri::async_runtime::spawn(async move {
            run_session(
                entry,
                host_keys,
                shell_cache,
                request,
                cancel_receiver,
                control_receiver,
            )
            .await;
            manager.finish(&task_id);
        });
        id
    }

    pub fn accept_host_key(&self, id: &str) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        let pending = entry
            .take_pending()
            .ok_or(SessionControlError::NoHostKeyDecision)?;
        if self
            .host_keys
            .accept(&pending.endpoint, &pending.key)
            .is_err()
        {
            entry.fail_at(
                SessionFailure::KnownHostsUnavailable,
                pending.node,
                RouteStage::VerifyHostKey,
            );
            let _ = pending.decision.send(HostKeyDecision::Cancel);
            return Err(SessionControlError::KnownHostsUnavailable);
        }
        pending
            .decision
            .send(HostKeyDecision::Accept)
            .map_err(|_| SessionControlError::SessionFinished)
    }

    pub fn reject_host_key(&self, id: &str) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        let pending = entry
            .take_pending()
            .ok_or(SessionControlError::NoHostKeyDecision)?;
        pending
            .decision
            .send(HostKeyDecision::Reject)
            .map_err(|_| SessionControlError::SessionFinished)
    }

    pub fn close(&self, id: &str) -> Result<(), SessionControlError> {
        match self.entry(id) {
            Ok(entry) => {
                entry.begin_close();
                Ok(())
            }
            Err(SessionControlError::SessionNotFound)
                if self
                    .finished
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .iter()
                    .any(|finished| finished == id) =>
            {
                Ok(())
            }
            Err(error) => Err(error),
        }
    }

    pub fn close_profile_network_sessions(&self, profile_id: &str) -> usize {
        let entries = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .filter(|entry| {
                entry.purpose == SessionPurpose::Network
                    && entry.profile_id.as_deref() == Some(profile_id)
            })
            .cloned()
            .collect::<Vec<_>>();
        for entry in &entries {
            entry.begin_close();
        }
        entries.len()
    }

    pub fn close_profile_git_sessions(&self, profile_id: &str) -> usize {
        let entries = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .filter(|entry| {
                entry.purpose == SessionPurpose::Git
                    && entry.profile_id.as_deref() == Some(profile_id)
            })
            .cloned()
            .collect::<Vec<_>>();
        for entry in &entries {
            entry.begin_close();
        }
        entries.len()
    }

    pub fn close_all_network_sessions(&self) -> usize {
        let entries = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .filter(|entry| entry.purpose == SessionPurpose::Network)
            .cloned()
            .collect::<Vec<_>>();
        for entry in &entries {
            entry.begin_close();
        }
        entries.len()
    }

    pub(super) fn entry(&self, id: &str) -> Result<Arc<SessionEntry>, SessionControlError> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
            .cloned()
            .ok_or(SessionControlError::SessionNotFound)
    }

    pub(super) fn finish(&self, id: &str) {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
        let mut finished = self
            .finished
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        finished.push_back(id.to_owned());
        if finished.len() > 256 {
            finished.pop_front();
        }
    }
}
