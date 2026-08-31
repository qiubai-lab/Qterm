use super::*;

impl SshSessionManager {
    pub async fn list_directory(
        &self,
        session_id: &str,
        path: RemotePath,
    ) -> Result<DirectoryListing, SessionControlError> {
        let entry = self.entry(session_id)?;
        if !matches!(
            entry.purpose,
            SessionPurpose::Files | SessionPurpose::Terminal
        ) {
            return Err(SessionControlError::DirectoryUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        Self::request_directory_listing(&entry, path).await
    }

    pub async fn list_git_directory(
        &self,
        session_id: &str,
        profile_id: &str,
        path: RemotePath,
    ) -> Result<DirectoryListing, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.purpose != SessionPurpose::Git || entry.profile_id.as_deref() != Some(profile_id) {
            return Err(SessionControlError::DirectoryUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        Self::request_directory_listing(&entry, path).await
    }

    async fn request_directory_listing(
        entry: &SessionEntry,
        path: RemotePath,
    ) -> Result<DirectoryListing, SessionControlError> {
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::ListDirectory { path, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::DirectoryUnavailable)?
            .map_err(|_| SessionControlError::DirectoryUnavailable)
    }

    pub async fn read_file(
        &self,
        session_id: &str,
        path: RemotePath,
        limit: u64,
    ) -> Result<FileDocument, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::ReadFile { path, limit, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }

    pub async fn write_text_file(
        &self,
        session_id: &str,
        path: RemotePath,
        text: String,
        expected_revision: String,
    ) -> Result<FileDocument, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::WriteTextFile {
                path,
                text,
                expected_revision,
                reply,
            })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }

    pub async fn copy_file(
        &self,
        session_id: &str,
        path: RemotePath,
        target_name: String,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Copy { path, target_name })
            .await
    }

    pub async fn create_entry(
        &self,
        session_id: &str,
        directory: RemotePath,
        name: String,
        is_directory: bool,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(
            session_id,
            RemoteMutation::Create {
                directory,
                name,
                is_directory,
            },
        )
        .await
    }

    pub async fn rename_entry(
        &self,
        session_id: &str,
        path: RemotePath,
        target_name: String,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Rename { path, target_name })
            .await
    }

    pub async fn delete_entry(
        &self,
        session_id: &str,
        path: RemotePath,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Delete { path })
            .await
    }

    async fn mutate_entry(
        &self,
        session_id: &str,
        request: RemoteMutation,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::MutateEntry { request, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }
}
