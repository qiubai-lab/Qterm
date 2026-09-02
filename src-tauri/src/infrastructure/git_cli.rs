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

impl GitExecutor for SystemGitExecutor {
    fn available(&self) -> bool {
        self.executable.is_some()
    }

    fn snapshot(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        let repository = self.repository_root(path)?;
        let (merge_in_progress, merge_head_oid) = self.merge_head_state(&repository)?;
        let status = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("status"),
                OsString::from("--porcelain=v2"),
                OsString::from("-z"),
                OsString::from("--branch"),
                OsString::from("--untracked-files=all"),
            ],
            READ_TIMEOUT,
        )?;
        let branches = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("for-each-ref"),
                OsString::from(
                    "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream)%00%(symref)",
                ),
                OsString::from("refs/heads/"),
                OsString::from("refs/remotes/"),
            ],
            READ_TIMEOUT,
        )?;
        let remotes = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("remote"),
            ],
            READ_TIMEOUT,
        )?;
        let log = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("log"),
                OsString::from("--all"),
                OsString::from("--topo-order"),
                OsString::from("--decorate=short"),
                OsString::from("-n"),
                OsString::from("100"),
                OsString::from("--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%at%x1f%b%x1e"),
            ],
            READ_TIMEOUT,
        );
        let (head, changes) = parse_status(&status.stdout)?;
        let index = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("ls-files"),
                OsString::from("--stage"),
                OsString::from("-z"),
            ],
            READ_TIMEOUT,
        )?;
        let config = self
            .git(
                [
                    OsString::from("-C"),
                    repository.as_os_str().to_owned(),
                    OsString::from("config"),
                    OsString::from("-z"),
                    OsString::from("--file"),
                    OsString::from(".gitmodules"),
                    OsString::from("--get-regexp"),
                    OsString::from("^submodule\\..*\\.path$"),
                ],
                READ_TIMEOUT,
            )
            .ok();
        let needs_submodule_status = index.stdout.windows(6).any(|value| value == b"160000")
            || config
                .as_ref()
                .is_some_and(|output| !output.stdout.is_empty());
        let submodule_status = needs_submodule_status
            .then(|| {
                self.git(
                    [
                        OsString::from("-C"),
                        repository.as_os_str().to_owned(),
                        OsString::from("submodule"),
                        OsString::from("status"),
                    ],
                    READ_TIMEOUT,
                )
            })
            .transpose()
            .ok()
            .flatten();
        let submodules = parse_submodules(
            &index.stdout,
            config.as_ref().map(|output| output.stdout.as_slice()),
            submodule_status
                .as_ref()
                .map(|output| output.stdout.as_slice()),
            &changes,
        )?;
        let commits = match log {
            Ok(output) => parse_commits(&output.stdout),
            Err(GitError::CommandFailed(_)) if head.unborn => Vec::new(),
            Err(error) => return Err(error),
        };
        let repository_path = repository.to_string_lossy().into_owned();
        let repository_name = repository
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or(&repository_path)
            .to_owned();
        Ok(GitSnapshot {
            repository_path,
            repository_name,
            head,
            changes,
            submodules,
            branches: parse_branches(&branches.stdout),
            remotes: parse_remotes(&remotes.stdout),
            commits,
            merge_in_progress,
            merge_head_oid,
        })
    }

    fn initialize(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        if !path.is_dir() {
            return Err(GitError::InvalidPath);
        }
        self.git(
            [
                OsString::from("-C"),
                path.as_os_str().to_owned(),
                OsString::from("init"),
            ],
            MUTATION_TIMEOUT,
        )?;
        self.snapshot(path)
    }

    fn stage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_submodule_stage_paths(&current, paths)?;
        let mut args = vec![
            OsString::from("--literal-pathspecs"),
            OsString::from("add"),
            OsString::from("--"),
        ];
        args.extend(paths.iter().map(OsString::from));
        self.mutate(repository, args)
    }

    fn stage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_stage_all(&current)?;
        self.mutate(repository, ["add", "-A", "--"])
    }

    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        let mut args = if self.has_head(repository) {
            vec![
                OsString::from("--literal-pathspecs"),
                OsString::from("reset"),
                OsString::from("-q"),
                OsString::from("HEAD"),
                OsString::from("--"),
            ]
        } else {
            vec![
                OsString::from("--literal-pathspecs"),
                OsString::from("rm"),
                OsString::from("--cached"),
                OsString::from("-q"),
                OsString::from("--"),
            ]
        };
        args.extend(paths.iter().map(OsString::from));
        self.mutate(repository, args)
    }

    fn unstage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        if self.has_head(repository) {
            self.mutate(repository, ["reset", "-q", "HEAD", "--"])
        } else {
            self.mutate(repository, ["rm", "--cached", "-r", "-q", "--", "."])
        }
    }

    fn discard(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        let plan = plan_discard(&current, paths)?;
        if !plan.tracked_paths.is_empty() {
            let mut args = vec![
                OsString::from("--literal-pathspecs"),
                OsString::from("checkout"),
                OsString::from("--"),
            ];
            args.extend(plan.tracked_paths.iter().map(OsString::from));
            self.mutate(repository, args)?;
        }
        if !plan.untracked_paths.is_empty() {
            let mut args = vec![
                OsString::from("--literal-pathspecs"),
                OsString::from("clean"),
                OsString::from("-f"),
                OsString::from("--"),
            ];
            args.extend(plan.untracked_paths.iter().map(OsString::from));
            self.mutate(repository, args)?;
        }
        self.snapshot(repository)
    }

    fn commit(&self, repository: &Path, message: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(
            repository,
            [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(message)],
        )
    }

    fn commit_files(&self, repository: &Path, oid: &str) -> Result<Vec<GitCommitFile>, GitError> {
        let output = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("diff-tree"),
                OsString::from("--root"),
                OsString::from("--first-parent"),
                OsString::from("--no-commit-id"),
                OsString::from("--name-status"),
                OsString::from("-r"),
                OsString::from("-z"),
                OsString::from("-M"),
                OsString::from("-C"),
                OsString::from(oid),
            ],
            READ_TIMEOUT,
        )?;
        Ok(parse_commit_files(&output.stdout))
    }

    fn commit_file_diff(
        &self,
        repository: &Path,
        oid: &str,
        path: &str,
    ) -> Result<GitCommitFileDiff, GitError> {
        let repository = self.repository_root(repository)?;
        let file = self
            .commit_files(&repository, oid)?
            .into_iter()
            .find(|file| file.path == path)
            .ok_or_else(|| GitError::Conflict("该文件不属于所选提交".into()))?;
        let parent_oid = commit_parent_oid(self, &repository, oid)?;
        let baseline_path = file.original_path.as_deref().unwrap_or(path);
        let before = match parent_oid.as_deref() {
            Some(parent) => tree_version(self, &repository, parent, baseline_path)?,
            None => missing_version(),
        };
        let after = tree_version(self, &repository, oid, path)?;
        Ok(GitCommitFileDiff {
            commit_oid: oid.to_owned(),
            parent_oid,
            path: file.path,
            original_path: file.original_path,
            status: file.status,
            before,
            after,
        })
    }

    fn change_diff(
        &self,
        repository: &Path,
        path: &str,
        staged: bool,
    ) -> Result<GitChangeDiff, GitError> {
        let repository = self.repository_root(repository)?;
        let snapshot = self.snapshot(&repository)?;
        let change = snapshot
            .changes
            .iter()
            .find(|change| change.path == path && change.staged == staged && !change.conflict)
            .cloned()
            .ok_or_else(|| GitError::Conflict("该更改已变化，请刷新后重试".into()))?;
        let baseline_path = change.original_path.as_deref().unwrap_or(path);
        let (scope, before_source, after_source, before, after) = if staged {
            (
                GitDiffScope::Staged,
                GitDiffSource::Head,
                GitDiffSource::Index,
                head_version(self, &repository, baseline_path)?,
                index_version(self, &repository, path)?,
            )
        } else {
            (
                GitDiffScope::Unstaged,
                GitDiffSource::Index,
                GitDiffSource::Worktree,
                index_version(self, &repository, baseline_path)?,
                worktree_version(&repository, path)?,
            )
        };
        Ok(GitChangeDiff {
            path: change.path,
            original_path: change.original_path,
            status: change.status,
            scope,
            before_source,
            after_source,
            before,
            after,
        })
    }

    fn conflict_detail(
        &self,
        repository: &Path,
        path: &str,
    ) -> Result<GitConflictDetail, GitError> {
        let repository = self.repository_root(repository)?;
        conflict_detail_local(self, &repository, path)
    }

    fn resolve_conflict(
        &self,
        repository: &Path,
        path: &str,
        resolution: &GitConflictResolution,
    ) -> Result<GitSnapshot, GitError> {
        let repository = self.repository_root(repository)?;
        let detail = conflict_detail_local(self, &repository, path)?;
        match resolution {
            GitConflictResolution::SaveText {
                content,
                expected_revision,
            } => {
                if !detail.editable || detail.result.revision != *expected_revision {
                    return Err(GitError::Conflict(
                        "冲突文件已在外部变化，请重新加载".into(),
                    ));
                }
                write_conflict_text(&repository, path, content.as_bytes())?;
                self.stage(&repository, &[path.to_owned()])
            }
            GitConflictResolution::UseCurrent => {
                ensure_regular_side(&detail.current, "当前版本不存在或不支持直接采用")?;
                self.checkout_conflict_side(&repository, path, "--ours")?;
                self.stage(&repository, &[path.to_owned()])
            }
            GitConflictResolution::UseIncoming => {
                ensure_regular_side(&detail.incoming, "传入版本不存在或不支持直接采用")?;
                self.checkout_conflict_side(&repository, path, "--theirs")?;
                self.stage(&repository, &[path.to_owned()])
            }
            GitConflictResolution::Delete => {
                if detail.current.kind != GitConflictContentKind::Missing
                    && detail.incoming.kind != GitConflictContentKind::Missing
                {
                    return Err(GitError::Conflict("该冲突不能直接选择删除结果".into()));
                }
                self.mutate(
                    &repository,
                    [
                        OsStr::new("--literal-pathspecs"),
                        OsStr::new("rm"),
                        OsStr::new("-f"),
                        OsStr::new("--"),
                        OsStr::new(path),
                    ],
                )
            }
            GitConflictResolution::MarkResolved => {
                if detail.result.kind == GitConflictContentKind::Missing {
                    return Err(GitError::Conflict("结果文件不存在，请选择删除结果".into()));
                }
                self.stage(&repository, &[path.to_owned()])
            }
        }
    }

    fn create_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(
            repository,
            [OsStr::new("switch"), OsStr::new("-c"), OsStr::new(name)],
        )
    }

    fn create_branch_from(
        &self,
        repository: &Path,
        name: &str,
        source_ref: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_branch_source_ref(source_ref)?;
        let current = self.snapshot(repository)?;
        if !current
            .branches
            .iter()
            .any(|branch| branch.ref_name == source_ref)
        {
            return Err(GitError::InvalidInput);
        }
        self.mutate(
            repository,
            [
                OsStr::new("switch"),
                OsStr::new("--no-track"),
                OsStr::new("-c"),
                OsStr::new(name),
                OsStr::new(source_ref),
            ],
        )
    }

    fn create_branch_from_commit(
        &self,
        repository: &Path,
        name: &str,
        oid: &str,
    ) -> Result<GitSnapshot, GitError> {
        crate::domain::git::validate_commit_oid(oid)?;
        self.mutate(
            repository,
            [
                OsStr::new("switch"),
                OsStr::new("--no-track"),
                OsStr::new("-c"),
                OsStr::new(name),
                OsStr::new(oid),
            ],
        )
    }

    fn rename_branch(
        &self,
        repository: &Path,
        ref_name: &str,
        new_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(ref_name)?;
        let current = self.snapshot(repository)?;
        let old_name = local_branch(&current, ref_name)?.name.clone();
        self.mutate(
            repository,
            [
                OsStr::new("branch"),
                OsStr::new("-m"),
                OsStr::new(&old_name),
                OsStr::new(new_name),
            ],
        )
    }

    fn delete_branch(&self, repository: &Path, ref_name: &str) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(ref_name)?;
        let current = self.snapshot(repository)?;
        let branch = local_branch(&current, ref_name)?;
        if branch.current {
            return Err(GitError::Conflict("不能删除当前分支".into()));
        }
        let name = branch.name.clone();
        self.mutate(
            repository,
            [OsStr::new("branch"), OsStr::new("-d"), OsStr::new(&name)],
        )
    }

    fn switch_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(repository, [OsStr::new("switch"), OsStr::new(name)])
    }

    fn fetch(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let repository = self.repository_root(repository)?;
        self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("fetch"),
                OsString::from("--all"),
                OsString::from("--prune"),
                OsString::from("--no-recurse-submodules"),
            ],
            FETCH_TIMEOUT,
        )?;
        self.snapshot(&repository)
    }

    fn pull(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        let (_, remote, target_ref) = current_tracking(&current)?;
        self.network_mutate(
            repository,
            [
                OsStr::new("pull"),
                OsStr::new("--ff-only"),
                OsStr::new("--no-rebase"),
                OsStr::new("--no-recurse-submodules"),
                OsStr::new(&remote),
                OsStr::new(&target_ref),
            ],
        )
    }

    fn push(&self, repository: &Path, remote: Option<&str>) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        let branch = current_local_branch(&current)?;
        let local_ref = branch.ref_name.clone();
        let (remote, target_ref, publish) = if let Some(remote) = remote {
            validate_remote_name(remote)?;
            if !current.remotes.iter().any(|candidate| candidate == remote) {
                return Err(GitError::InvalidInput);
            }
            (remote.to_owned(), local_ref.clone(), true)
        } else {
            let (_, remote, target_ref) = current_tracking(&current)?;
            (remote, target_ref, false)
        };
        let refspec = format!("{local_ref}:{target_ref}");
        if publish {
            self.network_mutate(
                repository,
                [
                    OsStr::new("push"),
                    OsStr::new("--set-upstream"),
                    OsStr::new(&remote),
                    OsStr::new(&refspec),
                ],
            )
        } else {
            self.network_mutate(
                repository,
                [
                    OsStr::new("push"),
                    OsStr::new(&remote),
                    OsStr::new(&refspec),
                ],
            )
        }
    }

    fn track_remote_branch(
        &self,
        repository: &Path,
        ref_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_remote_branch_ref(ref_name)?;
        let snapshot = self.snapshot(repository)?;
        if let Some(local) = find_tracking_local_branch(&snapshot.branches, ref_name) {
            return self.switch_branch(repository, &local.name);
        }
        let remote_name = snapshot
            .branches
            .iter()
            .find(|branch| branch.kind == GitBranchKind::Remote && branch.ref_name == ref_name)
            .map(|branch| branch.name.clone())
            .ok_or(GitError::InvalidInput)?;
        self.mutate(
            repository,
            [
                OsStr::new("switch"),
                OsStr::new("--track"),
                OsStr::new(&remote_name),
            ],
        )
    }

    fn merge_branch(&self, repository: &Path, source_ref: &str) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_merge_preconditions(&current, source_ref)?;
        let repository = self.repository_root(repository)?;
        let result = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("merge"),
                OsString::from("--no-edit"),
                OsString::from("--"),
                OsString::from(source_ref),
            ],
            MUTATION_TIMEOUT,
        );
        match result {
            Ok(_) => self.snapshot(&repository),
            Err(failure) => match self.snapshot(&repository) {
                Ok(snapshot) if snapshot.merge_in_progress => Ok(snapshot),
                _ => Err(failure),
            },
        }
    }

    fn continue_merge(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_continue_merge(&current)?;
        self.mutate(repository, ["merge", "--continue"])
    }

    fn abort_merge(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_abort_merge(&current)?;
        self.mutate(repository, ["merge", "--abort"])
    }

    fn initialize_submodule(&self, repository: &Path, path: &str) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_initialize_submodule(&current, path)?;
        self.network_mutate(
            repository,
            [
                OsStr::new("--literal-pathspecs"),
                OsStr::new("submodule"),
                OsStr::new("update"),
                OsStr::new("--init"),
                OsStr::new("--checkout"),
                OsStr::new("--"),
                OsStr::new(path),
            ],
        )
        .map_err(sanitize_submodule_operation_error)
    }

    fn checkout_submodule(&self, repository: &Path, path: &str) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        validate_checkout_submodule(&current, path)?;
        self.network_mutate(
            repository,
            [
                OsStr::new("--literal-pathspecs"),
                OsStr::new("submodule"),
                OsStr::new("update"),
                OsStr::new("--checkout"),
                OsStr::new("--"),
                OsStr::new(path),
            ],
        )
        .map_err(sanitize_submodule_operation_error)
    }
}

