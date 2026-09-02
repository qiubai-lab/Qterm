use std::path::{Path, PathBuf};

use crate::{
    domain::git::{
        GitChangeDiff, GitCommitFile, GitCommitFileDiff, GitConflictDetail, GitConflictResolution,
        GitError, GitSnapshot, validate_branch_name, validate_branch_source_ref,
        validate_commit_message, validate_commit_oid, validate_conflict_resolution,
        validate_discard_paths, validate_local_branch_ref, validate_local_paths,
        validate_remote_branch_ref, validate_remote_name, validate_remote_repository_path,
        validate_repository_path,
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

pub async fn execute_remote_git_commit_file_diff<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    repository: String,
    oid: String,
    path: String,
) -> Result<GitCommitFileDiff, GitError> {
    validate_remote_repository_path(&repository)?;
    validate_commit_oid(&oid)?;
    crate::domain::git::validate_posix_paths(std::slice::from_ref(&path))?;
    executor
        .commit_file_diff(session_id, profile_id, repository, oid, path)
        .await
}

pub async fn execute_remote_git_conflict_detail<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    repository: String,
    path: String,
) -> Result<GitConflictDetail, GitError> {
    validate_remote_repository_path(&repository)?;
    crate::domain::git::validate_posix_paths(std::slice::from_ref(&path))?;
    executor
        .conflict_detail(session_id, profile_id, repository, path)
        .await
}

pub async fn execute_remote_git_change_diff<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    repository: String,
    path: String,
    staged: bool,
) -> Result<GitChangeDiff, GitError> {
    validate_remote_repository_path(&repository)?;
    crate::domain::git::validate_posix_paths(std::slice::from_ref(&path))?;
    executor
        .change_diff(session_id, profile_id, repository, path, staged)
        .await
}

pub async fn execute_remote_git_resolve_conflict<E: RemoteGitExecutor>(
    executor: &E,
    session_id: &str,
    profile_id: &str,
    repository: String,
    path: String,
    resolution: GitConflictResolution,
) -> Result<GitSnapshot, GitError> {
    validate_remote_repository_path(&repository)?;
    crate::domain::git::validate_posix_paths(std::slice::from_ref(&path))?;
    validate_conflict_resolution(&resolution)?;
    executor
        .resolve_conflict(session_id, profile_id, repository, path, resolution)
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
        validate_local_paths(&paths)?;
        self.executor.stage(&input_path(repository)?, &paths)
    }

    pub fn stage_all(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.stage_all(&input_path(repository)?)
    }

    pub fn unstage(&self, repository: String, paths: Vec<String>) -> Result<GitSnapshot, GitError> {
        validate_local_paths(&paths)?;
        self.executor.unstage(&input_path(repository)?, &paths)
    }

    pub fn unstage_all(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.unstage_all(&input_path(repository)?)
    }

    pub fn discard(&self, repository: String, paths: Vec<String>) -> Result<GitSnapshot, GitError> {
        validate_discard_paths(&paths, validate_local_paths)?;
        self.executor.discard(&input_path(repository)?, &paths)
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

    pub fn commit_file_diff(
        &self,
        repository: String,
        oid: String,
        path: String,
    ) -> Result<GitCommitFileDiff, GitError> {
        validate_commit_oid(&oid)?;
        validate_local_paths(std::slice::from_ref(&path))?;
        self.executor
            .commit_file_diff(&input_path(repository)?, &oid, &path)
    }

    pub fn conflict_detail(
        &self,
        repository: String,
        path: String,
    ) -> Result<GitConflictDetail, GitError> {
        validate_local_paths(std::slice::from_ref(&path))?;
        self.executor
            .conflict_detail(&input_path(repository)?, &path)
    }

    pub fn change_diff(
        &self,
        repository: String,
        path: String,
        staged: bool,
    ) -> Result<GitChangeDiff, GitError> {
        validate_local_paths(std::slice::from_ref(&path))?;
        self.executor
            .change_diff(&input_path(repository)?, &path, staged)
    }

    pub fn resolve_conflict(
        &self,
        repository: String,
        path: String,
        resolution: GitConflictResolution,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_paths(std::slice::from_ref(&path))?;
        validate_conflict_resolution(&resolution)?;
        self.executor
            .resolve_conflict(&input_path(repository)?, &path, &resolution)
    }

    pub fn create_branch(&self, repository: String, name: String) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        self.executor.create_branch(&input_path(repository)?, &name)
    }

    pub fn create_branch_from(
        &self,
        repository: String,
        name: String,
        source_ref: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        validate_branch_source_ref(&source_ref)?;
        self.executor
            .create_branch_from(&input_path(repository)?, &name, &source_ref)
    }

    pub fn create_branch_from_commit(
        &self,
        repository: String,
        name: String,
        oid: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        validate_commit_oid(&oid)?;
        self.executor
            .create_branch_from_commit(&input_path(repository)?, &name, &oid)
    }

    pub fn rename_branch(
        &self,
        repository: String,
        ref_name: String,
        new_name: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(&ref_name)?;
        validate_branch_name(&new_name)?;
        self.executor
            .rename_branch(&input_path(repository)?, &ref_name, &new_name)
    }

    pub fn delete_branch(
        &self,
        repository: String,
        ref_name: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(&ref_name)?;
        self.executor
            .delete_branch(&input_path(repository)?, &ref_name)
    }

    pub fn switch_branch(&self, repository: String, name: String) -> Result<GitSnapshot, GitError> {
        validate_branch_name(&name)?;
        self.executor.switch_branch(&input_path(repository)?, &name)
    }

    pub fn fetch(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.fetch(&input_path(repository)?)
    }

    pub fn pull(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.pull(&input_path(repository)?)
    }

    pub fn push(
        &self,
        repository: String,
        remote: Option<String>,
    ) -> Result<GitSnapshot, GitError> {
        if let Some(remote) = remote.as_deref() {
            validate_remote_name(remote)?;
        }
        self.executor
            .push(&input_path(repository)?, remote.as_deref())
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

    pub fn merge_branch(
        &self,
        repository: String,
        source_ref: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_branch_source_ref(&source_ref)?;
        self.executor
            .merge_branch(&input_path(repository)?, &source_ref)
    }

    pub fn continue_merge(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.continue_merge(&input_path(repository)?)
    }

    pub fn abort_merge(&self, repository: String) -> Result<GitSnapshot, GitError> {
        self.executor.abort_merge(&input_path(repository)?)
    }

    pub fn initialize_submodule(
        &self,
        repository: String,
        path: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_paths(std::slice::from_ref(&path))?;
        self.executor
            .initialize_submodule(&input_path(repository)?, &path)
    }

    pub fn checkout_submodule(
        &self,
        repository: String,
        path: String,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_paths(std::slice::from_ref(&path))?;
        self.executor
            .checkout_submodule(&input_path(repository)?, &path)
    }
}

fn input_path(value: String) -> Result<PathBuf, GitError> {
    let path = Path::new(&value).to_path_buf();
    validate_repository_path(&path)?;
    Ok(path)
}
