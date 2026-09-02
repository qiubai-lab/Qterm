use std::{
    ffi::{OsStr, OsString},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use atomic_write_file::AtomicWriteFile;

use crate::{
    domain::files::content_revision,
    domain::git::{
        GitBranch, GitBranchKind, GitChange, GitChangeDiff, GitCommit, GitCommitFile,
        GitCommitFileDiff, GitConflictContentKind, GitConflictDetail, GitConflictKind,
        GitConflictResolution, GitConflictResult, GitConflictVersion, GitDiffScope, GitDiffSource,
        GitError, GitHead, GitSnapshot, GitSubmodule, GitSubmoduleChange, GitSubmoduleIssue,
        MAX_CONFLICT_TEXT_BYTES, MAX_GIT_DIFF_TEXT_BYTES, MAX_GIT_SUBMODULES,
        find_tracking_local_branch, plan_discard, validate_abort_merge, validate_branch_source_ref,
        validate_checkout_submodule, validate_commit_oid, validate_continue_merge,
        validate_initialize_submodule, validate_local_branch_ref, validate_merge_preconditions,
        validate_remote_branch_ref, validate_remote_name, validate_stage_all,
        validate_submodule_stage_paths,
    },
    ports::git_executor::GitExecutor,
};

const READ_TIMEOUT: Duration = Duration::from_secs(10);
const MUTATION_TIMEOUT: Duration = Duration::from_secs(60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;

pub struct SystemGitExecutor {
    executable: Option<PathBuf>,
}

struct ProcessOutput {
    stdout: Vec<u8>,
}

impl SystemGitExecutor {
    pub fn discover() -> Self {
        let executable = candidates().into_iter().find(|candidate| {
            run_process(candidate, [OsStr::new("--version")], Duration::from_secs(2)).is_ok()
        });
        Self { executable }
    }

    #[cfg(test)]
    fn with_executable(executable: PathBuf) -> Self {
        Self {
            executable: Some(executable),
        }
    }

    fn git<I, S>(&self, args: I, timeout: Duration) -> Result<ProcessOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let executable = self.executable.as_ref().ok_or(GitError::Missing)?;
        run_process(executable, args, timeout)
    }

    fn repository_root(&self, path: &Path) -> Result<PathBuf, GitError> {
        if !path.is_dir() {
            return Err(GitError::InvalidPath);
        }
        let output = self.git(
            [
                OsString::from("-C"),
                path.as_os_str().to_owned(),
                OsString::from("rev-parse"),
                OsString::from("--show-toplevel"),
            ],
            READ_TIMEOUT,
        )?;
        let root = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if root.is_empty() {
            return Err(GitError::NotRepository);
        }
        Ok(PathBuf::from(root))
    }

    fn mutate<I, S>(&self, repository: &Path, args: I) -> Result<GitSnapshot, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = vec![OsString::from("-C"), repository.as_os_str().to_owned()];
        command.extend(args.into_iter().map(|value| value.as_ref().to_owned()));
        self.git(command, MUTATION_TIMEOUT)?;
        self.snapshot(repository)
    }

    fn network_mutate<I, S>(&self, repository: &Path, args: I) -> Result<GitSnapshot, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let repository = self.repository_root(repository)?;
        let mut command = vec![OsString::from("-C"), repository.as_os_str().to_owned()];
        command.extend(args.into_iter().map(|value| value.as_ref().to_owned()));
        self.git(command, FETCH_TIMEOUT)?;
        self.snapshot(&repository)
    }

    fn has_head(&self, repository: &Path) -> bool {
        self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("rev-parse"),
                OsString::from("--verify"),
                OsString::from("HEAD"),
            ],
            READ_TIMEOUT,
        )
        .is_ok()
    }

    fn merge_head_state(&self, repository: &Path) -> Result<(bool, Option<String>), GitError> {
        match self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("rev-parse"),
                OsString::from("--verify"),
                OsString::from("-q"),
                OsString::from("MERGE_HEAD"),
            ],
            READ_TIMEOUT,
        ) {
            Ok(output) => {
                let oids = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .map(str::trim)
                    .filter(|oid| !oid.is_empty())
                    .map(str::to_owned)
                    .collect::<Vec<_>>();
                if oids.iter().all(|oid| validate_commit_oid(oid).is_ok()) && !oids.is_empty() {
                    Ok((true, (oids.len() == 1).then(|| oids[0].clone())))
                } else {
                    Err(GitError::Io)
                }
            }
            Err(GitError::CommandFailed(_)) => Ok((false, None)),
            Err(error) => Err(error),
        }
    }

    fn checkout_conflict_side(
        &self,
        repository: &Path,
        path: &str,
        side: &str,
    ) -> Result<(), GitError> {
        self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("--literal-pathspecs"),
                OsString::from("checkout"),
                OsString::from(side),
                OsString::from("--"),
                OsString::from(path),
            ],
            MUTATION_TIMEOUT,
        )?;
        Ok(())
    }
}

mod branch;
mod changes;
mod conflict;
mod executor;
mod parsers;
mod process;
mod repository;
mod submodule;

use branch::parse_remotes;
pub(crate) use conflict::build_conflict_detail;
use conflict::{
    commit_parent_oid, head_version, index_version, missing_version, tree_version, worktree_version,
};
pub(crate) use parsers::{
    parse_branches, parse_commit_files, parse_commits, parse_status, parse_submodules,
};
use process::{candidates, run_process};
pub(crate) use process::{classify_failure, sanitize_submodule_operation_error};

#[cfg(test)]
use process::read_bounded;

#[cfg(test)]
mod tests;