#[derive(Clone)]
struct GitBlobEntry {
    oid: String,
    mode: u32,
}

fn missing_version() -> GitConflictVersion {
    GitConflictVersion {
        kind: GitConflictContentKind::Missing,
        content: None,
        size: 0,
        mode: None,
    }
}

fn head_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    if !executor.has_head(repository) {
        return Ok(missing_version());
    }
    tree_version(executor, repository, "HEAD", path)
}

fn tree_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    revision: &str,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-tree"),
            OsString::from("-z"),
            OsString::from(revision),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let entry = parse_tree_entry(&output.stdout, path)?;
    entry.map_or_else(
        || Ok(missing_version()),
        |entry| blob_version(executor, repository, entry),
    )
}

fn commit_parent_oid(
    executor: &SystemGitExecutor,
    repository: &Path,
    oid: &str,
) -> Result<Option<String>, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("rev-list"),
            OsString::from("--parents"),
            OsString::from("-n"),
            OsString::from("1"),
            OsString::from(oid),
        ],
        READ_TIMEOUT,
    )?;
    let line = String::from_utf8_lossy(&output.stdout);
    let mut fields = line.split_whitespace();
    let commit = fields.next().ok_or(GitError::Io)?;
    if commit != oid {
        return Err(GitError::Io);
    }
    Ok(fields.next().map(str::to_owned))
}

fn index_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-files"),
            OsString::from("--stage"),
            OsString::from("-z"),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let entry = parse_index_entry(&output.stdout, path)?;
    entry.map_or_else(
        || Ok(missing_version()),
        |entry| blob_version(executor, repository, entry),
    )
}

fn parse_tree_entry(bytes: &[u8], path: &str) -> Result<Option<GitBlobEntry>, GitError> {
    let Some(record) = bytes
        .split(|byte| *byte == 0)
        .find(|record| !record.is_empty())
    else {
        return Ok(None);
    };
    let mut pieces = record.splitn(2, |byte| *byte == b'\t');
    let metadata = pieces.next().ok_or(GitError::Io)?;
    if pieces.next().ok_or(GitError::Io)? != path.as_bytes() {
        return Ok(None);
    }
    let metadata = String::from_utf8_lossy(metadata);
    let fields = metadata.split_whitespace().collect::<Vec<_>>();
    Ok(Some(GitBlobEntry {
        mode: fields
            .first()
            .and_then(|value| u32::from_str_radix(value, 8).ok())
            .ok_or(GitError::Io)?,
        oid: fields.get(2).ok_or(GitError::Io)?.to_string(),
    }))
}

fn parse_index_entry(bytes: &[u8], path: &str) -> Result<Option<GitBlobEntry>, GitError> {
    for record in bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let mut pieces = record.splitn(2, |byte| *byte == b'\t');
        let metadata = pieces.next().ok_or(GitError::Io)?;
        if pieces.next().ok_or(GitError::Io)? != path.as_bytes() {
            continue;
        }
        let metadata = String::from_utf8_lossy(metadata);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.get(2) != Some(&"0") {
            continue;
        }
        return Ok(Some(GitBlobEntry {
            mode: fields
                .first()
                .and_then(|value| u32::from_str_radix(value, 8).ok())
                .ok_or(GitError::Io)?,
            oid: fields.get(1).ok_or(GitError::Io)?.to_string(),
        }));
    }
    Ok(None)
}

fn blob_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    entry: GitBlobEntry,
) -> Result<GitConflictVersion, GitError> {
    if !is_regular_mode(entry.mode) {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(entry.mode),
        });
    }
    let size_output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("-s"),
            OsString::from(&entry.oid),
        ],
        READ_TIMEOUT,
    )?;
    let size = String::from_utf8_lossy(&size_output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|_| GitError::Io)?;
    if size > MAX_GIT_DIFF_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(entry.mode),
        });
    }
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("blob"),
            OsString::from(&entry.oid),
        ],
        READ_TIMEOUT,
    )?;
    let content = std::str::from_utf8(&output.stdout)
        .ok()
        .filter(|_| !output.stdout.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(entry.mode),
    })
}

fn worktree_version(repository: &Path, path: &str) -> Result<GitConflictVersion, GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(missing_version()),
        Err(_) => return Err(GitError::Io),
    };
    if !metadata.file_type().is_file() {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: metadata.len(),
            mode: None,
        });
    }
    let size = metadata.len();
    if size > MAX_GIT_DIFF_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(0o100644),
        });
    }
    let bytes = fs::read(target).map_err(|_| GitError::Io)?;
    let content = std::str::from_utf8(&bytes)
        .ok()
        .filter(|_| !bytes.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(0o100644),
    })
}

#[derive(Clone, Copy)]
struct ConflictStage {
    stage: u8,
    mode: u32,
}

fn conflict_detail_local(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictDetail, GitError> {
    let snapshot = executor.snapshot(repository)?;
    if !snapshot.merge_in_progress {
        return Err(GitError::Conflict("当前仓库没有未完成的合并".into()));
    }
    if snapshot.merge_head_oid.is_none() {
        return Err(GitError::Conflict(
            "多来源合并冲突需要使用终端或外部 Git 工具处理".into(),
        ));
    }
    let change = snapshot
        .changes
        .iter()
        .find(|change| change.conflict && change.path == path)
        .ok_or_else(|| GitError::Conflict("该路径不再是未解决冲突".into()))?;
    let stages = conflict_stages(executor, repository, path)?;
    let base = conflict_stage_version(executor, repository, path, &stages, 1)?;
    let current = conflict_stage_version(executor, repository, path, &stages, 2)?;
    let incoming = conflict_stage_version(executor, repository, path, &stages, 3)?;
    let result = conflict_result(repository, path)?;
    let kind = change.conflict_kind.unwrap_or(GitConflictKind::Other);
    Ok(build_conflict_detail(
        path.to_owned(),
        kind,
        base,
        current,
        incoming,
        result,
    ))
}

pub(crate) fn build_conflict_detail(
    path: String,
    kind: GitConflictKind,
    base: GitConflictVersion,
    current: GitConflictVersion,
    incoming: GitConflictVersion,
    result: GitConflictResult,
) -> GitConflictDetail {
    let supported_kind = !matches!(kind, GitConflictKind::Other | GitConflictKind::BothDeleted);
    let versions_textual = [&base, &current, &incoming].iter().all(|version| {
        matches!(
            version.kind,
            GitConflictContentKind::Missing | GitConflictContentKind::Text
        )
    });
    let editable = supported_kind
        && versions_textual
        && result.kind == GitConflictContentKind::Text
        && result.mode.is_some_and(is_regular_mode);
    let unsupported_reason = if editable
        || [current.kind, incoming.kind].iter().any(|kind| {
            matches!(
                kind,
                GitConflictContentKind::Text | GitConflictContentKind::Binary
            )
        }) {
        None
    } else if matches!(kind, GitConflictKind::Other | GitConflictKind::BothDeleted) {
        Some("该冲突类型需要使用终端或外部 Git 工具处理".into())
    } else {
        Some("该文件类型不支持应用内编辑".into())
    };
    GitConflictDetail {
        path,
        kind,
        base,
        current,
        incoming,
        result,
        editable,
        unsupported_reason,
    }
}

fn conflict_stages(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<Vec<ConflictStage>, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-files"),
            OsString::from("--unmerged"),
            OsString::from("-z"),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let mut stages = Vec::new();
    for record in output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let mut parts = record.splitn(2, |byte| *byte == b'\t');
        let metadata = parts.next().ok_or(GitError::Io)?;
        let record_path = parts.next().ok_or(GitError::Io)?;
        if record_path != path.as_bytes() {
            continue;
        }
        let metadata = String::from_utf8_lossy(metadata);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        let mode = fields
            .first()
            .and_then(|value| u32::from_str_radix(value, 8).ok())
            .ok_or(GitError::Io)?;
        let stage = fields
            .get(2)
            .and_then(|value| value.parse::<u8>().ok())
            .ok_or(GitError::Io)?;
        stages.push(ConflictStage { stage, mode });
    }
    if stages.is_empty() {
        return Err(GitError::Conflict("该路径不再是未解决冲突".into()));
    }
    Ok(stages)
}

fn conflict_stage_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
    stages: &[ConflictStage],
    stage: u8,
) -> Result<GitConflictVersion, GitError> {
    let Some(entry) = stages.iter().find(|entry| entry.stage == stage) else {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Missing,
            content: None,
            size: 0,
            mode: None,
        });
    };
    if !is_regular_mode(entry.mode) {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(entry.mode),
        });
    }
    let object = format!(":{stage}:{path}");
    let size_output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("-s"),
            OsString::from(&object),
        ],
        READ_TIMEOUT,
    )?;
    let size = String::from_utf8_lossy(&size_output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|_| GitError::Io)?;
    if size > MAX_CONFLICT_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(entry.mode),
        });
    }
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("blob"),
            OsString::from(object),
        ],
        READ_TIMEOUT,
    )?;
    let content = std::str::from_utf8(&output.stdout)
        .ok()
        .filter(|_| !output.stdout.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(entry.mode),
    })
}

