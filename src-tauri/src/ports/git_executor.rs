use std::path::Path;

use crate::domain::git::{GitCommitFile, GitError, GitSnapshot};

pub trait GitExecutor: Send + Sync + 'static {
    fn available(&self) -> bool;
    fn snapshot(&self, path: &Path) -> Result<GitSnapshot, GitError>;
    fn initialize(&self, path: &Path) -> Result<GitSnapshot, GitError>;
    fn stage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError>;
    fn stage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError>;
    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError>;
    fn unstage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError>;
    fn commit(&self, repository: &Path, message: &str) -> Result<GitSnapshot, GitError>;
    fn commit_files(&self, repository: &Path, oid: &str) -> Result<Vec<GitCommitFile>, GitError>;
    fn create_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError>;
    fn switch_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError>;
    fn fetch(&self, repository: &Path) -> Result<GitSnapshot, GitError>;
    fn track_remote_branch(
        &self,
        repository: &Path,
        ref_name: &str,
    ) -> Result<GitSnapshot, GitError>;
}
