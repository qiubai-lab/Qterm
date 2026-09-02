use super::*;

pub(super) fn stage(
    executor: &SystemGitExecutor,
    repository: &Path,
    paths: &[String],
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_submodule_stage_paths(&current, paths)?;
    let mut args = vec![
        OsString::from("--literal-pathspecs"),
        OsString::from("add"),
        OsString::from("--"),
    ];
    args.extend(paths.iter().map(OsString::from));
    executor.mutate(repository, args)
}

pub(super) fn stage_all(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_stage_all(&current)?;
    executor.mutate(repository, ["add", "-A", "--"])
}

pub(super) fn unstage(
    executor: &SystemGitExecutor,
    repository: &Path,
    paths: &[String],
) -> Result<GitSnapshot, GitError> {
    let mut args = if executor.has_head(repository) {
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
    executor.mutate(repository, args)
}

pub(super) fn unstage_all(
    executor: &SystemGitExecutor,
    repository: &Path,
) -> Result<GitSnapshot, GitError> {
    if executor.has_head(repository) {
        executor.mutate(repository, ["reset", "-q", "HEAD", "--"])
    } else {
        executor.mutate(repository, ["rm", "--cached", "-r", "-q", "--", "."])
    }
}

pub(super) fn discard(
    executor: &SystemGitExecutor,
    repository: &Path,
    paths: &[String],
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    let plan = plan_discard(&current, paths)?;
    if !plan.tracked_paths.is_empty() {
        let mut args = vec![
            OsString::from("--literal-pathspecs"),
            OsString::from("checkout"),
            OsString::from("--"),
        ];
        args.extend(plan.tracked_paths.iter().map(OsString::from));
        executor.mutate(repository, args)?;
    }
    if !plan.untracked_paths.is_empty() {
        let mut args = vec![
            OsString::from("--literal-pathspecs"),
            OsString::from("clean"),
            OsString::from("-f"),
            OsString::from("--"),
        ];
        args.extend(plan.untracked_paths.iter().map(OsString::from));
        executor.mutate(repository, args)?;
    }
    executor.snapshot(repository)
}

pub(super) fn commit(
    executor: &SystemGitExecutor,
    repository: &Path,
    message: &str,
) -> Result<GitSnapshot, GitError> {
    executor.mutate(
        repository,
        [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(message)],
    )
}

pub(super) fn commit_files(
    executor: &SystemGitExecutor,
    repository: &Path,
    oid: &str,
) -> Result<Vec<GitCommitFile>, GitError> {
    let output = executor.git(
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

pub(super) fn commit_file_diff(
    executor: &SystemGitExecutor,
    repository: &Path,
    oid: &str,
    path: &str,
) -> Result<GitCommitFileDiff, GitError> {
    let repository = executor.repository_root(repository)?;
    let file = executor
        .commit_files(&repository, oid)?
        .into_iter()
        .find(|file| file.path == path)
        .ok_or_else(|| GitError::Conflict("该文件不属于所选提交".into()))?;
    let parent_oid = commit_parent_oid(executor, &repository, oid)?;
    let baseline_path = file.original_path.as_deref().unwrap_or(path);
    let before = match parent_oid.as_deref() {
        Some(parent) => tree_version(executor, &repository, parent, baseline_path)?,
        None => missing_version(),
    };
    let after = tree_version(executor, &repository, oid, path)?;
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

pub(super) fn change_diff(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
    staged: bool,
) -> Result<GitChangeDiff, GitError> {
    let repository = executor.repository_root(repository)?;
    let snapshot = executor.snapshot(&repository)?;
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
            head_version(executor, &repository, baseline_path)?,
            index_version(executor, &repository, path)?,
        )
    } else {
        (
            GitDiffScope::Unstaged,
            GitDiffSource::Index,
            GitDiffSource::Worktree,
            index_version(executor, &repository, baseline_path)?,
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