fn conflict_result(repository: &Path, path: &str) -> Result<GitConflictResult, GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(GitConflictResult {
                kind: GitConflictContentKind::Missing,
                content: None,
                revision: "missing".into(),
                size: 0,
                mode: None,
            });
        }
        Err(_) => return Err(GitError::Io),
    };
    if !metadata.file_type().is_file() {
        return Ok(GitConflictResult {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            revision: "unsupported".into(),
            size: metadata.len(),
            mode: None,
        });
    }
    if metadata.len() > MAX_CONFLICT_TEXT_BYTES as u64 {
        return Ok(GitConflictResult {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            revision: format!("oversize:{}", metadata.len()),
            size: metadata.len(),
            mode: Some(0o100644),
        });
    }
    let bytes = fs::read(target).map_err(|_| GitError::Io)?;
    let content = std::str::from_utf8(&bytes)
        .ok()
        .filter(|_| !bytes.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictResult {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        revision: content_revision(&bytes),
        size: bytes.len() as u64,
        mode: Some(0o100644),
    })
}

fn conflict_worktree_path(repository: &Path, path: &str) -> Result<PathBuf, GitError> {
    let root = repository
        .canonicalize()
        .map_err(|_| GitError::InvalidPath)?;
    let target = root.join(path);
    let parent = target.parent().ok_or(GitError::InvalidPath)?;
    let parent = parent.canonicalize().map_err(|_| GitError::InvalidPath)?;
    if !parent.starts_with(&root) {
        return Err(GitError::InvalidPath);
    }
    if target.exists() {
        let canonical = target.canonicalize().map_err(|_| GitError::InvalidPath)?;
        if !canonical.starts_with(&root) {
            return Err(GitError::InvalidPath);
        }
    }
    Ok(target)
}

fn write_conflict_text(repository: &Path, path: &str, bytes: &[u8]) -> Result<(), GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let mut file = AtomicWriteFile::open(&target).map_err(|_| GitError::Io)?;
    file.write_all(bytes).map_err(|_| GitError::Io)?;
    file.commit().map_err(|_| GitError::Io)
}

fn ensure_regular_side(version: &GitConflictVersion, message: &str) -> Result<(), GitError> {
    if version.mode.is_some_and(is_regular_mode)
        && matches!(
            version.kind,
            GitConflictContentKind::Text | GitConflictContentKind::Binary
        )
    {
        Ok(())
    } else {
        Err(GitError::Conflict(message.into()))
    }
}

fn is_regular_mode(mode: u32) -> bool {
    matches!(mode, 0o100644 | 0o100755)
}

fn local_branch<'a>(snapshot: &'a GitSnapshot, ref_name: &str) -> Result<&'a GitBranch, GitError> {
    snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.ref_name == ref_name)
        .ok_or(GitError::InvalidInput)
}

fn current_local_branch(snapshot: &GitSnapshot) -> Result<&GitBranch, GitError> {
    if snapshot.head.detached || snapshot.head.unborn {
        return Err(GitError::Conflict(
            "当前 HEAD 未指向可同步的本地分支".into(),
        ));
    }
    snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.current)
        .ok_or_else(|| GitError::Conflict("当前 HEAD 未指向可同步的本地分支".into()))
}

fn current_tracking(snapshot: &GitSnapshot) -> Result<(String, String, String), GitError> {
    let branch = current_local_branch(snapshot)?;
    let upstream_ref = branch
        .upstream_ref
        .as_deref()
        .ok_or_else(|| GitError::Conflict("当前分支尚未设置 upstream".into()))?;
    let mut remotes = snapshot.remotes.iter().collect::<Vec<_>>();
    remotes.sort_by_key(|remote| std::cmp::Reverse(remote.len()));
    for remote in remotes {
        let prefix = format!("refs/remotes/{remote}/");
        if let Some(target) = upstream_ref.strip_prefix(&prefix) {
            validate_remote_name(remote)?;
            crate::domain::git::validate_branch_name(target)?;
            return Ok((
                branch.ref_name.clone(),
                remote.clone(),
                format!("refs/heads/{target}"),
            ));
        }
    }
    Err(GitError::Conflict("当前分支的 upstream 无法解析".into()))
}

fn parse_remotes(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .filter(|name| validate_remote_name(name).is_ok())
        .map(str::to_owned)
        .collect()
}

fn candidates() -> Vec<PathBuf> {
    let mut values = Vec::new();
    if let Some(configured) = std::env::var_os("QTERM_GIT_PATH") {
        values.push(PathBuf::from(configured));
    }
    values.push(PathBuf::from(if cfg!(windows) { "git.exe" } else { "git" }));
    if cfg!(windows) {
        for variable in [
            "ProgramW6432",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "LocalAppData",
        ] {
            if let Some(root) = std::env::var_os(variable) {
                let root = PathBuf::from(root);
                values.push(if variable == "LocalAppData" {
                    root.join("Programs/Git/cmd/git.exe")
                } else {
                    root.join("Git/cmd/git.exe")
                });
            }
        }
    } else {
        values.extend(
            [
                "/usr/bin/git",
                "/usr/local/bin/git",
                "/opt/homebrew/bin/git",
            ]
            .map(PathBuf::from),
        );
    }
    values
}

fn run_process<I, S>(
    executable: &Path,
    args: I,
    timeout: Duration,
) -> Result<ProcessOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut child = Command::new(executable)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitError::Missing
            } else {
                GitError::Io
            }
        })?;
    let stdout = child.stdout.take().ok_or(GitError::Io)?;
    let stderr = child.stderr.take().ok_or(GitError::Io)?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|_| GitError::Io)? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitError::Timeout);
            }
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    let stdout = stdout_reader.join().map_err(|_| GitError::Io)??;
    let stderr = stderr_reader.join().map_err(|_| GitError::Io)??;
    if !status.success() {
        return Err(classify_failure(&stderr));
    }
    Ok(ProcessOutput { stdout })
}

fn read_bounded(mut reader: impl Read) -> Result<Vec<u8>, GitError> {
    let mut result = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut exceeded = false;
    loop {
        let read = reader.read(&mut buffer).map_err(|_| GitError::Io)?;
        if read == 0 {
            break;
        }
        if result.len() + read <= OUTPUT_LIMIT {
            result.extend_from_slice(&buffer[..read]);
        } else {
            exceeded = true;
        }
    }
    if exceeded {
        Err(GitError::OutputTooLarge)
    } else {
        Ok(result)
    }
}

pub(crate) fn classify_failure(stderr: &[u8]) -> GitError {
    let raw = String::from_utf8_lossy(stderr);
    let sanitized = redact_url_userinfo(raw.trim());
    let detail = sanitized.chars().take(1200).collect::<String>();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("not a git repository") {
        GitError::NotRepository
    } else if lower.contains("dubious ownership") || lower.contains("safe.directory") {
        GitError::Conflict("仓库所有权未被 Git 信任，请先在终端配置 safe.directory".into())
    } else if lower.contains("would be overwritten")
        || lower.contains("resolve your current index first")
    {
        GitError::Conflict(detail)
    } else {
        GitError::CommandFailed(detail)
    }
}

pub(crate) fn sanitize_submodule_operation_error(error: GitError) -> GitError {
    match error {
        GitError::CommandFailed(_) | GitError::Conflict(_) => {
            GitError::CommandFailed("子仓库操作失败，请检查执行主机的 Git 配置与凭据".into())
        }
        other => other,
    }
}

pub(crate) fn redact_url_userinfo(value: &str) -> String {
    let mut result = value.to_owned();
    let mut search_from = 0;
    loop {
        let lower = result.to_ascii_lowercase();
        let match_index = ["https://", "http://", "ssh://"]
            .iter()
            .filter_map(|scheme| {
                lower[search_from..]
                    .find(scheme)
                    .map(|index| search_from + index)
            })
            .min();
        let Some(scheme_start) = match_index else {
            break;
        };
        let authority_start = result[scheme_start..]
            .find("://")
            .map(|index| scheme_start + index + 3)
            .unwrap_or(result.len());
        let authority_end = result[authority_start..]
            .find(|character: char| {
                character == '/'
                    || character.is_whitespace()
                    || matches!(character, '\'' | '"' | ')' | ']')
            })
            .map(|index| authority_start + index)
            .unwrap_or(result.len());
        let userinfo_end = result[authority_start..authority_end]
            .rfind('@')
            .map(|index| authority_start + index);
        if let Some(userinfo_end) = userinfo_end {
            result.replace_range(authority_start..=userinfo_end, "***@");
            search_from = authority_start + 4;
        } else {
            search_from = authority_end.max(authority_start + 1);
        }
        if search_from >= result.len() {
            break;
        }
    }
    result
}

pub(crate) fn parse_status(bytes: &[u8]) -> Result<(GitHead, Vec<GitChange>), GitError> {
    let mut head = GitHead {
        name: None,
        oid: None,
        detached: false,
        unborn: false,
        upstream: None,
        ahead: 0,
        behind: 0,
    };
    let mut changes = Vec::new();
    let chunks = bytes.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut index = 0;
    while index < chunks.len() {
        let line = String::from_utf8_lossy(chunks[index]);
        if !line.is_empty() {
            if line.starts_with("# ") {
                parse_status_header(&mut head, &line);
            } else if let Some(path) = line.strip_prefix("? ") {
                changes.push(GitChange {
                    path: path.into(),
                    original_path: None,
                    status: "U".into(),
                    staged: false,
                    conflict: false,
                    conflict_kind: None,
                    submodule: None,
                });
            } else if line.starts_with("1 ") || line.starts_with("2 ") {
                let rename = line.starts_with("2 ");
                let fields = line
                    .splitn(if rename { 10 } else { 9 }, ' ')
                    .collect::<Vec<_>>();
                let xy = fields.get(1).copied().unwrap_or("..");
                let submodule = parse_submodule_change(&fields);
                let path = fields.last().copied().unwrap_or("").to_owned();
                let original_path = if rename {
                    chunks
                        .get(index + 1)
                        .map(|value| String::from_utf8_lossy(value).into_owned())
                } else {
                    None
                };
                push_xy_changes(&mut changes, path, original_path, xy, submodule);
                if rename {
                    index += 1;
                }
            } else if line.starts_with("u ") {
                let fields = line.splitn(11, ' ').collect::<Vec<_>>();
                let xy = fields.get(1).copied().unwrap_or("..");
                let submodule = parse_submodule_change(&fields);
                let path = fields.last().copied().unwrap_or("").to_owned();
                changes.push(GitChange {
                    path,
                    original_path: None,
                    status: "!".into(),
                    staged: false,
                    conflict: true,
                    conflict_kind: Some(GitConflictKind::from_xy(xy)),
                    submodule,
                });
            }
        }
        index += 1;
    }
    Ok((head, changes))
}

fn parse_status_header(head: &mut GitHead, line: &str) {
    if let Some(value) = line.strip_prefix("# branch.oid ") {
        if value == "(initial)" {
            head.unborn = true;
        } else {
            head.oid = Some(value.into());
        }
    } else if let Some(value) = line.strip_prefix("# branch.head ") {
        if value == "(detached)" {
            head.detached = true;
        } else {
            head.name = Some(value.into());
        }
    } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
        head.upstream = Some(value.into());
    } else if let Some(value) = line.strip_prefix("# branch.ab ") {
        for part in value.split_whitespace() {
            if let Some(value) = part.strip_prefix('+') {
                head.ahead = value.parse().unwrap_or(0);
            }
            if let Some(value) = part.strip_prefix('-') {
                head.behind = value.parse().unwrap_or(0);
            }
        }
    }
}

fn push_xy_changes(
    changes: &mut Vec<GitChange>,
    path: String,
    original_path: Option<String>,
    xy: &str,
    submodule: Option<GitSubmoduleChange>,
) {
    let mut values = xy.chars();
    let staged = values.next().unwrap_or('.');
    let unstaged = values.next().unwrap_or('.');
    let conflict = matches!(
        (staged, unstaged),
        ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')
    );
    if conflict {
        changes.push(GitChange {
            path,
            original_path,
            status: "!".into(),
            staged: false,
            conflict: true,
            conflict_kind: Some(GitConflictKind::from_xy(xy)),
            submodule,
        });
        return;
    }
    if staged != '.' {
        changes.push(GitChange {
            path: path.clone(),
            original_path: original_path.clone(),
            status: staged.to_string(),
            staged: true,
            conflict: false,
            conflict_kind: None,
            submodule: submodule.clone(),
        });
    }
    if unstaged != '.' {
        changes.push(GitChange {
            path,
            original_path,
            status: unstaged.to_string(),
            staged: false,
            conflict: false,
            conflict_kind: None,
            submodule,
        });
    }
}

