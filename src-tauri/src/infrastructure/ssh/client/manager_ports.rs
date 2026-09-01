use super::*;

impl RemoteGitExecutor for SshSessionManager {
    fn execute<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        action: crate::domain::git::RemoteGitAction,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError>,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(self.run_git_action(session_id, profile_id, action))
    }

    fn commit_files<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        oid: String,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        Vec<crate::domain::git::GitCommitFile>,
                        crate::domain::git::GitError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(self.run_git_commit_files(session_id, profile_id, repository, oid))
    }

    fn commit_file_diff<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        oid: String,
        path: String,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        crate::domain::git::GitCommitFileDiff,
                        crate::domain::git::GitError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(self.run_git_commit_file_diff(session_id, profile_id, repository, oid, path))
    }

    fn conflict_detail<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        crate::domain::git::GitConflictDetail,
                        crate::domain::git::GitError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(self.run_git_conflict_detail(session_id, profile_id, repository, path))
    }

    fn change_diff<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
        staged: bool,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        crate::domain::git::GitChangeDiff,
                        crate::domain::git::GitError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(self.run_git_change_diff(session_id, profile_id, repository, path, staged))
    }

    fn resolve_conflict<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
        resolution: crate::domain::git::GitConflictResolution,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError>,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(
            self.run_git_resolve_conflict(session_id, profile_id, repository, path, resolution),
        )
    }
}

impl RemoteTerminalStagingStore for SshSessionManager {
    fn start(
        &self,
        session_id: &str,
        entries: Vec<StagingSourceEntry>,
        events: TerminalStagingSink,
    ) -> Result<String, TerminalStagingError> {
        self.start_terminal_staging(session_id, entries, events)
    }

    fn cancel(&self, session_id: &str, task_id: &str) -> Result<(), TerminalStagingError> {
        let entry = self
            .entry(session_id)
            .map_err(|_| TerminalStagingError::SessionNotFound)?;
        if entry.cancel_clipboard_upload(task_id) {
            Ok(())
        } else {
            Err(TerminalStagingError::TaskNotFound)
        }
    }
}
