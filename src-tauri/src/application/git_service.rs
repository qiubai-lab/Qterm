use std::path::{Path, PathBuf};

use crate::{
    domain::git::{
        GitCommitFile, GitError, GitSnapshot, validate_branch_name, validate_commit_message,
        validate_commit_oid, validate_paths, validate_remote_branch_ref,
        validate_remote_repository_path, validate_repository_path,
    },
    ports::git_executor::GitExecutor,
    ports::remote_git_executor::RemoteGitExecutor,
};

pub struct GitService<E: GitExecutor> {
    executor: E,
}

pub async fn execute_remote_git<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    action: crate::domain::git::RemoteGitAction,
) -> Result<GitSnapshot, GitError> {
    action.validate()?;
    executor.execute(session_id, profile_id, action).await
}

pub async fn execute_remote_git_commit_files<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    repository: String,
    oid: String,
) -> Result<Vec<GitCommitFile>, GitError> {
    validate_remote_repository_path(&repository)?;
    validate_commit_oid(&oid)?;
    executor
        .commit_files(session_id, profile_id, repository, oid)
        .await
}

impl<E: GitExecutor> GitService<E> {
    pub fn new(executor: E) -> Self {
        Self { executor }
    }

    pub fn available(&self) -> bool {
        self.executor.available()
    }

    pub fn snapshot(&self, path: String) -> Result<GitSnapshot, GitError> {
        let path = input_path(path)?;
        self.executor.snapshot(&path)
    }

    pub fn initialize(&self, path: String) -> Result<GitSnapshot, GitError> {
        let path = input_path(path)?;
        self.executor.initialize(&path)
    }

    pub fn stage(&self, repository: String, paths: Vec<String>) -> Result<GitSnapshot, GitError> {
        validate_paths(&paths)?;
        self.executor.stage(&input_path(repository)?, &paths)
    }

    pub fn stage_all(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.stage_all(&input_path(repository)?)
    }

    pub fn unstage(&self, repository: String, paths: Vec<String>) -> Result<GitSnapshot, GitError> {
        validate_paths(&paths)?;
        self.executor.unstage(&input_path(repository)?, &paths)
    }

    pub fn unstage_all(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.unstage_all(&input_path(repository)?)
    }

    pub fn commit(&self, repository: String, message: String) -> Result<GitSnapshot, GitError> {
        validate_commit_message(&message)?;
        self.executor.commit(&input_path(repository)?, &message)
    }

    pub fn commit_files(
        &self,
        repository: String,
        oid: String,
    ) -> Result<Vec<GitCommitFile>, GitError> {
        validate_commit_oid(&oid)?;
        self.executor.commit_files(&input_path(repository)?, &oid)
    }

    pub fn create_branch(&self, repository: String, name: String) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        self.executor.create_branch(&input_path(repository)?, &name)
    }

    pub fn switch_branch(&self, repository: String, name: String) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        self.executor.switch_branch(&input_path(repository)?, &name)
    }

    pub fn fetch(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.fetch(&input_path(repository)?)
    }

    pub fn track_remote_branch(
        &self,
        repository: String,
        ref_name: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_remote_branch_ref(&ref_name)?;
        self.executor
            .track_remote_branch(&input_path(repository)?, &ref_name)
    }
}

fn input_path(value: String) -> Result<PathBuf, GitError> {
    let path = Path::new(&value).to_path_buf();
    validate_repository_path(&path)?;
    Ok(path)
}