fn parse_submodule_change(fields: &[&str]) -> Option<GitSubmoduleChange> {
    let marker = fields.get(2).copied().unwrap_or("N...");
    let is_gitlink = fields.iter().skip(3).take(4).any(|mode| *mode == "160000");
    if !is_gitlink && !marker.starts_with('S') {
        return None;
    }
    let marker = marker.as_bytes();
    Some(GitSubmoduleChange {
        commit_changed: marker.get(1) == Some(&b'C'),
        tracked_modified: marker.get(2) == Some(&b'M'),
        untracked_content: marker.get(3) == Some(&b'U'),
    })
}

#[derive(Clone)]
struct GitlinkEntry {
    oid: String,
}

#[derive(Clone)]
struct SubmoduleStatusEntry {
    oid: Option<String>,
    initialized: bool,
    conflict: bool,
}

pub(crate) fn parse_submodules(
    index: &[u8],
    config: Option<&[u8]>,
    status: Option<&[u8]>,
    changes: &[GitChange],
) -> Result<Vec<GitSubmodule>, GitError> {
    let mut gitlinks = std::collections::BTreeMap::<String, GitlinkEntry>::new();
    for record in index
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.first() != Some(&"160000") || fields.get(2) != Some(&"0") {
            continue;
        }
        let Some(oid) = fields.get(1) else { continue };
        let path = String::from_utf8_lossy(&record[tab + 1..]).into_owned();
        gitlinks.insert(path, GitlinkEntry { oid: (*oid).into() });
    }

    let mut configured = Vec::<(String, String)>::new();
    if let Some(config) = config {
        for record in config
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
        {
            let value = String::from_utf8_lossy(record);
            let Some((key, path)) = value.split_once('\n') else {
                continue;
            };
            let Some(name) = key
                .strip_prefix("submodule.")
                .and_then(|key| key.strip_suffix(".path"))
            else {
                continue;
            };
            configured.push((name.to_owned(), path.to_owned()));
        }
    }

    let known_paths = gitlinks
        .keys()
        .chain(configured.iter().map(|(_, path)| path))
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    if known_paths.len() > MAX_GIT_SUBMODULES {
        return Err(GitError::OutputTooLarge);
    }
    let statuses = status.map(|value| parse_submodule_status(value, &known_paths));
    let mut path_counts = std::collections::HashMap::<String, usize>::new();
    let mut name_counts = std::collections::HashMap::<String, usize>::new();
    for (name, path) in &configured {
        *path_counts.entry(path.clone()).or_default() += 1;
        *name_counts.entry(name.clone()).or_default() += 1;
    }

    let mut submodules = Vec::with_capacity(known_paths.len());
    for path in known_paths {
        let definitions = configured
            .iter()
            .filter(|(_, candidate)| candidate == &path)
            .collect::<Vec<_>>();
        let gitlink = gitlinks.get(&path);
        let state = statuses.as_ref().and_then(|entries| entries.get(&path));
        let mut change = GitSubmoduleChange::default();
        let mut conflict = state.is_some_and(|state| state.conflict);
        for item in changes.iter().filter(|change| change.path == path) {
            if let Some(item_state) = &item.submodule {
                change.commit_changed |= item_state.commit_changed;
                change.tracked_modified |= item_state.tracked_modified;
                change.untracked_content |= item_state.untracked_content;
            }
            conflict |= item.conflict;
        }
        let invalid_path = path.is_empty()
            || path.starts_with('/')
            || path.contains('\0')
            || path.chars().any(char::is_control)
            || path.split('/').any(|segment| segment == "..");
        let issue = if invalid_path {
            Some(GitSubmoduleIssue::InvalidPath)
        } else if path_counts.get(&path).copied().unwrap_or(0) > 1
            || definitions
                .iter()
                .any(|(name, _)| name_counts.get(name).copied().unwrap_or(0) > 1)
        {
            Some(GitSubmoduleIssue::DuplicatePath)
        } else if gitlink.is_none() {
            Some(GitSubmoduleIssue::MissingGitlink)
        } else if definitions.is_empty() {
            Some(GitSubmoduleIssue::MissingConfiguration)
        } else if status.is_none() || state.is_none() {
            Some(GitSubmoduleIssue::Unreadable)
        } else {
            None
        };
        let current_oid = state.and_then(|state| state.oid.clone());
        let recorded_oid = gitlink.map(|entry| entry.oid.clone());
        let initialized = state.is_some_and(|state| state.initialized);
        let commit_changed = initialized && current_oid.is_some() && current_oid != recorded_oid;
        submodules.push(GitSubmodule {
            name: definitions
                .first()
                .map(|(name, _)| name.clone())
                .unwrap_or_else(|| path.clone()),
            path,
            recorded_oid,
            current_oid,
            initialized,
            commit_changed: commit_changed || change.commit_changed,
            tracked_modified: change.tracked_modified,
            untracked_content: change.untracked_content,
            conflict,
            issue,
        });
    }
    Ok(submodules)
}

fn parse_submodule_status(
    bytes: &[u8],
    known_paths: &std::collections::BTreeSet<String>,
) -> std::collections::HashMap<String, SubmoduleStatusEntry> {
    let mut result = std::collections::HashMap::new();
    for line in String::from_utf8_lossy(bytes).lines() {
        let mut chars = line.chars();
        let Some(prefix) = chars.next() else { continue };
        if !matches!(prefix, ' ' | '-' | '+' | 'U') {
            continue;
        }
        let remainder = chars.as_str();
        let Some(space) = remainder.find(' ') else {
            continue;
        };
        let oid = &remainder[..space];
        if !matches!(oid.len(), 40 | 64) || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        let tail = &remainder[space + 1..];
        let quoted_path = parse_git_quoted_path(tail);
        let path = quoted_path
            .as_ref()
            .and_then(|path| known_paths.get(path))
            .or_else(|| {
                known_paths
                    .iter()
                    .filter(|path| {
                        tail == path.as_str()
                            || tail
                                .strip_prefix(path.as_str())
                                .is_some_and(|suffix| suffix.starts_with(" ("))
                    })
                    .max_by_key(|path| path.len())
            });
        if let Some(path) = path {
            result.insert(
                path.clone(),
                SubmoduleStatusEntry {
                    oid: (prefix != '-').then(|| oid.to_owned()),
                    initialized: prefix != '-',
                    conflict: prefix == 'U',
                },
            );
        }
    }
    result
}

fn parse_git_quoted_path(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    if bytes.first() != Some(&b'"') {
        return None;
    }
    let mut result = Vec::new();
    let mut index = 1;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                let suffix = &value[index + 1..];
                return (suffix.is_empty() || suffix.starts_with(" ("))
                    .then(|| String::from_utf8_lossy(&result).into_owned());
            }
            b'\\' => {
                index += 1;
                let escaped = *bytes.get(index)?;
                if escaped.is_ascii_digit() && escaped < b'8' {
                    let digits = bytes.get(index..index + 3)?;
                    if digits.iter().all(|digit| (b'0'..=b'7').contains(digit)) {
                        let octal = u16::from(digits[0] - b'0') * 64
                            + u16::from(digits[1] - b'0') * 8
                            + u16::from(digits[2] - b'0');
                        result.push(u8::try_from(octal).ok()?);
                        index += 3;
                        continue;
                    }
                }
                result.push(match escaped {
                    b'a' => 0x07,
                    b'b' => 0x08,
                    b't' => b'\t',
                    b'n' => b'\n',
                    b'v' => 0x0b,
                    b'f' => 0x0c,
                    b'r' => b'\r',
                    b'\\' => b'\\',
                    b'"' => b'"',
                    _ => return None,
                });
            }
            byte => result.push(byte),
        }
        index += 1;
    }
    None
}

pub(crate) fn parse_branches(bytes: &[u8]) -> Vec<GitBranch> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| {
            let fields = line.split('\0').collect::<Vec<_>>();
            let ref_name = fields.first()?.trim();
            let (kind, name) = if let Some(name) = ref_name.strip_prefix("refs/heads/") {
                (GitBranchKind::Local, name)
            } else {
                let name = ref_name.strip_prefix("refs/remotes/")?;
                (GitBranchKind::Remote, name)
            };
            if name.is_empty() || fields.get(6).is_some_and(|value| !value.trim().is_empty()) {
                return None;
            }
            Some(GitBranch {
                ref_name: ref_name.into(),
                name: name.into(),
                kind,
                oid: fields.get(2).unwrap_or(&"").to_string(),
                current: kind == GitBranchKind::Local
                    && fields.get(3).is_some_and(|value| value.trim() == "*"),
                upstream: fields
                    .get(4)
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| value.trim().into()),
                upstream_ref: fields
                    .get(5)
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| value.trim().into()),
            })
        })
        .collect()
}

pub(crate) fn parse_commits(bytes: &[u8]) -> Vec<GitCommit> {
    String::from_utf8_lossy(bytes)
        .split('\u{1e}')
        .filter_map(|record| {
            let fields = record
                .trim_matches('\n')
                .split('\u{1f}')
                .collect::<Vec<_>>();
            if fields.len() < 6 || fields[0].is_empty() {
                return None;
            }
            Some(GitCommit {
                oid: fields[0].into(),
                parents: fields[1].split_whitespace().map(str::to_owned).collect(),
                decorations: fields[2]
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned)
                    .collect(),
                subject: fields[3].into(),
                author: fields[4].into(),
                timestamp: fields[5].parse().unwrap_or(0),
                body: fields
                    .get(6..)
                    .map(|parts| parts.join("\u{1f}").trim_end_matches('\n').to_owned())
                    .unwrap_or_default(),
            })
        })
        .collect()
}

pub(crate) fn parse_commit_files(bytes: &[u8]) -> Vec<GitCommitFile> {
    let fields = bytes
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = String::from_utf8_lossy(fields[index])
            .trim_matches(['\r', '\n'])
            .to_owned();
        index += 1;
        if status.is_empty() {
            continue;
        }
        let renamed_or_copied = matches!(status.as_bytes().first(), Some(b'R' | b'C'));
        let original_path = if renamed_or_copied {
            let Some(field) = fields.get(index) else {
                break;
            };
            index += 1;
            Some(String::from_utf8_lossy(field).into_owned())
        } else {
            None
        };
        let Some(field) = fields.get(index) else {
            break;
        };
        index += 1;
        let path = String::from_utf8_lossy(field).into_owned();
        if path.is_empty() {
            continue;
        }
        files.push(GitCommitFile {
            path,
            original_path,
            status,
        });
    }
    files
}

#[cfg(test)]
mod tests {
    use super::{
        OUTPUT_LIMIT, SystemGitExecutor, classify_failure, parse_branches, parse_commit_files,
        parse_commits, parse_status, parse_submodules, read_bounded, run_process,
        sanitize_submodule_operation_error,
    };
    use crate::domain::git::{
        GitBranchKind, GitConflictContentKind, GitConflictKind, GitConflictResolution,
        GitDiffSource, GitError, GitSubmoduleIssue, MAX_CONFLICT_TEXT_BYTES,
        find_tracking_local_branch,
    };
    use crate::ports::git_executor::GitExecutor;
    use std::{fs, io::Cursor, process::Command};
    use tempfile::tempdir;

    #[test]
    fn parses_porcelain_v2_headers_and_dual_staged_worktree_changes() {
        let fixture = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0\x31 MM N... 100644 100644 100644 a b file.txt\0? new.txt\0";
        let (head, changes) = parse_status(fixture).expect("status");
        assert_eq!(head.name.as_deref(), Some("main"));
        assert_eq!((head.ahead, head.behind), (2, 1));
        assert_eq!(changes.len(), 3);
        assert!(
            changes
                .iter()
                .any(|change| change.path == "file.txt" && change.staged)
        );
        assert!(
            changes
                .iter()
                .any(|change| change.path == "file.txt" && !change.staged)
        );
    }

    #[test]
    fn parses_submodule_gitlink_configuration_and_dirty_state() {
        let recorded = "1111111111111111111111111111111111111111";
        let current = "2222222222222222222222222222222222222222";
        let fixture =
            format!("1 .M SCMU 160000 160000 160000 {recorded} {recorded} modules/child\0");
        let (_, changes) = parse_status(fixture.as_bytes()).expect("submodule status record");
        let index = format!("160000 {recorded} 0\tmodules/child\0");
        let config = b"submodule.child.path\nmodules/child\0";
        let status = format!("+{current} modules/child (heads/main)\n");

        let submodules = parse_submodules(
            index.as_bytes(),
            Some(config),
            Some(status.as_bytes()),
            &changes,
        )
        .expect("submodules");

        assert_eq!(submodules.len(), 1);
        let submodule = &submodules[0];
        assert_eq!(submodule.name, "child");
        assert_eq!(submodule.path, "modules/child");
        assert_eq!(submodule.recorded_oid.as_deref(), Some(recorded));
        assert_eq!(submodule.current_oid.as_deref(), Some(current));
        assert!(submodule.initialized);
        assert!(submodule.commit_changed);
        assert!(submodule.tracked_modified);
        assert!(submodule.untracked_content);
        assert_eq!(submodule.issue, None);
        assert!(changes[0].submodule.as_ref().is_some_and(|change| {
            change.commit_changed && change.tracked_modified && change.untracked_content
        }));
    }

