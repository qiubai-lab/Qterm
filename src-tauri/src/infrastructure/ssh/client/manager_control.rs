use super::*;

impl SshSessionManager {
    pub fn write(&self, id: &str, data: Vec<u8>) -> Result<(), SessionControlError> {
        if data.is_empty() || data.len() > 64 * 1024 {
            return Err(SessionControlError::InvalidTerminalInput);
        }
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Terminal {
            return Err(SessionControlError::TerminalUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        entry
            .control
            .try_send(SessionControl::Write(data))
            .map_err(|_| SessionControlError::ControlQueueUnavailable)
    }

    pub fn resize(&self, id: &str, size: TerminalSize) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Terminal {
            return Err(SessionControlError::TerminalUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        entry
            .control
            .try_send(SessionControl::Resize(size))
            .map_err(|_| SessionControlError::ControlQueueUnavailable)
    }

    pub(super) fn start_terminal_staging(
        &self,
        id: &str,
        sources: Vec<StagingSourceEntry>,
        events: TerminalStagingSink,
    ) -> Result<String, TerminalStagingError> {
        let entry = self
            .entry(id)
            .map_err(|_| TerminalStagingError::SessionNotFound)?;
        if entry.purpose != SessionPurpose::Terminal {
            return Err(TerminalStagingError::TerminalUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(TerminalStagingError::SessionNotConnected);
        }
        if entry.has_clipboard_uploads() {
            return Err(TerminalStagingError::UploadFailed);
        }
        let upload_id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel) = oneshot::channel();
        entry.register_clipboard_upload(upload_id.clone(), cancel_sender);
        let cleanup_paths = sources
            .iter()
            .filter(|source| source.cleanup_after)
            .map(|source| source.path.clone())
            .collect::<Vec<_>>();
        if entry
            .control
            .try_send(SessionControl::StoreTerminalStaging {
                upload_id: upload_id.clone(),
                session_token: id.to_owned(),
                sources,
                events,
                cancel,
            })
            .is_err()
        {
            entry.cancel_clipboard_upload(&upload_id);
            entry.finish_clipboard_upload(&upload_id);
            for path in cleanup_paths {
                let _ = std::fs::remove_file(path);
            }
            return Err(TerminalStagingError::UploadFailed);
        }
        Ok(upload_id)
    }

    pub async fn start_network_rule(
        &self,
        id: &str,
        rule_id: String,
        rule_profile_id: &str,
        kind: ForwardRuleKind,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Network {
            return Err(SessionControlError::NetworkUnavailable);
        }
        if entry.profile_id.as_deref() != Some(rule_profile_id) {
            return Err(SessionControlError::NetworkUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::StartNetworkRule {
                rule_id,
                kind,
                reply,
            })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::SessionFinished)?
    }

    pub async fn stop_network_rule(
        &self,
        id: &str,
        rule_id: String,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Network {
            return Err(SessionControlError::NetworkUnavailable);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::StopNetworkRule { rule_id, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::SessionFinished)?
    }

    pub(super) async fn run_git_action(
        &self,
        id: &str,
        profile_id: &str,
        action: crate::domain::git::RemoteGitAction,
    ) -> Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError> {
        let entry = self
            .entry(id)
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        if entry.purpose != SessionPurpose::Git
            || entry.profile_id.as_deref() != Some(profile_id)
            || entry.state() != SessionState::Connected
        {
            return Err(crate::domain::git::GitError::SessionUnavailable);
        }
        action.validate()?;
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::RunGit { action, reply })
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        response
            .await
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?
    }

    pub(super) async fn run_git_commit_files(
        &self,
        id: &str,
        profile_id: &str,
        repository: String,
        oid: String,
    ) -> Result<Vec<crate::domain::git::GitCommitFile>, crate::domain::git::GitError> {
        let entry = self
            .entry(id)
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        if entry.purpose != SessionPurpose::Git
            || entry.profile_id.as_deref() != Some(profile_id)
            || entry.state() != SessionState::Connected
        {
            return Err(crate::domain::git::GitError::SessionUnavailable);
        }
        crate::domain::git::validate_remote_repository_path(&repository)?;
        crate::domain::git::validate_commit_oid(&oid)?;
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::RunGitCommitFiles {
                repository,
                oid,
                reply,
            })
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        response
            .await
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?
    }

    pub fn start_transfer(
        &self,
        session_id: &str,
        request: TransferRequest,
        events: TransferSink,
    ) -> Result<String, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        entry.register_transfer(id.clone(), cancel_sender);
        if entry
            .control
            .try_send(SessionControl::StartTransfer {
                id: id.clone(),
                request,
                events,
                cancel: cancel_receiver,
            })
            .is_err()
        {
            entry.cancel_transfer(&id);
            return Err(SessionControlError::ControlQueueUnavailable);
        }
        Ok(id)
    }

    pub fn cancel_transfer(
        &self,
        session_id: &str,
        transfer_id: &str,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(session_id)?;
        entry
            .cancel_transfer(transfer_id)
            .ok_or(SessionControlError::TransferNotFound)
    }
}
