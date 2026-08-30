use std::{future::Future, pin::Pin};

use crate::domain::git::{GitCommitFile, GitError, GitSnapshot, RemoteGitAction};

pub trait RemoteGitExecutor: Send + Sync + 'static {
    fn execute<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        action: RemoteGitAction,
    ) -> Pin<Box<dyn Future<Output = Result<GitSnapshot, GitError>> + Send + 'a>>;

    fn commit_files<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        oid: String,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<GitCommitFile>, GitError>> + Send + 'a>>;
}
