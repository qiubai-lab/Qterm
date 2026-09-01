use std::time::Duration;

use russh::{ChannelMsg, client};

use crate::{
    domain::git::{
        GitBranch, GitBranchKind, GitChangeDiff, GitCommitFile, GitCommitFileDiff,
        GitConflictContentKind, GitConflictDetail, GitConflictKind, GitConflictResolution,
        GitConflictResult, GitConflictVersion, GitDiffScope, GitDiffSource, GitError, GitSnapshot,
        MAX_CONFLICT_TEXT_BYTES, MAX_GIT_DIFF_TEXT_BYTES, RemoteGitAction,
        find_tracking_local_branch, plan_discard, validate_abort_merge, validate_branch_name,
        validate_branch_source_ref, validate_commit_oid, validate_continue_merge,
        validate_local_branch_ref, validate_merge_preconditions, validate_posix_paths,
        validate_remote_name, validate_remote_repository_path, validate_stage_all,
    },
    infrastructure::git_cli::{
        build_conflict_detail, classify_failure, parse_branches, parse_commit_files, parse_commits,
        parse_status,
    },
};

use super::ClientHandler;

const READ_TIMEOUT: Duration = Duration::from_secs(10);
const MUTATION_TIMEOUT: Duration = Duration::from_secs(60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
const ENVIRONMENT: &str = "GIT_TERMINAL_PROMPT=0 GIT_EDITOR=true GIT_PAGER=cat LC_ALL=C";
const STAGE_PATHS_ARGS: &str = "--literal-pathspecs add --pathspec-from-file=- --pathspec-file-nul";
const UNSTAGE_PATHS_WITH_HEAD_ARGS: &str =
    "--literal-pathspecs reset -q HEAD --pathspec-from-file=- --pathspec-file-nul";
const UNSTAGE_PATHS_WITHOUT_HEAD_ARGS: &str =
    "--literal-pathspecs update-index --force-remove -z --stdin";
const DISCARD_TRACKED_PATHS_ARGS: &str =
    "--literal-pathspecs checkout --pathspec-from-file=- --pathspec-file-nul";

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
                STAGE_PATHS_ARGS,
                nul_payload(&paths),
                MUTATION_TIMEOUT,
            )
            .await?;
            snapshot(handle, &repository).await
        }
        RemoteGitAction::StageAll { repository } => {
            let current = snapshot(handle, &repository).await?;
            validate_stage_all(&current)?;
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
                UNSTAGE_PATHS_WITH_HEAD_ARGS
            } else {
                UNSTAGE_PATHS_WITHOUT_HEAD_ARGS
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
        RemoteGitAction::Discard { repository, paths } => {
            let current = snapshot(handle, &repository).await?;
            let plan = plan_discard(&current, &paths)?;
            if !plan.tracked_paths.is_empty() {
                run_git(
                    handle,
                    &repository,
                    DISCARD_TRACKED_PATHS_ARGS,
                    nul_payload(&plan.tracked_paths),
                    MUTATION_TIMEOUT,
                )
                .await?;
            }
            if !plan.untracked_paths.is_empty() {
                let quoted = plan
                    .untracked_paths
                    .iter()
                    .map(|path| posix_literal(path))
                    .collect::<Vec<_>>()
                    .join(" ");
                let args = format!("--literal-pathspecs clean -f -- {quoted}");
                run_git(handle, &repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
            }
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
        RemoteGitAction::CreateBranchFrom {
            repository,
            name,
            source_ref,
        } => create_branch_from(handle, &repository, &name, &source_ref).await,
        RemoteGitAction::CreateBranchFromCommit {
            repository,
            name,
            oid,
        } => create_branch_from_commit(handle, &repository, &name, &oid).await,
        RemoteGitAction::RenameBranch {
            repository,
            ref_name,
            new_name,
        } => rename_branch(handle, &repository, &ref_name, &new_name).await,
        RemoteGitAction::DeleteBranch {
            repository,
            ref_name,
        } => delete_branch(handle, &repository, &ref_name).await,
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
        RemoteGitAction::Pull { repository } => pull(handle, &repository).await,
        RemoteGitAction::Push { repository, remote } => {
            push(handle, &repository, remote.as_deref()).await
        }
        RemoteGitAction::TrackRemoteBranch {
            repository,
            ref_name,
        } => track_remote_branch(handle, &repository, &ref_name).await,
        RemoteGitAction::MergeBranch {
            repository,
            source_ref,
        } => merge_branch(handle, &repository, &source_ref).await,
        RemoteGitAction::ContinueMerge { repository } => continue_merge(handle, &repository).await,
        RemoteGitAction::AbortMerge { repository } => abort_merge(handle, &repository).await,
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

pub(super) async fn commit_file_diff(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    oid: &str,
    path: &str,
) -> Result<GitCommitFileDiff, GitError> {
    validate_remote_repository_path(repository)?;
    validate_commit_oid(oid)?;
    validate_posix_paths(&[path.to_owned()])?;
    let file = commit_files(handle, repository, oid)
        .await?
        .into_iter()
        .find(|file| file.path == path)
        .ok_or_else(|| GitError::Conflict("该文件不属于所选提交".into()))?;
    let parent_oid = remote_commit_parent_oid(handle, repository, oid).await?;
    let baseline_path = file.original_path.as_deref().unwrap_or(path);
    let before = match parent_oid.as_deref() {
        Some(parent) => remote_tree_version(handle, repository, parent, baseline_path).await?,
        None => missing_version(),
    };
    let after = remote_tree_version(handle, repository, oid, path).await?;
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

pub(super) async fn change_diff(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    staged: bool,
    worktree: Option<GitConflictVersion>,
) -> Result<GitChangeDiff, GitError> {
    validate_remote_repository_path(repository)?;
    validate_posix_paths(&[path.to_owned()])?;
    let current = snapshot(handle, repository).await?;
    let change = current
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
            remote_head_version(handle, repository, baseline_path).await?,
            remote_index_version(handle, repository, path).await?,
        )
    } else {
        (
            GitDiffScope::Unstaged,
            GitDiffSource::Index,
            GitDiffSource::Worktree,
            remote_index_version(handle, repository, baseline_path).await?,
            worktree.ok_or(GitError::Io)?,
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

struct RemoteBlobEntry {
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

async fn remote_head_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    if !has_head(handle, repository).await {
        return Ok(missing_version());
    }
    remote_tree_version(handle, repository, "HEAD", path).await
}

async fn remote_tree_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    revision: &str,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let args = format!(
        "--literal-pathspecs ls-tree -z {} -- {}",
        posix_literal(revision),
        posix_literal(path)
    );
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
    match parse_remote_tree_entry(&output.stdout, path)? {
        Some(entry) => remote_blob_version(handle, repository, entry).await,
        None => Ok(missing_version()),
    }
}

async fn remote_commit_parent_oid(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    oid: &str,
) -> Result<Option<String>, GitError> {
    let args = format!("rev-list --parents -n 1 {}", posix_literal(oid));
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
    let line = String::from_utf8_lossy(&output.stdout);
    let mut fields = line.split_whitespace();
    let commit = fields.next().ok_or(GitError::Io)?;
    if commit != oid {
        return Err(GitError::Io);
    }
    Ok(fields.next().map(str::to_owned))
}

async fn remote_index_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let args = format!(
        "--literal-pathspecs ls-files --stage -z -- {}",
        posix_literal(path)
    );
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
    match parse_remote_index_entry(&output.stdout, path)? {
        Some(entry) => remote_blob_version(handle, repository, entry).await,
        None => Ok(missing_version()),
    }
}

fn parse_remote_tree_entry(bytes: &[u8], path: &str) -> Result<Option<RemoteBlobEntry>, GitError> {
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
    Ok(Some(RemoteBlobEntry {
        mode: fields
            .first()
            .and_then(|value| u32::from_str_radix(value, 8).ok())
            .ok_or(GitError::Io)?,
        oid: fields.get(2).ok_or(GitError::Io)?.to_string(),
    }))
}

fn parse_remote_index_entry(bytes: &[u8], path: &str) -> Result<Option<RemoteBlobEntry>, GitError> {
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
        return Ok(Some(RemoteBlobEntry {
            mode: fields
                .first()
                .and_then(|value| u32::from_str_radix(value, 8).ok())
                .ok_or(GitError::Io)?,
            oid: fields.get(1).ok_or(GitError::Io)?.to_string(),
        }));
    }
    Ok(None)
}

async fn remote_blob_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    entry: RemoteBlobEntry,
) -> Result<GitConflictVersion, GitError> {
    if !is_regular_mode(entry.mode) {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(entry.mode),
        });
    }
    let size_args = format!("cat-file -s {}", posix_literal(&entry.oid));
    let size_output = run_git(handle, repository, &size_args, Vec::new(), READ_TIMEOUT).await?;
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
    let args = format!("cat-file blob {}", posix_literal(&entry.oid));
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
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

