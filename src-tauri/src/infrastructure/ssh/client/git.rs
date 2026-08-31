use std::time::Duration;

use russh::{ChannelMsg, client};

use crate::{
    domain::git::{
        GitBranchKind, GitCommitFile, GitError, GitSnapshot, RemoteGitAction,
        find_tracking_local_branch, validate_commit_oid, validate_remote_repository_path,
    },
    infrastructure::git_cli::{
        classify_failure, parse_branches, parse_commit_files, parse_commits, parse_status,
    },
};

use super::ClientHandler;

const READ_TIMEOUT: Duration = Duration::from_secs(10);
const MUTATION_TIMEOUT: Duration = Duration::from_secs(60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
const ENVIRONMENT: &str = "GIT_TERMINAL_PROMPT=0 GIT_EDITOR=true GIT_PAGER=cat LC_ALL=C";

struct RemoteOutput {
    stdout: Vec<u8>,
}

pub(super) async fn run_remote_git_action(
    handle: &client::Handle<ClientHandler>,
    action: RemoteGitAction,
) -> Result<GitSnapshot, GitError> {
    action.validate()?;
    ensure_capability(handle).await?;
    match action {
        RemoteGitAction::Snapshot { path } => snapshot(handle, &path).await,
        RemoteGitAction::Initialize { path } => {
            run_git(handle, &path, "init", Vec::new(), MUTATION_TIMEOUT).await?;
            snapshot(handle, &path).await
        }
        RemoteGitAction::Stage { repository, paths } => {
            run_git(
                handle,
                &repository,
                "add --pathspec-from-file=- --pathspec-file-nul",
                nul_payload(&paths),
                MUTATION_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::StageAll { repository } => {
            run_git(
                handle,
                &repository,
                "add -A --",
                Vec::new(),
                MUTATION_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::Unstage { repository, paths } => {
            let args = if has_head(handle, &repository).await {
                "reset -q HEAD --pathspec-from-file=- --pathspec-file-nul"
            } else {
                "update-index --force-remove -z --stdin"
            };
            run_git(
                handle,
                &repository,
                args,
                nul_payload(&paths),
                MUTATION_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::UnstageAll { repository } => {
            let args = if has_head(handle, &repository).await {
                "reset -q HEAD --"
            } else {
                "rm --cached -r -q --ignore-unmatch -- ."
            };
            run_git(handle, &repository, args, Vec::new(), MUTATION_TIMEOUT).await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::Commit {
            repository,
            message,
        } => {
            run_git(
                handle,
                &repository,
                "commit -F -",
                message.into_bytes(),
                MUTATION_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::CreateBranch { repository, name } => {
            let args = format!("switch -c {}", posix_literal(&name));
            run_git(handle, &repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::SwitchBranch { repository, name } => {
            let args = format!("switch {}", posix_literal(&name));
            run_git(handle, &repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::Fetch { repository } => {
            run_git(
                handle,
                &repository,
                "fetch --all --prune --no-recurse-submodules",
                Vec::new(),
                FETCH_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::TrackRemoteBranch {
            repository,
            ref_name,
        } => track_remote_branch(handle, &repository, &ref_name).await,
    }
}

pub(super) async fn commit_files(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    oid: &str,
) -> Result<Vec<GitCommitFile>, GitError> {
    validate_remote_repository_path(repository)?;
    validate_commit_oid(oid)?;
    ensure_capability(handle).await?;
    let args = format!(
        "diff-tree --root --first-parent --no-commit-id --name-status -r -z -M -C {}",
        posix_literal(oid)
    );
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
    Ok(parse_commit_files(&output.stdout))
}

async fn ensure_capability(handle: &client::Handle<ClientHandler>) -> Result<(), GitError> {
    let output = match run_command(
        handle,
        "printf '__QTERM_POSIX__\\n'; command -v git >/dev/null 2>&1 || exit 127; git --version",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await
    {
        Ok(output) => output,
        Err(GitError::Missing) => return Err(GitError::Missing),
        Err(GitError::SessionUnavailable | GitError::Timeout | GitError::OutputTooLarge) => {
            return Err(GitError::SessionUnavailable);
        }
        Err(_) => return Err(GitError::UnsupportedRemote),
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let Some(version) = text
        .lines()
        .find_map(|line| line.strip_prefix("git version "))
    else {
        return Err(GitError::UnsupportedRemote);
    };
    let mut components = version
        .split('.')
        .filter_map(|value| value.parse::<u32>().ok());
    let major = components.next().unwrap_or_default();
    let minor = components.next().unwrap_or_default();
    if major < 2 || (major == 2 && minor < 25) {
        return Err(GitError::UnsupportedRemote);
    }
    Ok(())
}

async fn snapshot(
    handle: &client::Handle<ClientHandler>,
    path: &str,
) -> Result<GitSnapshot, GitError> {
    let root = run_git(
        handle,
        path,
        "rev-parse --show-toplevel",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await?;
    let repository = String::from_utf8_lossy(&root.stdout)
        .trim_end_matches(['\r', '\n'])
        .to_owned();
    if repository.is_empty() {
        return Err(GitError::NotRepository);
    }
    let status = run_git(
        handle,
        &repository,
        "status --porcelain=v2 -z --branch --untracked-files=all",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await?;
    let branches = run_git(
        handle,
        &repository,
        "for-each-ref '--format=%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream)%00%(symref)' refs/heads/ refs/remotes/",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await?;
    let (head, changes) = parse_status(&status.stdout)?;
    let commits = if head.unborn {
        Vec::new()
    } else {
        let log = run_git(
            handle,
            &repository,
            "log --all --topo-order --decorate=short -n 100 '--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%at%x1f%b%x1e'",
            Vec::new(),
            READ_TIMEOUT,
        )
        .await?;
        parse_commits(&log.stdout)
    };
    let repository_name = repository
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(&repository)
        .to_owned();
    Ok(GitSnapshot {
        repository_path: repository,
        repository_name,
        head,
        changes,
        branches: parse_branches(&branches.stdout),
        commits,
    })
}

async fn track_remote_branch(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    ref_name: &str,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
    let branch_name = if let Some(local) = find_tracking_local_branch(&current.branches, ref_name) {
        local.name.clone()
    } else {
        let remote = current
            .branches
            .iter()
            .find(|branch| branch.kind == GitBranchKind::Remote && branch.ref_name == ref_name)
            .ok_or(GitError::InvalidInput)?;
        let args = format!("switch --track {}", posix_literal(&remote.name));
        run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
        return snapshot(handle, repository).await;
    };
    let args = format!("switch {}", posix_literal(&branch_name));
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn has_head(handle: &client::Handle<ClientHandler>, repository: &str) -> bool {
    run_git(
        handle,
        repository,
        "rev-parse --verify HEAD",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await
    .is_ok()
}

async fn run_git(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    args: &str,
    stdin: Vec<u8>,
    timeout: Duration,
) -> Result<RemoteOutput, GitError> {
    let command = format!("{ENVIRONMENT} git -C {} {args}", posix_literal(repository));
    run_command(handle, &command, stdin, timeout).await
}

async fn run_command(
    handle: &client::Handle<ClientHandler>,
    command: &str,
    stdin: Vec<u8>,
    timeout: Duration,
) -> Result<RemoteOutput, GitError> {
    tokio::time::timeout(timeout, run_command_inner(handle, command, stdin))
        .await
        .map_err(|_| GitError::Timeout)?
}

async fn run_command_inner(
    handle: &client::Handle<ClientHandler>,
    command: &str,
    stdin: Vec<u8>,
) -> Result<RemoteOutput, GitError> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|_| GitError::SessionUnavailable)?;
    channel
        .exec(true, command)
        .await
        .map_err(|_| GitError::SessionUnavailable)?;
    if !stdin.is_empty() {
        channel
            .data(&stdin[..])
            .await
            .map_err(|_| GitError::SessionUnavailable)?;
    }
    channel
        .eof()
        .await
        .map_err(|_| GitError::SessionUnavailable)?;
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status = None;
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } => append_bounded(&mut stdout, &data)?,
            ChannelMsg::ExtendedData { data, .. } => append_bounded(&mut stderr, &data)?,
            ChannelMsg::ExitStatus {
                exit_status: status,
            } => exit_status = Some(status),
            _ => {}
        }
    }
    match exit_status {
        Some(0) => Ok(RemoteOutput { stdout }),
        Some(127) => Err(GitError::Missing),
        Some(_) => Err(classify_remote_failure(&stderr)),
        None => Err(GitError::SessionUnavailable),
    }
}

fn append_bounded(target: &mut Vec<u8>, data: &[u8]) -> Result<(), GitError> {
    if target.len().saturating_add(data.len()) > OUTPUT_LIMIT {
        return Err(GitError::OutputTooLarge);
    }
    target.extend_from_slice(data);
    Ok(())
}

fn classify_remote_failure(stderr: &[u8]) -> GitError {
    let lower = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    if lower.contains("permission denied") || lower.contains("operation not permitted") {
        GitError::PermissionDenied
    } else {
        classify_failure(stderr)
    }
}

fn nul_payload(paths: &[String]) -> Vec<u8> {
    let mut payload = Vec::new();
    for path in paths {
        payload.extend_from_slice(path.as_bytes());
        payload.push(0);
    }
    payload
}

pub(crate) fn posix_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::{nul_payload, posix_literal};

    #[test]
    fn quotes_spaces_quotes_newlines_unicode_and_leading_dashes_as_one_posix_literal() {
        assert_eq!(
            posix_literal("/srv/a b/it's\n-项目"),
            "'/srv/a b/it'\\''s\n-项目'"
        );
    }

    #[test]
    fn pathspec_payload_is_nul_delimited_without_shell_text() {
        assert_eq!(
            nul_payload(&["-leading.txt".into(), "目录/a b.txt".into()]),
            b"-leading.txt\0\xE7\x9B\xAE\xE5\xBD\x95/a b.txt\0"
        );
    }
}