    #[test]
    fn classifies_incomplete_submodule_metadata() {
        let recorded = "1111111111111111111111111111111111111111";
        let index = format!("160000 {recorded} 0\tmodules/missing-config\0");
        let status = format!("-{recorded} modules/missing-config\n");
        let missing_config = parse_submodules(index.as_bytes(), None, Some(status.as_bytes()), &[])
            .expect("missing configuration");
        assert_eq!(
            missing_config[0].issue,
            Some(GitSubmoduleIssue::MissingConfiguration)
        );
        assert!(!missing_config[0].initialized);

        let orphan_config = parse_submodules(
            b"",
            Some(b"submodule.orphan.path\nmodules/orphan\0"),
            Some(b""),
            &[],
        )
        .expect("orphan configuration");
        assert_eq!(
            orphan_config[0].issue,
            Some(GitSubmoduleIssue::MissingGitlink)
        );

        let duplicate_name_index = format!(
            "160000 {recorded} 0\tmodules/one\0\
             160000 {recorded} 0\tmodules/two\0"
        );
        let duplicate_name_config =
            b"submodule.child.path\nmodules/one\0submodule.child.path\nmodules/two\0";
        let duplicate_name_status = format!(" {recorded} modules/one\n {recorded} modules/two\n");
        let duplicate_name = parse_submodules(
            duplicate_name_index.as_bytes(),
            Some(duplicate_name_config),
            Some(duplicate_name_status.as_bytes()),
            &[],
        )
        .expect("duplicate name");
        assert!(
            duplicate_name
                .iter()
                .all(|submodule| { submodule.issue == Some(GitSubmoduleIssue::DuplicatePath) })
        );
    }

    #[test]
    fn parses_git_quoted_unicode_submodule_paths() {
        let recorded = "1111111111111111111111111111111111111111";
        let path = "modules/中文 child";
        let index = format!("160000 {recorded} 0\t{path}\0");
        let config = format!("submodule.child.path\n{path}\0");
        let status =
            format!(" {recorded} \"modules/\\344\\270\\255\\346\\226\\207 child\" (heads/main)\n");

        let submodules = parse_submodules(
            index.as_bytes(),
            Some(config.as_bytes()),
            Some(status.as_bytes()),
            &[],
        )
        .expect("quoted path");
        assert_eq!(submodules.len(), 1);
        assert_eq!(submodules[0].path, path);
        assert!(submodules[0].initialized);
        assert_eq!(submodules[0].issue, None);
    }

    #[test]
    fn submodule_operation_failures_do_not_expose_repository_urls() {
        let error = sanitize_submodule_operation_error(GitError::CommandFailed(
            "clone of 'https://user:secret@example.com/private.git' failed".into(),
        ));
        let GitError::CommandFailed(detail) = error else {
            panic!("expected command failure");
        };
        assert!(!detail.contains("http"));
        assert!(!detail.contains("example.com"));
        assert!(!detail.contains("secret"));
    }