pub(super) async fn conflict_detail(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    result: GitConflictResult,
) -> Result<GitConflictDetail, GitError> {
    validate_remote_repository_path(repository)?;
    validate_posix_paths(&[path.to_owned()])?;
    let snapshot = snapshot(handle, repository).await?;
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
    let stages = conflict_stages(handle, repository, path).await?;
    let base = conflict_stage_version(handle, repository, path, &stages, 1).await?;
    let current = conflict_stage_version(handle, repository, path, &stages, 2).await?;
    let incoming = conflict_stage_version(handle, repository, path, &stages, 3).await?;
    Ok(build_conflict_detail(
        path.to_owned(),
        change.conflict_kind.unwrap_or(GitConflictKind::Other),
        base,
        current,
        incoming,
        result,
    ))
}

pub(super) async fn resolve_conflict(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    resolution: &GitConflictResolution,
) -> Result<GitSnapshot, GitError> {
    validate_remote_repository_path(repository)?;
    validate_posix_paths(&[path.to_owned()])?;
    let detail = conflict_detail(
        handle,
        repository,
        path,
        GitConflictResult {
            kind: GitConflictContentKind::Missing,
            content: None,
            revision: "missing".into(),
            size: 0,
            mode: None,
        },
    )
    .await?;
    match resolution {
        GitConflictResolution::UseCurrent => {
            ensure_regular_side(&detail.current, "当前版本不存在或不支持直接采用")?;
            checkout_side(handle, repository, path, "--ours").await?;
            stage_conflict(handle, repository, path).await?;
        }
        GitConflictResolution::UseIncoming => {
            ensure_regular_side(&detail.incoming, "传入版本不存在或不支持直接采用")?;
            checkout_side(handle, repository, path, "--theirs").await?;
            stage_conflict(handle, repository, path).await?;
        }
        GitConflictResolution::Delete => {
            if detail.current.kind != GitConflictContentKind::Missing
                && detail.incoming.kind != GitConflictContentKind::Missing
            {
                return Err(GitError::Conflict("该冲突不能直接选择删除结果".into()));
            }
            let args = format!("--literal-pathspecs rm -f -- {}", posix_literal(path));
            run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
        }
        GitConflictResolution::MarkResolved => {
            stage_conflict(handle, repository, path).await?;
        }
        GitConflictResolution::SaveText { .. } => return Err(GitError::InvalidInput),
    }
    snapshot(handle, repository).await
}

