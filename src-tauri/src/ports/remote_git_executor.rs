use std::{future::Future, pin::Pin};

use crate::domain::git::{
    GitChangeDiff, GitCommitFile, GitCommitFileDiff, GitConflictDetail, GitConflictResolution,
    GitError, GitSnapshot, RemoteGitAction,
};

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

    fn commit_file_diff<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        oid: String,
        path: String,
    ) -> Pin<Box<dyn Future<Output = Result<GitCommitFileDiff, GitError>> + Send + 'a>>;

    fn conflict_detail<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
    ) -> Pin<Box<dyn Future<Output = Result<GitConflictDetail, GitError>> + Send + 'a>>;

    fn change_diff<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
        staged: bool,
    ) -> Pin<Box<dyn Future<Output = Result<GitChangeDiff, GitError>> + Send + 'a>>;

    fn resolve_conflict<'a>(
        &'a self,
        session_id: &'a str,
        profile_id: &'a str,
        repository: String,
        path: String,
        resolution: GitConflictResolution,
    ) -> Pin<Box<dyn Future<Output = Result<GitSnapshot, GitError>> + Send + 'a>>;
}