    #[test]
    fn parses_renames_conflicts_branches_and_merge_metadata() {
        let fixture = b"# branch.oid abc\0# branch.head feature/test\0\x32 R. N... 100644 100644 100644 a b R100 renamed.txt\0old.txt\0u UU N... 100644 100644 100644 100644 a b c conflict.txt\0u AA N... 000000 100644 100644 100644 0 b c added.txt\0u DU N... 100644 000000 100644 100644 a 0 c current-deleted.txt\0u UD N... 100644 100644 000000 100644 a b 0 incoming-deleted.txt\0u AU N... 000000 100644 100644 100644 0 b c other.txt\0? -leading \xe4\xb8\xad\xe6\x96\x87.txt\0";
        let (_, changes) = parse_status(fixture).expect("status");
        assert!(changes.iter().any(|change| {
            change.path == "renamed.txt"
                && change.original_path.as_deref() == Some("old.txt")
                && change.staged
        }));
        assert!(changes.iter().any(|change| change.path == "conflict.txt"
            && change.conflict
            && change.conflict_kind == Some(GitConflictKind::BothModified)));
        for (path, kind) in [
            ("added.txt", GitConflictKind::BothAdded),
            ("current-deleted.txt", GitConflictKind::CurrentDeleted),
            ("incoming-deleted.txt", GitConflictKind::IncomingDeleted),
            ("other.txt", GitConflictKind::Other),
        ] {
            assert!(changes.iter().any(|change| {
                change.path == path && change.conflict && change.conflict_kind == Some(kind)
            }));
        }
        assert!(
            changes
                .iter()
                .any(|change| change.path == "-leading 中文.txt")
        );

        let branches = parse_branches(
            b"refs/heads/main\0main\0abc\0*\0origin/main\0refs/remotes/origin/main\0\n\
refs/heads/origin/main\0origin/main\0local\0 \0\0\0\n\
refs/remotes/origin/main\0origin/main\0abc\0 \0\0\0\n\
refs/remotes/origin/HEAD\0origin/HEAD\0abc\0 \0\0\0refs/remotes/origin/main\n",
        );
        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0].ref_name, "refs/heads/main");
        assert_eq!(branches[0].kind, GitBranchKind::Local);
        assert!(branches[0].current);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        assert_eq!(
            branches[0].upstream_ref.as_deref(),
            Some("refs/remotes/origin/main")
        );
        assert_eq!(branches[1].name, branches[2].name);
        assert_ne!(branches[1].ref_name, branches[2].ref_name);
        assert_eq!(branches[2].kind, GitBranchKind::Remote);
        assert_eq!(
            find_tracking_local_branch(&branches, "refs/remotes/origin/main")
                .map(|branch| branch.ref_name.as_str()),
            Some("refs/heads/main")
        );

        let commits = parse_commits(b"merge\x1fleft right\x1fHEAD -> main, tag: v1\x1fmerge subject\x1fQterm\x1f1700000000\x1fFirst paragraph.\n\n- detail one\n- detail two\n\x1e");
        assert_eq!(commits[0].parents, ["left", "right"]);
        assert_eq!(commits[0].decorations, ["HEAD -> main", "tag: v1"]);
        assert_eq!(
            commits[0].body,
            "First paragraph.\n\n- detail one\n- detail two"
        );
    }

    #[test]
    fn parses_nul_delimited_commit_files_and_preserves_rename_sources() {
        let files = parse_commit_files(b"A\0src/new.ts\0M\0README.md\0R100\0old name.txt\0new name.txt\0C075\0base.txt\0copy.txt\0");
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "src/new.ts");
        assert_eq!(files[2].status, "R100");
        assert_eq!(files[2].original_path.as_deref(), Some("old name.txt"));
        assert_eq!(files[2].path, "new name.txt");
        assert_eq!(files[3].original_path.as_deref(), Some("base.txt"));
        assert_eq!(files[3].path, "copy.txt");
    }

    #[test]
    fn bounds_process_output_and_classifies_recoverable_failures() {
        assert_eq!(
            read_bounded(Cursor::new(vec![b'x'; OUTPUT_LIMIT + 1])),
            Err(GitError::OutputTooLarge)
        );
        assert!(matches!(
            classify_failure(b"fatal: detected dubious ownership; add safe.directory"),
            GitError::Conflict(_)
        ));
        assert_eq!(
            classify_failure(b"fatal: not a git repository"),
            GitError::NotRepository
        );
        let GitError::CommandFailed(detail) = classify_failure(
            b"fatal: unable to access 'https://alice:p%40ss@example.com/repo.git/': denied",
        ) else {
            panic!("expected command failure");
        };
        assert!(!detail.contains("alice"));
        assert!(!detail.contains("p%40ss"));
        assert!(detail.contains("https://***@example.com/repo.git/"));
    }

    #[test]
    fn timed_out_process_is_terminated() {
        let result = if cfg!(windows) {
            run_process(
                std::path::Path::new("cmd.exe"),
                ["/C", "ping -n 10 127.0.0.1 > nul"],
                std::time::Duration::from_millis(50),
            )
        } else {
            run_process(
                std::path::Path::new("sh"),
                ["-c", "sleep 5"],
                std::time::Duration::from_millis(50),
            )
        };
        assert!(matches!(result, Err(GitError::Timeout)));
    }

    #[test]
    fn real_git_repository_supports_init_stage_commit_and_branch_snapshot() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git);
        let directory = tempdir().expect("repo");
        let first = executor.initialize(directory.path()).expect("init");
        assert!(first.head.unborn);
        fs::write(directory.path().join("hello world.txt"), b"hello").expect("fixture");
        let staged = executor.stage_all(directory.path()).expect("stage");
        assert!(staged.changes.iter().any(|change| change.staged));
        let unstaged = executor
            .unstage(directory.path(), &["hello world.txt".into()])
            .expect("unstage unborn file");
        assert!(unstaged.changes.iter().all(|change| !change.staged));
        executor
            .stage(directory.path(), &["hello world.txt".into()])
            .expect("stage one path");
        Command::new(executor.executable.as_ref().expect("git"))
            .args([
                "-C",
                directory.path().to_str().expect("path"),
                "config",
                "user.name",
                "Qterm Test",
            ])
            .status()
            .expect("name");
        Command::new(executor.executable.as_ref().expect("git"))
            .args([
                "-C",
                directory.path().to_str().expect("path"),
                "config",
                "user.email",
                "qterm@example.invalid",
            ])
            .status()
            .expect("email");
        let committed = executor
            .commit(directory.path(), "feat: initial")
            .expect("commit");
        assert_eq!(committed.commits.len(), 1);
        let commit_files = executor
            .commit_files(
                directory.path(),
                committed.head.oid.as_deref().expect("commit oid"),
            )
            .expect("commit files");
        assert_eq!(commit_files.len(), 1);
        assert_eq!(commit_files[0].path, "hello world.txt");
        assert_eq!(commit_files[0].status, "A");
        let base_branch = committed.head.name.clone().expect("base branch");
        let branched = executor
            .create_branch(directory.path(), "feature/test")
            .expect("branch");
        assert_eq!(branched.head.name.as_deref(), Some("feature/test"));
        fs::write(directory.path().join("hello world.txt"), b"feature").expect("branch change");
        executor.stage_all(directory.path()).expect("stage branch");
        executor
            .commit(directory.path(), "feat: branch change")
            .expect("branch commit");
        executor
            .switch_branch(directory.path(), &base_branch)
            .expect("switch base");
        fs::write(directory.path().join("hello world.txt"), b"local").expect("local change");
        assert!(matches!(
            executor.switch_branch(directory.path(), "feature/test"),
            Err(GitError::Conflict(_))
        ));
        let unchanged = executor
            .snapshot(directory.path())
            .expect("unchanged branch");
        assert_eq!(unchanged.head.name.as_deref(), Some(base_branch.as_str()));
        assert!(!unchanged.changes.is_empty());

        fs::write(directory.path().join(".git/index.lock"), b"locked").expect("index lock");
        assert!(matches!(
            executor.stage_all(directory.path()),
            Err(GitError::CommandFailed(_))
        ));
        fs::remove_file(directory.path().join(".git/index.lock")).expect("remove lock");
    }

    #[test]
    fn real_git_submodule_snapshot_and_safe_lifecycle_preserve_parent_semantics() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let fixture = tempdir().expect("submodule fixture");
        let grandchild = fixture.path().join("grandchild-source");
        let child = fixture.path().join("child-source");
        let parent = fixture.path().join("parent");
        let parent_remote = fixture.path().join("parent-remote.git");
        fs::create_dir(&grandchild).expect("grandchild directory");
        fs::create_dir(&child).expect("child directory");
        fs::create_dir(&parent).expect("parent directory");
        executor
            .initialize(&grandchild)
            .expect("initialize grandchild");
        configure_identity(&git, &grandchild);
        fs::write(grandchild.join("nested.txt"), b"nested\n").expect("grandchild file");
        executor.stage_all(&grandchild).expect("stage grandchild");
        executor
            .commit(&grandchild, "grandchild v1")
            .expect("commit grandchild");
        executor.initialize(&child).expect("initialize child");
        configure_identity(&git, &child);
        fs::write(child.join("child.txt"), b"first\n").expect("child v1");
        run_git_test(
            &git,
            [
                "-c",
                "protocol.file.allow=always",
                "-C",
                path(&child),
                "submodule",
                "add",
                path(&grandchild),
                "deps/grandchild",
            ],
        );
        executor.stage_all(&child).expect("stage child v1");
        let first_oid = executor
            .commit(&child, "child v1")
            .expect("commit child v1")
            .head
            .oid
            .expect("child v1 oid");

        executor.initialize(&parent).expect("initialize parent");
        configure_identity(&git, &parent);
        run_git_test(
            &git,
            [
                "-c",
                "protocol.file.allow=always",
                "-C",
                path(&parent),
                "submodule",
                "add",
                path(&child),
                "modules/child",
            ],
        );
        executor.stage_all(&parent).expect("stage submodule");
        executor
            .commit(&parent, "add child")
            .expect("commit parent");
        run_git_test(&git, ["init", "--bare", path(&parent_remote)]);
        run_git_test(
            &git,
            [
                "-C",
                path(&parent),
                "remote",
                "add",
                "origin",
                path(&parent_remote),
            ],
        );
        run_git_test(&git, ["-C", path(&parent), "push", "-u", "origin", "HEAD"]);

        fs::write(child.join("child.txt"), b"second\n").expect("child v2");
        executor.stage_all(&child).expect("stage child v2");
        let second_oid = executor
            .commit(&child, "child v2")
            .expect("commit child v2")
            .head
            .oid
            .expect("child v2 oid");
        let checked_out_child = parent.join("modules/child");
        run_git_test(&git, ["-C", path(&checked_out_child), "fetch", "origin"]);
        run_git_test(
            &git,
            ["-C", path(&checked_out_child), "checkout", &second_oid],
        );

        let changed = executor
            .snapshot(&parent)
            .expect("changed submodule snapshot");
        assert_eq!(changed.submodules.len(), 1);
        assert_eq!(changed.submodules[0].path, "modules/child");
        assert_eq!(
            changed.submodules[0].recorded_oid.as_deref(),
            Some(first_oid.as_str())
        );
        assert_eq!(
            changed.submodules[0].current_oid.as_deref(),
            Some(second_oid.as_str())
        );
        assert!(changed.submodules[0].commit_changed);
        assert!(changed.changes.iter().any(|change| {
            change.path == "modules/child"
                && !change.staged
                && change
                    .submodule
                    .as_ref()
                    .is_some_and(|state| state.commit_changed)
        }));

        let staged = executor
            .stage(&parent, &["modules/child".into()])
            .expect("stage gitlink");
        assert!(
            staged
                .changes
                .iter()
                .any(|change| change.path == "modules/child" && change.staged)
        );
        let unstaged = executor
            .unstage(&parent, &["modules/child".into()])
            .expect("unstage gitlink");
        assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), second_oid);
        assert!(unstaged.submodules[0].commit_changed);

        executor
            .checkout_submodule(&parent, "modules/child")
            .expect("restore recorded child commit");
        assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), first_oid);

        run_git_test(
            &git,
            ["-C", path(&checked_out_child), "checkout", &second_oid],
        );
        fs::write(checked_out_child.join("child.txt"), b"dirty\n").expect("dirty child");
        let dirty = executor.snapshot(&parent).expect("dirty child snapshot");
        assert!(dirty.submodules[0].tracked_modified);
        assert!(executor.stage(&parent, &["modules/child".into()]).is_ok());
        executor
            .unstage(&parent, &["modules/child".into()])
            .expect("restore parent index after gitlink test");
        assert!(matches!(
            executor.checkout_submodule(&parent, "modules/child"),
            Err(GitError::Conflict(_))
        ));

        run_git_test(
            &git,
            [
                "-C",
                path(&checked_out_child),
                "reset",
                "--hard",
                &first_oid,
            ],
        );
        run_git_test(
            &git,
            [
                "-C",
                path(&parent),
                "submodule",
                "deinit",
                "-f",
                "--",
                "modules/child",
            ],
        );
        let uninitialized = executor.snapshot(&parent).expect("uninitialized snapshot");
        assert!(!uninitialized.submodules[0].initialized);
        let fetched = executor.fetch(&parent).expect("fetch parent repository");
        assert!(!fetched.submodules[0].initialized);
        let pulled = executor.pull(&parent).expect("pull parent repository");
        assert!(!pulled.submodules[0].initialized);
        executor
            .initialize_submodule(&parent, "modules/child")
            .expect("initialize one child");
        assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), first_oid);
    }

    #[test]
    fn real_git_literal_pathspec_stage_and_unstage_preserve_the_selected_filename() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("literal pathspec repository");
        executor.initialize(directory.path()).expect("init");
        fs::write(directory.path().join("[ab].txt"), b"literal\n").expect("literal fixture");
        fs::write(directory.path().join("a.txt"), b"pattern match\n").expect("pattern fixture");

        let staged = executor
            .stage(directory.path(), &["[ab].txt".into()])
            .expect("stage literal path");
        assert!(
            staged
                .changes
                .iter()
                .any(|change| change.path == "[ab].txt" && change.staged)
        );
        assert!(
            staged
                .changes
                .iter()
                .any(|change| change.path == "a.txt" && !change.staged)
        );

        executor
            .stage_all(directory.path())
            .expect("stage all paths");
        let unstaged = executor
            .unstage(directory.path(), &["[ab].txt".into()])
            .expect("unstage literal path");
        assert!(
            unstaged
                .changes
                .iter()
                .any(|change| change.path == "[ab].txt" && !change.staged)
        );
        assert!(
            unstaged
                .changes
                .iter()
                .any(|change| change.path == "a.txt" && change.staged)
        );

        configure_identity(&git, directory.path());
        executor
            .stage_all(directory.path())
            .expect("restage all paths");
        executor
            .commit(directory.path(), "test: literal pathspec")
            .expect("commit fixture");
        fs::write(directory.path().join("[ab].txt"), b"literal changed\n")
            .expect("modify literal fixture");
        fs::write(directory.path().join("a.txt"), b"pattern changed\n")
            .expect("modify pattern fixture");
        executor
            .stage_all(directory.path())
            .expect("stage changed paths");

        let reset = executor
            .unstage(directory.path(), &["[ab].txt".into()])
            .expect("reset literal path with HEAD");
        assert!(
            reset
                .changes
                .iter()
                .any(|change| change.path == "[ab].txt" && !change.staged)
        );
        assert!(
            reset
                .changes
                .iter()
                .any(|change| change.path == "a.txt" && change.staged)
        );
    }

    #[test]
    fn real_git_discard_restores_the_index_and_removes_only_selected_untracked_files() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("discard repository");
        executor.initialize(directory.path()).expect("init");
        for (key, value) in [
            ("user.name", "Qterm Test"),
            ("user.email", "qterm@example.invalid"),
        ] {
            assert!(
                Command::new(&git)
                    .args([
                        "-C",
                        directory.path().to_str().expect("path"),
                        "config",
                        key,
                        value,
                    ])
                    .status()
                    .expect("config")
                    .success()
            );
        }
        let tracked = directory.path().join("tracked.txt");
        fs::write(&tracked, b"base\n").expect("base");
        executor.stage_all(directory.path()).expect("stage base");
        executor
            .commit(directory.path(), "base")
            .expect("commit base");
        fs::write(&tracked, b"staged\n").expect("staged content");
        executor
            .stage(directory.path(), &["tracked.txt".into()])
            .expect("stage selected content");
        fs::write(&tracked, b"worktree\n").expect("worktree content");
        let selected_untracked = directory.path().join("selected.tmp");
        let retained_untracked = directory.path().join("retained.tmp");
        fs::write(&selected_untracked, b"delete").expect("selected untracked");
        fs::write(&retained_untracked, b"keep").expect("retained untracked");

        let result = executor
            .discard(
                directory.path(),
                &["tracked.txt".into(), "selected.tmp".into()],
            )
            .expect("discard");
        assert_eq!(
            String::from_utf8_lossy(&fs::read(&tracked).expect("restored tracked")).trim_end(),
            "staged"
        );
        assert!(!selected_untracked.exists());
        assert!(retained_untracked.exists());
        assert!(
            result
                .changes
                .iter()
                .any(|change| change.path == "tracked.txt" && change.staged)
        );
        assert!(
            !result
                .changes
                .iter()
                .any(|change| change.path == "tracked.txt" && !change.staged)
        );
        assert!(
            executor
                .discard(directory.path(), &["missing.txt".into()])
                .is_err()
        );
    }

    #[test]
    fn real_git_creates_and_switches_branch_from_historical_commit() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("historical commit fixture");
        run_git_test(&git, ["init", path(directory.path())]);
        configure_identity(&git, directory.path());

        fs::write(directory.path().join("history.txt"), b"first\n").expect("first file");
        run_git_test(&git, ["-C", path(directory.path()), "add", "history.txt"]);
        run_git_test(
            &git,
            ["-C", path(directory.path()), "commit", "-m", "first"],
        );
        let first_oid = executor
            .snapshot(directory.path())
            .expect("first snapshot")
            .head
            .oid
            .expect("first oid");

        fs::write(directory.path().join("history.txt"), b"second\n").expect("second file");
        run_git_test(&git, ["-C", path(directory.path()), "add", "history.txt"]);
        run_git_test(
            &git,
            ["-C", path(directory.path()), "commit", "-m", "second"],
        );

        let created = executor
            .create_branch_from_commit(directory.path(), "feature/history", &first_oid)
            .expect("create branch from historical commit");
        assert_eq!(created.head.name.as_deref(), Some("feature/history"));
        assert_eq!(created.head.oid.as_deref(), Some(first_oid.as_str()));
        assert_eq!(
            fs::read_to_string(directory.path().join("history.txt")).expect("historical worktree"),
            "first\n"
        );
        assert!(matches!(
            executor.create_branch_from_commit(directory.path(), "feature/invalid", "abcdef0"),
            Err(GitError::InvalidInput)
        ));
    }

    #[test]
    fn real_git_fetch_lists_tracks_and_prunes_remote_branches_without_changing_the_worktree() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("remote fixture");
        let bare = directory.path().join("origin.git");
        let seed = directory.path().join("seed");
        let local = directory.path().join("local");

        run_git_test(&git, ["init", "--bare", path(&bare)]);
        run_git_test(&git, ["init", path(&seed)]);
        run_git_test(
            &git,
            ["-C", path(&seed), "config", "user.name", "Qterm Test"],
        );
        run_git_test(
            &git,
            [
                "-C",
                path(&seed),
                "config",
                "user.email",
                "qterm@example.invalid",
            ],
        );
        fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
        run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
        run_git_test(
            &git,
            ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
        );
        run_git_test(&git, ["clone", path(&bare), path(&local)]);

        run_git_test(&git, ["-C", path(&seed), "switch", "-c", "feature/remote"]);
        fs::write(seed.join("feature.txt"), b"feature\n").expect("feature file");
        run_git_test(&git, ["-C", path(&seed), "add", "feature.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "feature"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "push", "-u", "origin", "feature/remote"],
        );
        run_git_test(&git, ["-C", path(&seed), "switch", "main"]);

        let stale = executor.snapshot(&local).expect("snapshot before fetch");
        assert!(
            stale
                .branches
                .iter()
                .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
        );
        let fetched = executor.fetch(&local).expect("fetch new remote branch");
        assert!(fetched.branches.iter().any(|branch| {
            branch.ref_name == "refs/remotes/origin/feature/remote"
                && branch.kind == GitBranchKind::Remote
        }));
        assert!(
            fetched
                .branches
                .iter()
                .all(|branch| branch.name != "origin/HEAD")
        );

        run_git_test(&git, ["-C", path(&local), "branch", "feature/remote"]);
        assert!(matches!(
            executor.track_remote_branch(&local, "refs/remotes/origin/feature/remote"),
            Err(GitError::CommandFailed(_))
        ));
        assert_eq!(
            executor
                .snapshot(&local)
                .expect("snapshot after collision")
                .head
                .name
                .as_deref(),
            Some("main")
        );
        run_git_test(&git, ["-C", path(&local), "branch", "-D", "feature/remote"]);

        run_git_test(
            &git,
            [
                "-C",
                path(&local),
                "branch",
                "--track",
                "review",
                "origin/feature/remote",
            ],
        );
        let reused = executor
            .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
            .expect("reuse tracking branch");
        assert_eq!(reused.head.name.as_deref(), Some("review"));
        executor.switch_branch(&local, "main").expect("switch main");
        run_git_test(&git, ["-C", path(&local), "branch", "-D", "review"]);
        let created = executor
            .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
            .expect("create tracking branch");
        assert_eq!(created.head.name.as_deref(), Some("feature/remote"));
        assert_eq!(
            created.head.upstream.as_deref(),
            Some("origin/feature/remote")
        );
        executor.switch_branch(&local, "main").expect("return main");

        run_git_test(
            &git,
            [
                "-C",
                path(&seed),
                "push",
                "origin",
                "--delete",
                "feature/remote",
            ],
        );
        fs::write(seed.join("main.txt"), b"initial\nremote update\n").expect("remote update");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);

        let pruned = executor.fetch(&local).expect("fetch and prune");
        assert!(
            pruned
                .branches
                .iter()
                .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
        );
        assert_eq!(pruned.head.behind, 1);
        assert_eq!(
            fs::read_to_string(local.join("main.txt")).expect("worktree"),
            "initial\n"
        );
    }

    #[test]
    fn real_git_p0_lifecycle_publish_push_and_ff_only_pull_are_safe() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("p0 fixture");
        let bare = directory.path().join("origin.git");
        let seed = directory.path().join("seed");
        let local = directory.path().join("local");

        run_git_test(&git, ["init", "--bare", path(&bare)]);
        run_git_test(&git, ["init", path(&seed)]);
        configure_identity(&git, &seed);
        fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
        run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
        run_git_test(
            &git,
            ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
        );
        run_git_test(&git, ["clone", path(&bare), path(&local)]);
        configure_identity(&git, &local);
        run_git_test(
            &git,
            ["-C", path(&local), "config", "push.default", "nothing"],
        );
        run_git_test(&git, ["-C", path(&local), "config", "pull.rebase", "true"]);

        let initial = executor.snapshot(&local).expect("initial snapshot");
        assert_eq!(initial.remotes, ["origin"]);
        let created = executor
            .create_branch_from(&local, "feature/from-remote", "refs/remotes/origin/main")
            .expect("create from remote");
        assert_eq!(created.head.name.as_deref(), Some("feature/from-remote"));
        assert_eq!(created.head.upstream, None);
        executor.switch_branch(&local, "main").expect("switch main");
        let renamed = executor
            .rename_branch(&local, "refs/heads/feature/from-remote", "feature/renamed")
            .expect("rename local branch");
        assert!(
            renamed
                .branches
                .iter()
                .any(|branch| branch.name == "feature/renamed")
        );
        let deleted = executor
            .delete_branch(&local, "refs/heads/feature/renamed")
            .expect("delete merged branch");
        assert!(
            deleted
                .branches
                .iter()
                .all(|branch| branch.name != "feature/renamed")
        );
        assert!(matches!(
            executor.delete_branch(&local, "refs/heads/main"),
            Err(GitError::Conflict(_))
        ));

        executor
            .create_branch(&local, "feature/publish")
            .expect("new branch");
        fs::write(local.join("published.txt"), b"published\n").expect("publish file");
        executor.stage_all(&local).expect("stage publish");
        let published_commit = executor
            .commit(&local, "feat: publish")
            .expect("publish commit");
        let published = executor
            .push(&local, Some("origin"))
            .expect("publish branch");
        assert_eq!(
            published.head.upstream.as_deref(),
            Some("origin/feature/publish")
        );
        assert_eq!(
            rev_parse(&git, &bare, "refs/heads/feature/publish"),
            published_commit.head.oid.expect("published oid")
        );
        let renamed_published = executor
            .rename_branch(
                &local,
                "refs/heads/feature/publish",
                "feature/published-renamed",
            )
            .expect("rename published branch");
        assert_eq!(
            renamed_published.head.name.as_deref(),
            Some("feature/published-renamed")
        );
        assert_eq!(
            renamed_published.head.upstream.as_deref(),
            Some("origin/feature/publish")
        );
        fs::write(local.join("published.txt"), b"published\nsecond\n").expect("second file");
        executor.stage_all(&local).expect("stage second");
        let pushed_commit = executor.commit(&local, "feat: push").expect("push commit");
        executor.push(&local, None).expect("tracked push");
        assert_eq!(
            rev_parse(&git, &bare, "refs/heads/feature/publish"),
            pushed_commit.head.oid.expect("pushed oid")
        );
        assert!(matches!(
            executor.push(&local, Some("missing")),
            Err(GitError::InvalidInput)
        ));

        executor.switch_branch(&local, "main").expect("return main");
        fs::write(seed.join("main.txt"), b"initial\nremote\n").expect("remote update");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
        let pulled = executor.pull(&local).expect("ff-only pull");
        assert_eq!(
            pulled.head.oid.as_deref(),
            Some(rev_parse(&git, &bare, "refs/heads/main").as_str())
        );

        fs::write(local.join("local-only.txt"), b"local\n").expect("local divergence");
        executor.stage_all(&local).expect("stage divergence");
        let local_diverged = executor
            .commit(&local, "local divergence")
            .expect("local commit");
        fs::write(seed.join("remote-only.txt"), b"remote\n").expect("remote divergence");
        run_git_test(&git, ["-C", path(&seed), "add", "remote-only.txt"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "commit", "-m", "remote divergence"],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
        assert!(matches!(
            executor.pull(&local),
            Err(GitError::CommandFailed(_) | GitError::Conflict(_))
        ));
        assert_eq!(
            executor
                .snapshot(&local)
                .expect("diverged snapshot")
                .head
                .oid,
            local_diverged.head.oid
        );

        executor
            .create_branch(&local, "feature/unmerged")
            .expect("unmerged branch");
        fs::write(local.join("unmerged.txt"), b"unmerged\n").expect("unmerged file");
        executor.stage_all(&local).expect("stage unmerged");
        executor
            .commit(&local, "unmerged commit")
            .expect("commit unmerged");
        executor
            .switch_branch(&local, "main")
            .expect("leave unmerged");
        assert!(matches!(
            executor.delete_branch(&local, "refs/heads/feature/unmerged"),
            Err(GitError::CommandFailed(_))
        ));
        assert!(
            executor
                .snapshot(&local)
                .expect("safe delete refusal")
                .branches
                .iter()
                .any(|branch| branch.name == "feature/unmerged")
        );
    }

    #[test]
    fn failed_commit_does_not_create_history() {
        let executor = SystemGitExecutor::with_executable(which_git());
        let directory = tempdir().expect("repo");
        executor.initialize(directory.path()).expect("init");
        fs::write(directory.path().join("staged.txt"), b"staged").expect("fixture");
        executor.stage_all(directory.path()).expect("stage");
        for key in ["user.name", "user.email"] {
            Command::new(executor.executable.as_ref().expect("git"))
                .args([
                    "-C",
                    directory.path().to_str().expect("path"),
                    "config",
                    key,
                    "",
                ])
                .status()
                .expect("empty identity");
        }
        assert!(matches!(
            executor.commit(directory.path(), "feat: should fail"),
            Err(GitError::CommandFailed(_))
        ));
        let snapshot = executor.snapshot(directory.path()).expect("snapshot");
        assert!(snapshot.head.unborn);
        assert!(snapshot.changes.iter().any(|change| change.staged));
    }

    #[test]
    fn change_diff_respects_head_index_worktree_and_literal_paths() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("diff repo");
        let repository = directory.path();
        executor.initialize(repository).expect("init");
        configure_identity(&git, repository);
        fs::write(repository.join("dual.txt"), b"head\n").expect("dual fixture");
        fs::write(repository.join("rename-old.txt"), b"rename base\n").expect("rename fixture");
        fs::write(repository.join("move-old.txt"), b"move base\n").expect("move fixture");
        executor.stage_all(repository).expect("stage base");
        executor.commit(repository, "base").expect("commit base");

        fs::write(repository.join("dual.txt"), b"index\n").expect("index content");
        executor
            .stage(repository, &["dual.txt".into()])
            .expect("stage dual");
        fs::write(repository.join("dual.txt"), b"worktree\n").expect("worktree content");

        let staged = executor
            .change_diff(repository, "dual.txt", true)
            .expect("staged diff");
        assert_eq!(staged.before_source, GitDiffSource::Head);
        assert_eq!(staged.after_source, GitDiffSource::Index);
        assert_eq!(staged.before.content.as_deref(), Some("head\n"));
        assert_eq!(staged.after.content.as_deref(), Some("index\n"));

        let unstaged = executor
            .change_diff(repository, "dual.txt", false)
            .expect("unstaged diff");
        assert_eq!(unstaged.before_source, GitDiffSource::Index);
        assert_eq!(unstaged.after_source, GitDiffSource::Worktree);
        assert_eq!(unstaged.before.content.as_deref(), Some("index\n"));
        assert_eq!(unstaged.after.content.as_deref(), Some("worktree\n"));

        fs::write(repository.join("-奇异.txt"), b"literal\n").expect("literal fixture");
        let untracked = executor
            .change_diff(repository, "-奇异.txt", false)
            .expect("untracked diff");
        assert_eq!(untracked.before.kind, GitConflictContentKind::Missing);
        assert_eq!(untracked.after.content.as_deref(), Some("literal\n"));

        fs::remove_file(repository.join("rename-old.txt")).expect("delete fixture");
        let deleted = executor
            .change_diff(repository, "rename-old.txt", false)
            .expect("delete diff");
        assert_eq!(deleted.before.content.as_deref(), Some("rename base\n"));
        assert_eq!(deleted.after.kind, GitConflictContentKind::Missing);

        run_git_test(
            &git,
            [
                "-C",
                path(repository),
                "mv",
                "--",
                "move-old.txt",
                "move-new.txt",
            ],
        );
        let renamed = executor
            .change_diff(repository, "move-new.txt", true)
            .expect("rename diff");
        assert_eq!(renamed.original_path.as_deref(), Some("move-old.txt"));
        assert_eq!(renamed.before.content.as_deref(), Some("move base\n"));
        assert_eq!(renamed.after.content.as_deref(), Some("move base\n"));
    }

    #[test]
    fn real_git_merge_supports_success_conflict_continue_abort_and_safe_preconditions() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("merge fixture");
        let repository = directory.path();
        executor.initialize(repository).expect("init");
        configure_identity(&git, repository);
        fs::write(repository.join("shared.txt"), b"base\n").expect("base file");
        executor.stage_all(repository).expect("stage base");
        let initial = executor
            .commit(repository, "initial")
            .expect("initial commit");
        let main = initial.head.name.clone().expect("main branch");

        executor
            .create_branch(repository, "feature/merge")
            .expect("feature branch");
        fs::write(repository.join("feature.txt"), b"feature\n").expect("feature file");
        executor.stage_all(repository).expect("stage feature");
        executor
            .commit(repository, "feature commit")
            .expect("feature commit");
        executor
            .switch_branch(repository, &main)
            .expect("switch main");
        fs::write(repository.join("main.txt"), b"main\n").expect("main file");
        executor.stage_all(repository).expect("stage main");
        executor
            .commit(repository, "main commit")
            .expect("main commit");

        let merged = executor
            .merge_branch(repository, "refs/heads/feature/merge")
            .expect("merge commit");
        assert!(!merged.merge_in_progress);
        assert_eq!(merged.commits[0].parents.len(), 2);
        run_git_test(
            &git,
            [
                "-C",
                path(repository),
                "update-ref",
                "refs/remotes/origin/feature-merge",
                "refs/heads/feature/merge",
            ],
        );
        executor
            .merge_branch(repository, "refs/remotes/origin/feature-merge")
            .expect("merge remote-tracking ref");
        let up_to_date = executor
            .merge_branch(repository, "refs/heads/feature/merge")
            .expect("already up to date");
        assert_eq!(up_to_date.head.oid, merged.head.oid);

        executor
            .create_branch(repository, "feature/conflict")
            .expect("conflict branch");
        fs::write(repository.join("shared.txt"), b"feature conflict\n").expect("feature conflict");
        executor
            .stage_all(repository)
            .expect("stage conflict branch");
        executor
            .commit(repository, "feature conflict")
            .expect("commit conflict branch");
        executor
            .switch_branch(repository, &main)
            .expect("return main");
        fs::write(repository.join("shared.txt"), b"main conflict\n").expect("main conflict");
        executor.stage_all(repository).expect("stage main conflict");
        let before_conflict = executor
            .commit(repository, "main conflict")
            .expect("commit main conflict");

        let conflicted = executor
            .merge_branch(repository, "refs/heads/feature/conflict")
            .expect("conflict snapshot");
        assert!(conflicted.merge_in_progress);
        assert!(conflicted.merge_head_oid.is_some());
        assert!(conflicted.changes.iter().any(|change| change.conflict));
        let detail = executor
            .conflict_detail(repository, "shared.txt")
            .expect("conflict detail");
        assert_eq!(detail.kind, GitConflictKind::BothModified);
        assert_eq!(detail.base.content.as_deref(), Some("base\n"));
        assert_eq!(detail.current.content.as_deref(), Some("main conflict\n"));
        assert_eq!(
            detail.incoming.content.as_deref(),
            Some("feature conflict\n")
        );
        assert!(detail.editable);
        assert!(matches!(
            executor.stage_all(repository),
            Err(GitError::Conflict(_))
        ));
        assert!(
            executor
                .snapshot(repository)
                .expect("reload conflict")
                .merge_in_progress
        );
        assert!(matches!(
            executor.continue_merge(repository),
            Err(GitError::Conflict(_))
        ));
        let aborted = executor.abort_merge(repository).expect("abort merge");
        assert!(!aborted.merge_in_progress);
        assert_eq!(aborted.head.oid, before_conflict.head.oid);

        fs::write(repository.join("dirty.txt"), b"dirty\n").expect("dirty file");
        assert!(matches!(
            executor.merge_branch(repository, "refs/heads/feature/conflict"),
            Err(GitError::Conflict(_))
        ));
        assert_eq!(
            executor
                .snapshot(repository)
                .expect("snapshot after dirty rejection")
                .head
                .oid,
            before_conflict.head.oid
        );
        fs::remove_file(repository.join("dirty.txt")).expect("clean fixture");

        let conflicted = executor
            .merge_branch(repository, "refs/heads/feature/conflict")
            .expect("second conflict snapshot");
        assert!(conflicted.merge_in_progress);
        let detail = executor
            .conflict_detail(repository, "shared.txt")
            .expect("second conflict detail");
        fs::write(repository.join("shared.txt"), b"external edit\n").expect("external edit");
        assert!(matches!(
            executor.resolve_conflict(
                repository,
                "shared.txt",
                &GitConflictResolution::SaveText {
                    content: "stale resolution\n".into(),
                    expected_revision: detail.result.revision,
                },
            ),
            Err(GitError::Conflict(_))
        ));
        assert_eq!(
            fs::read_to_string(repository.join("shared.txt")).expect("external result"),
            "external edit\n"
        );
        let detail = executor
            .conflict_detail(repository, "shared.txt")
            .expect("reloaded conflict detail");
        let resolved = executor
            .resolve_conflict(
                repository,
                "shared.txt",
                &GitConflictResolution::SaveText {
                    content: "resolved\n".into(),
                    expected_revision: detail.result.revision,
                },
            )
            .expect("save and stage resolution");
        assert!(!resolved.changes.iter().any(|change| change.conflict));
        assert_eq!(
            fs::read_to_string(repository.join("shared.txt")).expect("resolved file"),
            "resolved\n"
        );
        let continued = executor.continue_merge(repository).expect("continue merge");
        assert!(!continued.merge_in_progress);
        assert_eq!(continued.commits[0].parents.len(), 2);

        executor
            .create_branch(repository, "feature/fast-forward")
            .expect("fast-forward branch");
        fs::write(repository.join("fast.txt"), b"fast\n").expect("fast file");
        executor.stage_all(repository).expect("stage fast");
        let fast_commit = executor
            .commit(repository, "fast commit")
            .expect("commit fast");
        executor
            .switch_branch(repository, &main)
            .expect("return for fast-forward");
        let fast_forwarded = executor
            .merge_branch(repository, "refs/heads/feature/fast-forward")
            .expect("fast-forward");
        assert_eq!(fast_forwarded.head.oid, fast_commit.head.oid);
        assert_eq!(fast_forwarded.commits[0].parents.len(), 1);
    }

    #[test]
    fn real_git_conflicts_support_add_delete_and_binary_file_level_resolutions() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("conflict fixture");
        let repository = directory.path();
        executor.initialize(repository).expect("init");
        configure_identity(&git, repository);
        fs::write(repository.join("current-deleted.txt"), b"base current\n").expect("base");
        fs::write(repository.join("incoming-deleted.txt"), b"base incoming\n").expect("base");
        fs::write(repository.join("binary.bin"), b"base\0binary").expect("base binary");
        fs::write(repository.join("oversize.txt"), b"base oversize\n").expect("base oversize");
        executor.stage_all(repository).expect("stage base");
        let initial = executor.commit(repository, "initial").expect("initial");
        let main = initial.head.name.expect("main branch");

        executor
            .create_branch(repository, "feature/conflict-kinds")
            .expect("feature branch");
        fs::write(repository.join("both-added.txt"), b"incoming added\n").expect("incoming add");
        fs::write(
            repository.join("current-deleted.txt"),
            b"incoming modified\n",
        )
        .expect("incoming modify");
        fs::remove_file(repository.join("incoming-deleted.txt")).expect("incoming delete");
        fs::write(repository.join("binary.bin"), b"incoming\0binary").expect("incoming binary");
        fs::write(
            repository.join("oversize.txt"),
            vec![b'i'; MAX_CONFLICT_TEXT_BYTES + 1],
        )
        .expect("incoming oversize");
        executor.stage_all(repository).expect("stage incoming");
        executor
            .commit(repository, "incoming changes")
            .expect("incoming commit");

        executor
            .switch_branch(repository, &main)
            .expect("switch main");
        fs::write(repository.join("both-added.txt"), b"current added\n").expect("current add");
        fs::remove_file(repository.join("current-deleted.txt")).expect("current delete");
        fs::write(
            repository.join("incoming-deleted.txt"),
            b"current modified\n",
        )
        .expect("current modify");
        fs::write(repository.join("binary.bin"), b"current\0binary").expect("current binary");
        fs::write(
            repository.join("oversize.txt"),
            vec![b'c'; MAX_CONFLICT_TEXT_BYTES + 1],
        )
        .expect("current oversize");
        executor.stage_all(repository).expect("stage current");
        executor
            .commit(repository, "current changes")
            .expect("current commit");

        let conflicted = executor
            .merge_branch(repository, "refs/heads/feature/conflict-kinds")
            .expect("merge conflicts");
        for (path, kind) in [
            ("both-added.txt", GitConflictKind::BothAdded),
            ("current-deleted.txt", GitConflictKind::CurrentDeleted),
            ("incoming-deleted.txt", GitConflictKind::IncomingDeleted),
            ("binary.bin", GitConflictKind::BothModified),
            ("oversize.txt", GitConflictKind::BothModified),
        ] {
            assert!(
                conflicted
                    .changes
                    .iter()
                    .any(|change| { change.path == path && change.conflict_kind == Some(kind) })
            );
        }

        let add_detail = executor
            .conflict_detail(repository, "both-added.txt")
            .expect("AA detail");
        assert_eq!(add_detail.base.kind, GitConflictContentKind::Missing);
        assert!(matches!(
            executor.conflict_detail(repository, "not-conflicted.txt"),
            Err(GitError::Conflict(_))
        ));
        executor
            .resolve_conflict(
                repository,
                "both-added.txt",
                &GitConflictResolution::UseIncoming,
            )
            .expect("choose incoming add");
        assert_eq!(
            fs::read(repository.join("both-added.txt")).expect("chosen add"),
            b"incoming added\n"
        );

        let delete_detail = executor
            .conflict_detail(repository, "current-deleted.txt")
            .expect("DU detail");
        assert_eq!(delete_detail.current.kind, GitConflictContentKind::Missing);
        assert!(matches!(
            executor.resolve_conflict(
                repository,
                "current-deleted.txt",
                &GitConflictResolution::UseCurrent,
            ),
            Err(GitError::Conflict(_))
        ));
        executor
            .resolve_conflict(
                repository,
                "current-deleted.txt",
                &GitConflictResolution::UseIncoming,
            )
            .expect("keep incoming side");
        assert_eq!(
            fs::read(repository.join("current-deleted.txt")).expect("incoming side"),
            b"incoming modified\n"
        );

        executor
            .resolve_conflict(
                repository,
                "incoming-deleted.txt",
                &GitConflictResolution::Delete,
            )
            .expect("accept incoming deletion");
        assert!(!repository.join("incoming-deleted.txt").exists());

        let binary_detail = executor
            .conflict_detail(repository, "binary.bin")
            .expect("binary detail");
        assert!(!binary_detail.editable);
        assert_eq!(binary_detail.current.kind, GitConflictContentKind::Binary);
        assert_eq!(binary_detail.incoming.kind, GitConflictContentKind::Binary);
        executor
            .resolve_conflict(repository, "binary.bin", &GitConflictResolution::UseCurrent)
            .expect("choose current binary");
        assert_eq!(
            fs::read(repository.join("binary.bin")).expect("current binary"),
            b"current\0binary"
        );

        let oversize_detail = executor
            .conflict_detail(repository, "oversize.txt")
            .expect("oversize detail");
        assert!(!oversize_detail.editable);
        assert_eq!(
            oversize_detail.current.kind,
            GitConflictContentKind::Unsupported
        );
        assert_eq!(
            oversize_detail.incoming.kind,
            GitConflictContentKind::Unsupported
        );
        assert!(matches!(
            executor.resolve_conflict(
                repository,
                "oversize.txt",
                &GitConflictResolution::UseIncoming,
            ),
            Err(GitError::Conflict(_))
        ));
        let resolved = executor
            .resolve_conflict(
                repository,
                "oversize.txt",
                &GitConflictResolution::MarkResolved,
            )
            .expect("stage external oversize result");
        assert!(!resolved.changes.iter().any(|change| change.conflict));
        executor.continue_merge(repository).expect("continue merge");
    }

    #[test]
    fn real_git_commit_file_diff_uses_the_first_parent_and_empty_tree_baselines() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("commit diff fixture");
        let repository = directory.path();
        executor.initialize(repository).expect("init");
        configure_identity(&git, repository);
        fs::write(
            repository.join("rename-me.txt"),
            b"rename baseline\nshared content\n",
        )
        .expect("rename fixture");
        fs::write(repository.join("delete-me.txt"), b"deleted baseline\n").expect("delete fixture");
        fs::write(repository.join("modify-me.txt"), b"before modification\n")
            .expect("modify fixture");
        fs::write(repository.join("-literal[ab].bin"), [0_u8, 1, 2])
            .expect("literal binary fixture");
        executor.stage_all(repository).expect("stage root");
        let root = executor.commit(repository, "root").expect("root commit");
        let root_oid = root.head.oid.expect("root oid");

        let root_diff = executor
            .commit_file_diff(repository, &root_oid, "rename-me.txt")
            .expect("root diff");
        assert_eq!(root_diff.parent_oid, None);
        assert_eq!(root_diff.before.kind, GitConflictContentKind::Missing);
        assert_eq!(
            root_diff.after.content.as_deref(),
            Some("rename baseline\nshared content\n")
        );
        let literal_binary = executor
            .commit_file_diff(repository, &root_oid, "-literal[ab].bin")
            .expect("literal binary root diff");
        assert_eq!(literal_binary.before.kind, GitConflictContentKind::Missing);
        assert_eq!(literal_binary.after.kind, GitConflictContentKind::Binary);

        fs::rename(
            repository.join("rename-me.txt"),
            repository.join("renamed.txt"),
        )
        .expect("rename file");
        fs::remove_file(repository.join("delete-me.txt")).expect("delete file");
        fs::write(repository.join("modify-me.txt"), b"after modification\n").expect("modify file");
        fs::write(repository.join("added.txt"), b"new file\n").expect("add file");
        executor.stage_all(repository).expect("stage second");
        let second = executor
            .commit(repository, "change files")
            .expect("second commit");
        let second_oid = second.head.oid.expect("second oid");

        let renamed = executor
            .commit_file_diff(repository, &second_oid, "renamed.txt")
            .expect("rename diff");
        assert_eq!(renamed.parent_oid.as_deref(), Some(root_oid.as_str()));
        assert_eq!(renamed.original_path.as_deref(), Some("rename-me.txt"));
        assert_eq!(
            renamed.before.content.as_deref(),
            Some("rename baseline\nshared content\n")
        );
        assert_eq!(renamed.after.content, renamed.before.content);

        let deleted = executor
            .commit_file_diff(repository, &second_oid, "delete-me.txt")
            .expect("delete diff");
        assert_eq!(
            deleted.before.content.as_deref(),
            Some("deleted baseline\n")
        );
        assert_eq!(deleted.after.kind, GitConflictContentKind::Missing);

        let added = executor
            .commit_file_diff(repository, &second_oid, "added.txt")
            .expect("add diff");
        assert_eq!(added.before.kind, GitConflictContentKind::Missing);
        assert_eq!(added.after.content.as_deref(), Some("new file\n"));

        let modified = executor
            .commit_file_diff(repository, &second_oid, "modify-me.txt")
            .expect("modify diff");
        assert_eq!(
            modified.before.content.as_deref(),
            Some("before modification\n")
        );
        assert_eq!(
            modified.after.content.as_deref(),
            Some("after modification\n")
        );
    }

    fn which_git() -> std::path::PathBuf {
        let output = Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg("git")
            .output()
            .expect("find git");
        std::path::PathBuf::from(
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .expect("git path"),
        )
    }

    fn run_git_test<I, S>(git: &std::path::Path, args: I)
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        let output = Command::new(git)
            .args(args)
            .output()
            .expect("run Git fixture");
        assert!(
            output.status.success(),
            "Git fixture failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn configure_identity(git: &std::path::Path, repository: &std::path::Path) {
        run_git_test(
            git,
            ["-C", path(repository), "config", "user.name", "Qterm Test"],
        );
        run_git_test(
            git,
            [
                "-C",
                path(repository),
                "config",
                "user.email",
                "qterm@example.invalid",
            ],
        );
    }

    fn rev_parse(git: &std::path::Path, repository: &std::path::Path, reference: &str) -> String {
        let output = Command::new(git)
            .args(["-C", path(repository), "rev-parse", reference])
            .output()
            .expect("rev-parse");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_owned()
    }

    fn path(value: &std::path::Path) -> &str {
        value.to_str().expect("UTF-8 fixture path")
    }
}