#[derive(Clone, Copy)]
struct ConflictStage {
    stage: u8,
    mode: u32,
}

async fn conflict_stages(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<Vec<ConflictStage>, GitError> {
    let args = format!(
        "--literal-pathspecs ls-files --unmerged -z -- {}",
        posix_literal(path)
    );
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
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

async fn conflict_stage_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
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
    let size_args = format!("cat-file -s {}", posix_literal(&object));
    let size_output = run_git(handle, repository, &size_args, Vec::new(), READ_TIMEOUT).await?;
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
    let args = format!("cat-file blob {}", posix_literal(&object));
    let output = run_git(handle, repository, &args, Vec::new(), READ_TIMEOUT).await?;
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

async fn checkout_side(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    side: &str,
) -> Result<(), GitError> {
    let args = format!(
        "--literal-pathspecs checkout {side} -- {}",
        posix_literal(path)
    );
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    Ok(())
}

async fn stage_conflict(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<(), GitError> {
    run_git(
        handle,
        repository,
        STAGE_PATHS_ARGS,
        nul_payload(&[path.to_owned()]),
        MUTATION_TIMEOUT,
    )
    .await?;
    Ok(())
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
    let (merge_in_progress, merge_head_oid) = merge_head_state(handle, &repository).await?;
    let branches = run_git(
        handle,
        &repository,
        "for-each-ref '--format=%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream)%00%(symref)' refs/heads/ refs/remotes/",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await?;
    let remotes = run_git(handle, &repository, "remote", Vec::new(), READ_TIMEOUT).await?;
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
        remotes: parse_remotes(&remotes.stdout),
        commits,
        merge_in_progress,
        merge_head_oid,
    })
}

async fn create_branch_from(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    name: &str,
    source_ref: &str,
) -> Result<GitSnapshot, GitError> {
    validate_branch_source_ref(source_ref)?;
    let current = snapshot(handle, repository).await?;
    if !current
        .branches
        .iter()
        .any(|branch| branch.ref_name == source_ref)
    {
        return Err(GitError::InvalidInput);
    }
    let args = format!(
        "switch --no-track -c {} {}",
        posix_literal(name),
        posix_literal(source_ref)
    );
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn create_branch_from_commit(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    name: &str,
    oid: &str,
) -> Result<GitSnapshot, GitError> {
    validate_branch_name(name)?;
    validate_commit_oid(oid)?;
    let args = format!(
        "switch --no-track -c {} {}",
        posix_literal(name),
        posix_literal(oid)
    );
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn rename_branch(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    ref_name: &str,
    new_name: &str,
) -> Result<GitSnapshot, GitError> {
    validate_local_branch_ref(ref_name)?;
    let current = snapshot(handle, repository).await?;
    let old_name = local_branch(&current, ref_name)?.name.clone();
    let args = format!(
        "branch -m {} {}",
        posix_literal(&old_name),
        posix_literal(new_name)
    );
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn delete_branch(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    ref_name: &str,
) -> Result<GitSnapshot, GitError> {
    validate_local_branch_ref(ref_name)?;
    let current = snapshot(handle, repository).await?;
    let branch = local_branch(&current, ref_name)?;
    if branch.current {
        return Err(GitError::Conflict("不能删除当前分支".into()));
    }
    let args = format!("branch -d {}", posix_literal(&branch.name));
    run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn pull(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
    let (_, remote, target_ref) = current_tracking(&current)?;
    let args = format!(
        "pull --ff-only --no-rebase --no-recurse-submodules {} {}",
        posix_literal(&remote),
        posix_literal(&target_ref)
    );
    run_git(handle, repository, &args, Vec::new(), FETCH_TIMEOUT).await?;
    snapshot(handle, repository).await
}

async fn push(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    remote: Option<&str>,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
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
    let args = if publish {
        format!(
            "push --set-upstream {} {}",
            posix_literal(&remote),
            posix_literal(&refspec)
        )
    } else {
        format!(
            "push {} {}",
            posix_literal(&remote),
            posix_literal(&refspec)
        )
    };
    run_git(handle, repository, &args, Vec::new(), FETCH_TIMEOUT).await?;
    snapshot(handle, repository).await
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
            validate_branch_name(target)?;
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

async fn merge_branch(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    source_ref: &str,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
    validate_merge_preconditions(&current, source_ref)?;
    let args = format!("merge --no-edit -- {}", posix_literal(source_ref));
    match run_git(handle, repository, &args, Vec::new(), MUTATION_TIMEOUT).await {
        Ok(_) => snapshot(handle, repository).await,
        Err(failure) => match snapshot(handle, repository).await {
            Ok(snapshot) if snapshot.merge_in_progress => Ok(snapshot),
            _ => Err(failure),
        },
    }
}

async fn continue_merge(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
    validate_continue_merge(&current)?;
    run_git(
        handle,
        repository,
        "merge --continue",
        Vec::new(),
        MUTATION_TIMEOUT,
    )
    .await?;
    snapshot(handle, repository).await
}

async fn abort_merge(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
) -> Result<GitSnapshot, GitError> {
    let current = snapshot(handle, repository).await?;
    validate_abort_merge(&current)?;
    run_git(
        handle,
        repository,
        "merge --abort",
        Vec::new(),
        MUTATION_TIMEOUT,
    )
    .await?;
    snapshot(handle, repository).await
}

async fn merge_head_state(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
) -> Result<(bool, Option<String>), GitError> {
    match run_git(
        handle,
        repository,
        "rev-parse --verify -q MERGE_HEAD",
        Vec::new(),
        READ_TIMEOUT,
    )
    .await
    {
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
    use super::{
        STAGE_PATHS_ARGS, UNSTAGE_PATHS_WITH_HEAD_ARGS, UNSTAGE_PATHS_WITHOUT_HEAD_ARGS,
        nul_payload, parse_remote_index_entry, parse_remote_tree_entry, posix_literal,
    };

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

    #[test]
    fn literal_pathspec_commands_preserve_nul_delimited_paths() {
        for args in [
            STAGE_PATHS_ARGS,
            UNSTAGE_PATHS_WITH_HEAD_ARGS,
            UNSTAGE_PATHS_WITHOUT_HEAD_ARGS,
        ] {
            assert!(args.starts_with("--literal-pathspecs "), "{args}");
        }
        assert!(STAGE_PATHS_ARGS.contains("--pathspec-file-nul"));
        assert!(UNSTAGE_PATHS_WITH_HEAD_ARGS.contains("--pathspec-file-nul"));
        assert!(UNSTAGE_PATHS_WITHOUT_HEAD_ARGS.ends_with("-z --stdin"));
    }

    #[test]
    fn parses_remote_head_and_index_entries_for_literal_unicode_paths() {
        let path = "-目录/a b.txt";
        let tree = format!("100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\t{path}\0");
        let tree_entry = parse_remote_tree_entry(tree.as_bytes(), path)
            .expect("tree entry")
            .expect("present tree entry");
        assert_eq!(tree_entry.mode, 0o100644);
        assert_eq!(tree_entry.oid, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        let index = format!("100755 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\t{path}\0");
        let index_entry = parse_remote_index_entry(index.as_bytes(), path)
            .expect("index entry")
            .expect("present index entry");
        assert_eq!(index_entry.mode, 0o100755);
        assert_eq!(index_entry.oid, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    }
}
