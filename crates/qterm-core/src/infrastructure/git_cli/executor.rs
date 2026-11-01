use super::*;

impl GitExecutor for SystemGitExecutor {
    fn available(&self) -> bool {
        self.executable.is_some()
    }

    fn snapshot(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        repository::snapshot(self, path)
    }

    fn initialize(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        repository::initialize(self, path)
    }

    fn stage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        changes::stage(self, repository, paths)
    }

    fn stage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        changes::stage_all(self, repository)
    }

    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        changes::unstage(self, repository, paths)
    }

    fn unstage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        changes::unstage_all(self, repository)
    }

    fn discard(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        changes::discard(self, repository, paths)
    }

    fn commit(&self, repository: &Path, message: &str) -> Result<GitSnapshot, GitError> {
        changes::commit(self, repository, message)
    }

    fn commit_files(&self, repository: &Path, oid: &str) -> Result<Vec<GitCommitFile>, GitError> {
        changes::commit_files(self, repository, oid)
    }

    fn commit_file_diff(
        &self,
        repository: &Path,
        oid: &str,
        path: &str,
    ) -> Result<GitCommitFileDiff, GitError> {
        changes::commit_file_diff(self, repository, oid, path)
    }

    fn change_diff(
        &self,
        repository: &Path,
        path: &str,
        staged: bool,
    ) -> Result<GitChangeDiff, GitError> {
        changes::change_diff(self, repository, path, staged)
    }

    fn conflict_detail(
        &self,
        repository: &Path,
        path: &str,
    ) -> Result<GitConflictDetail, GitError> {
        conflict::conflict_detail(self, repository, path)
    }

    fn resolve_conflict(
        &self,
        repository: &Path,
        path: &str,
        resolution: &GitConflictResolution,
    ) -> Result<GitSnapshot, GitError> {
        conflict::resolve_conflict(self, repository, path, resolution)
    }

    fn create_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        branch::create_branch(self, repository, name)
    }

    fn create_branch_from(
        &self,
        repository: &Path,
        name: &str,
        source_ref: &str,
    ) -> Result<GitSnapshot, GitError> {
        branch::create_branch_from(self, repository, name, source_ref)
    }

    fn create_branch_from_commit(
        &self,
        repository: &Path,
        name: &str,
        oid: &str,
    ) -> Result<GitSnapshot, GitError> {
        branch::create_branch_from_commit(self, repository, name, oid)
    }

    fn rename_branch(
        &self,
        repository: &Path,
        ref_name: &str,
        new_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        branch::rename_branch(self, repository, ref_name, new_name)
    }

    fn delete_branch(&self, repository: &Path, ref_name: &str) -> Result<GitSnapshot, GitError> {
        branch::delete_branch(self, repository, ref_name)
    }

    fn switch_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        branch::switch_branch(self, repository, name)
    }

    fn fetch(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        branch::fetch(self, repository)
    }

    fn pull(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        branch::pull(self, repository)
    }

    fn push(&self, repository: &Path, remote: Option<&str>) -> Result<GitSnapshot, GitError> {
        branch::push(self, repository, remote)
    }

    fn track_remote_branch(
        &self,
        repository: &Path,
        ref_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        branch::track_remote_branch(self, repository, ref_name)
    }

    fn merge_branch(&self, repository: &Path, source_ref: &str) -> Result<GitSnapshot, GitError> {
        branch::merge_branch(self, repository, source_ref)
    }

    fn continue_merge(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        branch::continue_merge(self, repository)
    }

    fn abort_merge(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        branch::abort_merge(self, repository)
    }

    fn initialize_submodule(&self, repository: &Path, path: &str) -> Result<GitSnapshot, GitError> {
        submodule::initialize_submodule(self, repository, path)
    }

    fn checkout_submodule(&self, repository: &Path, path: &str) -> Result<GitSnapshot, GitError> {
        submodule::checkout_submodule(self, repository, path)
    }
}
