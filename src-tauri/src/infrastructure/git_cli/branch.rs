use super::*;

pub(super) fn local_branch<'a>(
    snapshot: &'a GitSnapshot,
    ref_name: &str,
) -> Result<&'a GitBranch, GitError> {
    snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.ref_name == ref_name)
        .ok_or(GitError::InvalidInput)
}

pub(super) fn current_local_branch(snapshot: &GitSnapshot) -> Result<&GitBranch, GitError> {
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

pub(super) fn current_tracking(
    snapshot: &GitSnapshot,
) -> Result<(String, String, String), GitError> {
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

pub(super) fn parse_remotes(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .filter(|name| validate_remote_name(name).is_ok())
        .map(str::to_owned)
        .collect()
}

pub(super) fn create_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    name: &str,
) -> Result<GitSnapshot, GitError> {
    executor.mutate(
        repository,
        [OsStr::new("switch"), OsStr::new("-c"), OsStr::new(name)],
    )
}

pub(super) fn create_branch_from(
    executor: &SystemGitExecutor,
    repository: &Path,
    name: &str,
    source_ref: &str,
) -> Result<GitSnapshot, GitError> {
    validate_branch_source_ref(source_ref)?;
    let current = executor.snapshot(repository)?;
    if !current
        .branches
        .iter()
        .any(|branch| branch.ref_name == source_ref)
    {
        return Err(GitError::InvalidInput);
    }
    executor.mutate(
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

pub(super) fn create_branch_from_commit(
    executor: &SystemGitExecutor,
    repository: &Path,
    name: &str,
    oid: &str,
) -> Result<GitSnapshot, GitError> {
    crate::domain::git::validate_commit_oid(oid)?;
    executor.mutate(
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

pub(super) fn rename_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    ref_name: &str,
    new_name: &str,
) -> Result<GitSnapshot, GitError> {
    validate_local_branch_ref(ref_name)?;
    let current = executor.snapshot(repository)?;
    let old_name = local_branch(&current, ref_name)?.name.clone();
    executor.mutate(
        repository,
        [
            OsStr::new("branch"),
            OsStr::new("-m"),
            OsStr::new(&old_name),
            OsStr::new(new_name),
        ],
    )
}

pub(super) fn delete_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    ref_name: &str,
) -> Result<GitSnapshot, GitError> {
    validate_local_branch_ref(ref_name)?;
    let current = executor.snapshot(repository)?;
    let branch = local_branch(&current, ref_name)?;
    if branch.current {
        return Err(GitError::Conflict("不能删除当前分支".into()));
    }
    let name = branch.name.clone();
    executor.mutate(
        repository,
        [OsStr::new("branch"), OsStr::new("-d"), OsStr::new(&name)],
    )
}

pub(super) fn switch_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    name: &str,
) -> Result<GitSnapshot, GitError> {
    executor.mutate(repository, [OsStr::new("switch"), OsStr::new(name)])
}

pub(super) fn fetch(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    let repository = executor.repository_root(repository)?;
    executor.git(
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
    executor.snapshot(&repository)
}

pub(super) fn pull(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    let (_, remote, target_ref) = current_tracking(&current)?;
    executor.network_mutate(
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

pub(super) fn push(
    executor: &SystemGitExecutor,
    repository: &Path,
    remote: Option<&str>,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
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
        executor.network_mutate(
            repository,
            [
                OsStr::new("push"),
                OsStr::new("--set-upstream"),
                OsStr::new(&remote),
                OsStr::new(&refspec),
            ],
        )
    } else {
        executor.network_mutate(
            repository,
            [
                OsStr::new("push"),
                OsStr::new(&remote),
                OsStr::new(&refspec),
            ],
        )
    }
}

pub(super) fn track_remote_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    ref_name: &str,
) -> Result<GitSnapshot, GitError> {
    validate_remote_branch_ref(ref_name)?;
    let snapshot = executor.snapshot(repository)?;
    if let Some(local) = find_tracking_local_branch(&snapshot.branches, ref_name) {
        return executor.switch_branch(repository, &local.name);
    }
    let remote_name = snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Remote && branch.ref_name == ref_name)
        .map(|branch| branch.name.clone())
        .ok_or(GitError::InvalidInput)?;
    executor.mutate(
        repository,
        [
            OsStr::new("switch"),
            OsStr::new("--track"),
            OsStr::new(&remote_name),
        ],
    )
}

pub(super) fn merge_branch(
    executor: &SystemGitExecutor,
    repository: &Path,
    source_ref: &str,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_merge_preconditions(&current, source_ref)?;
    let repository = executor.repository_root(repository)?;
    let result = executor.git(
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
        Ok(_) => executor.snapshot(&repository),
        Err(failure) => match executor.snapshot(&repository) {
            Ok(snapshot) if snapshot.merge_in_progress => Ok(snapshot),
            _ => Err(failure),
        },
    }
}

pub(super) fn continue_merge(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_continue_merge(&current)?;
    executor.mutate(repository, ["merge", "--continue"])
}

pub(super) fn abort_merge(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_abort_merge(&current)?;
    executor.mutate(repository, ["merge", "--abort"])
}
