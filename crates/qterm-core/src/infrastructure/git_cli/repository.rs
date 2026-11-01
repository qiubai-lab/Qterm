use super::*;

pub(super) fn snapshot(executor: &SystemGitExecutor, path: &Path) -> Result<GitSnapshot, GitError> {
    let repository = executor.repository_root(path)?;
    let (merge_in_progress, merge_head_oid) = executor.merge_head_state(&repository)?;
    let status = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("status"),
            OsString::from("--porcelain=v2"),
            OsString::from("-z"),
            OsString::from("--branch"),
            OsString::from("--untracked-files=all"),
        ],
        GIT_READ_BUDGET,
    )?;
    let branches = executor.git(
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
        GIT_READ_BUDGET,
    )?;
    let remotes = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("remote"),
        ],
        GIT_READ_BUDGET,
    )?;
    let log = executor.git(
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
        GIT_READ_BUDGET,
    );
    let (head, changes) = parse_status(&status.stdout)?;
    let index = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("ls-files"),
            OsString::from("--stage"),
            OsString::from("-z"),
        ],
        GIT_READ_BUDGET,
    )?;
    let config = executor
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
            GIT_READ_BUDGET,
        )
        .ok();
    let needs_submodule_status = index.stdout.windows(6).any(|value| value == b"160000")
        || config
            .as_ref()
            .is_some_and(|output| !output.stdout.is_empty());
    let submodule_status = needs_submodule_status
        .then(|| {
            executor.git(
                [
                    OsString::from("-C"),
                    repository.as_os_str().to_owned(),
                    OsString::from("submodule"),
                    OsString::from("status"),
                ],
                GIT_READ_BUDGET,
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

pub(super) fn initialize(
    executor: &SystemGitExecutor,
    path: &Path,
) -> Result<GitSnapshot, GitError> {
    if !path.is_dir() {
        return Err(GitError::InvalidPath);
    }
    executor.git(
        [
            OsString::from("-C"),
            path.as_os_str().to_owned(),
            OsString::from("init"),
        ],
        GIT_MUTATION_BUDGET,
    )?;
    executor.snapshot(path)
}
