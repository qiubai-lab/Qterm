use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::git_service::{
        GitService, execute_remote_git, execute_remote_git_change_diff,
        execute_remote_git_commit_file_diff, execute_remote_git_commit_files,
        execute_remote_git_conflict_detail, execute_remote_git_resolve_conflict,
    },
    commands::{
        credential::CredentialState,
        error::IpcError,
        native_dialog,
        profile::ProfileState,
        session::{SessionConnectDto, SessionEventDto, SessionState, build_connect_request},
    },
    domain::{
        files::{DirectoryListing, FileEntry},
        git::{
            GitBranch, GitBranchKind, GitChange, GitChangeDiff, GitCommit, GitCommitFile,
            GitCommitFileDiff, GitConflictContentKind, GitConflictDetail, GitConflictKind,
            GitConflictResolution, GitConflictResult, GitConflictVersion, GitDiffScope,
            GitDiffSource, GitError, GitHead, GitSnapshot, RemoteGitAction,
        },
        transfer::RemotePath,
    },
    infrastructure::{
        git_cli::SystemGitExecutor,
        ssh::client::{SessionControlError, SessionPurpose},
    },
};

pub struct GitState {
    service: Arc<GitService<SystemGitExecutor>>,
}

impl GitState {
    pub fn new(executor: SystemGitExecutor) -> Self {
        Self {
            service: Arc::new(GitService::new(executor)),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIpcError {
    code: &'static str,
    message: String,
    retryable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotDto {
    repository_path: String,
    repository_name: String,
    head: GitHeadDto,
    changes: Vec<GitChangeDto>,
    branches: Vec<GitBranchDto>,
    remotes: Vec<String>,
    commits: Vec<GitCommitDto>,
    merge_in_progress: bool,
    merge_head_oid: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHeadDto {
    name: Option<String>,
    oid: Option<String>,
    detached: bool,
    unborn: bool,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitChangeDto {
    path: String,
    original_path: Option<String>,
    status: String,
    staged: bool,
    conflict: bool,
    conflict_kind: Option<GitConflictKindDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitConflictKindDto {
    BothModified,
    BothAdded,
    CurrentDeleted,
    IncomingDeleted,
    BothDeleted,
    Other,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitConflictContentKindDto {
    Missing,
    Text,
    Binary,
    Unsupported,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictVersionDto {
    kind: GitConflictContentKindDto,
    content: Option<String>,
    size: u64,
    mode: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictResultDto {
    kind: GitConflictContentKindDto,
    content: Option<String>,
    revision: String,
    size: u64,
    mode: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictDetailDto {
    path: String,
    kind: GitConflictKindDto,
    base: GitConflictVersionDto,
    current: GitConflictVersionDto,
    incoming: GitConflictVersionDto,
    result: GitConflictResultDto,
    editable: bool,
    unsupported_reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitDiffScopeDto {
    Staged,
    Unstaged,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitDiffSourceDto {
    Head,
    Index,
    Worktree,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeDiffDto {
    path: String,
    original_path: Option<String>,
    status: String,
    scope: GitDiffScopeDto,
    before_source: GitDiffSourceDto,
    after_source: GitDiffSourceDto,
    before: GitConflictVersionDto,
    after: GitConflictVersionDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFileDiffDto {
    commit_oid: String,
    parent_oid: Option<String>,
    path: String,
    original_path: Option<String>,
    status: String,
    before: GitConflictVersionDto,
    after: GitConflictVersionDto,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchDto {
    ref_name: String,
    name: String,
    kind: GitBranchKindDto,
    oid: String,
    current: bool,
    upstream: Option<String>,
    upstream_ref: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitBranchKindDto {
    Local,
    Remote,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitDto {
    oid: String,
    parents: Vec<String>,
    decorations: Vec<String>,
    subject: String,
    body: String,
    author: String,
    timestamp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFileDto {
    path: String,
    original_path: Option<String>,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDirectoryInput {
    initial_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPathInput {
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitRepositoryInput {
    repository: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPathsInput {
    repository: String,
    paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitCommitInput {
    repository: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCommitFilesInput {
    repository: String,
    oid: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitCommitFileDiffInput {
    repository: String,
    oid: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitBranchInput {
    repository: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCreateBranchFromInput {
    repository: String,
    name: String,
    source_ref: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCreateBranchFromCommitInput {
    repository: String,
    name: String,
    oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRenameBranchInput {
    repository: String,
    ref_name: String,
    new_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDeleteBranchInput {
    repository: String,
    ref_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPushInput {
    repository: String,
    remote: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRemoteBranchInput {
    repository: String,
    ref_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitMergeBranchInput {
    repository: String,
    source_ref: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitConflictDetailInput {
    repository: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitChangeDiffInput {
    repository: String,
    path: String,
    staged: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitResolveConflictInput {
    repository: String,
    path: String,
    resolution: GitConflictResolutionDto,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitConflictResolutionDto {
    SaveText {
        content: String,
        expected_revision: String,
    },
    UseCurrent {},
    UseIncoming {},
    Delete {},
    MarkResolved {},
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitInput {
    session_id: String,
    profile_id: String,
    action: RemoteGitActionDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitCommitFilesInput {
    session_id: String,
    profile_id: String,
    repository: String,
    oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitCommitFileDiffInput {
    session_id: String,
    profile_id: String,
    repository: String,
    oid: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitConflictDetailInput {
    session_id: String,
    profile_id: String,
    repository: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitChangeDiffInput {
    session_id: String,
    profile_id: String,
    repository: String,
    path: String,
    staged: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitResolveConflictInput {
    session_id: String,
    profile_id: String,
    repository: String,
    path: String,
    resolution: GitConflictResolutionDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitDirectoryInput {
    session_id: String,
    profile_id: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDirectoryListingDto {
    path: String,
    entries: Vec<GitDirectoryEntryDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDirectoryEntryDto {
    name: String,
    path: String,
    is_symlink: bool,
    modified_at: Option<u64>,
    permission_mode: Option<u32>,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RemoteGitActionDto {
    Snapshot {
        path: String,
    },
    Initialize {
        path: String,
    },
    Stage {
        repository: String,
        paths: Vec<String>,
    },
    StageAll {
        repository: String,
    },
    Unstage {
        repository: String,
        paths: Vec<String>,
    },
    UnstageAll {
        repository: String,
    },
    Discard {
        repository: String,
        paths: Vec<String>,
    },
    Commit {
        repository: String,
        message: String,
    },
    CreateBranch {
        repository: String,
        name: String,
    },
    CreateBranchFrom {
        repository: String,
        name: String,
        source_ref: String,
    },
    CreateBranchFromCommit {
        repository: String,
        name: String,
        oid: String,
    },
    RenameBranch {
        repository: String,
        ref_name: String,
        new_name: String,
    },
    DeleteBranch {
        repository: String,
        ref_name: String,
    },
    SwitchBranch {
        repository: String,
        name: String,
    },
    Fetch {
        repository: String,
    },
    Pull {
        repository: String,
    },
    Push {
        repository: String,
        remote: Option<String>,
    },
    TrackRemoteBranch {
        repository: String,
        ref_name: String,
    },
    MergeBranch {
        repository: String,
        source_ref: String,
    },
    ContinueMerge {
        repository: String,
    },
    AbortMerge {
        repository: String,
    },
}

#[tauri::command]
pub fn git_available(state: State<'_, GitState>) -> bool {
    state.service.available()
}

#[tauri::command]
pub fn git_session_connect(
    input: SessionConnectDto,
    on_event: Channel<SessionEventDto>,
    session_state: State<'_, SessionState>,
    credential_state: State<'_, CredentialState>,
    profile_state: State<'_, ProfileState>,
) -> Result<String, crate::commands::error::IpcError> {
    let request = build_connect_request(
        input,
        &credential_state,
        &profile_state,
        SessionPurpose::Git,
        Arc::new(|_| {}),
        false,
    )?;
    let events = Arc::new(move |event| {
        let _ = on_event.send(SessionEventDto::from(event));
    });
    Ok(session_state.manager().connect(request, events))
}

#[tauri::command]
pub async fn git_remote_execute(
    input: RemoteGitInput,
    session_state: State<'_, SessionState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let action: RemoteGitAction = input.action.into();
    execute_remote_git(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        action,
    )
    .await
    .map(GitSnapshotDto::from)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_commit_files(
    input: RemoteGitCommitFilesInput,
    session_state: State<'_, SessionState>,
) -> Result<Vec<GitCommitFileDto>, GitIpcError> {
    execute_remote_git_commit_files(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.oid,
    )
    .await
    .map(|files| files.into_iter().map(Into::into).collect())
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_commit_file_diff(
    input: RemoteGitCommitFileDiffInput,
    session_state: State<'_, SessionState>,
) -> Result<GitCommitFileDiffDto, GitIpcError> {
    execute_remote_git_commit_file_diff(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.oid,
        input.path,
    )
    .await
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_conflict_detail(
    input: RemoteGitConflictDetailInput,
    session_state: State<'_, SessionState>,
) -> Result<GitConflictDetailDto, GitIpcError> {
    execute_remote_git_conflict_detail(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
    )
    .await
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_change_diff(
    input: RemoteGitChangeDiffInput,
    session_state: State<'_, SessionState>,
) -> Result<GitChangeDiffDto, GitIpcError> {
    execute_remote_git_change_diff(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
        input.staged,
    )
    .await
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_resolve_conflict(
    input: RemoteGitResolveConflictInput,
    session_state: State<'_, SessionState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    execute_remote_git_resolve_conflict(
        session_state.manager().as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
        input.resolution.into(),
    )
    .await
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_remote_list_directory(
    input: RemoteGitDirectoryInput,
    session_state: State<'_, SessionState>,
) -> Result<GitDirectoryListingDto, IpcError> {
    let path = RemotePath::new(input.path)
        .map_err(|_| IpcError::new("invalidFilePath", "远程仓库路径无效", false))?;
    session_state
        .manager()
        .list_git_directory(&input.session_id, &input.profile_id, path)
        .await
        .map(GitDirectoryListingDto::from)
        .map_err(git_directory_error)
}

#[tauri::command]
pub async fn git_select_repository_directory(
    input: GitDirectoryInput,
    app: AppHandle,
) -> Option<String> {
    let mut picker = app.dialog().file().set_title("选择 Git 仓库或待初始化目录");
    if let Some(path) = input
        .initial_path
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute())
    {
        picker = picker.set_directory(path);
    }
    native_dialog::pick_folder(picker)
        .await
        .and_then(|selection| selection.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn git_snapshot(
    input: GitPathInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.snapshot(input.path)).await
}

#[tauri::command]
pub async fn git_initialize(
    input: GitPathInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.initialize(input.path)).await
}

#[tauri::command]
pub async fn git_stage(
    input: GitPathsInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.stage(input.repository, input.paths)).await
}

#[tauri::command]
pub async fn git_stage_all(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.stage_all(input.repository)).await
}

#[tauri::command]
pub async fn git_unstage(
    input: GitPathsInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.unstage(input.repository, input.paths)).await
}

#[tauri::command]
pub async fn git_unstage_all(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.unstage_all(input.repository)).await
}

#[tauri::command]
pub async fn git_discard(
    input: GitPathsInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.discard(input.repository, input.paths)).await
}

#[tauri::command]
pub async fn git_commit(
    input: GitCommitInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.commit(input.repository, input.message)).await
}

#[tauri::command]
pub async fn git_commit_files(
    input: GitCommitFilesInput,
    state: State<'_, GitState>,
) -> Result<Vec<GitCommitFileDto>, GitIpcError> {
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || service.commit_files(input.repository, input.oid))
        .await
        .map_err(|_| GitIpcError::from(GitError::Io))?
        .map(|files| files.into_iter().map(Into::into).collect())
        .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_commit_file_diff(
    input: GitCommitFileDiffInput,
    state: State<'_, GitState>,
) -> Result<GitCommitFileDiffDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || {
        service.commit_file_diff(input.repository, input.oid, input.path)
    })
    .await
    .map_err(|_| GitIpcError::from(GitError::Io))?
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_conflict_detail(
    input: GitConflictDetailInput,
    state: State<'_, GitState>,
) -> Result<GitConflictDetailDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || {
        service.conflict_detail(input.repository, input.path)
    })
    .await
    .map_err(|_| GitIpcError::from(GitError::Io))?
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_change_diff(
    input: GitChangeDiffInput,
    state: State<'_, GitState>,
) -> Result<GitChangeDiffDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || {
        service.change_diff(input.repository, input.path, input.staged)
    })
    .await
    .map_err(|_| GitIpcError::from(GitError::Io))?
    .map(Into::into)
    .map_err(GitIpcError::from)
}

#[tauri::command]
pub async fn git_resolve_conflict(
    input: GitResolveConflictInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.resolve_conflict(input.repository, input.path, input.resolution.into()))
        .await
}

#[tauri::command]
pub async fn git_create_branch(
    input: GitBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.create_branch(input.repository, input.name)).await
}

#[tauri::command]
pub async fn git_create_branch_from(
    input: GitCreateBranchFromInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.create_branch_from(input.repository, input.name, input.source_ref)).await
}

#[tauri::command]
pub async fn git_create_branch_from_commit(
    input: GitCreateBranchFromCommitInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.create_branch_from_commit(input.repository, input.name, input.oid)).await
}

#[tauri::command]
pub async fn git_rename_branch(
    input: GitRenameBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.rename_branch(input.repository, input.ref_name, input.new_name)).await
}

#[tauri::command]
pub async fn git_delete_branch(
    input: GitDeleteBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.delete_branch(input.repository, input.ref_name)).await
}

#[tauri::command]
pub async fn git_switch_branch(
    input: GitBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.switch_branch(input.repository, input.name)).await
}

#[tauri::command]
pub async fn git_fetch(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.fetch(input.repository)).await
}

#[tauri::command]
pub async fn git_pull(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.pull(input.repository)).await
}

#[tauri::command]
pub async fn git_push(
    input: GitPushInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.push(input.repository, input.remote)).await
}

#[tauri::command]
pub async fn git_track_remote_branch(
    input: GitRemoteBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.track_remote_branch(input.repository, input.ref_name)).await
}

#[tauri::command]
pub async fn git_merge_branch(
    input: GitMergeBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.merge_branch(input.repository, input.source_ref)).await
}

#[tauri::command]
pub async fn git_continue_merge(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.continue_merge(input.repository)).await
}

#[tauri::command]
pub async fn git_abort_merge(
    input: GitRepositoryInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.abort_merge(input.repository)).await
}

async fn run<F>(operation: F) -> Result<GitSnapshotDto, GitIpcError>
where
    F: FnOnce() -> Result<GitSnapshot, GitError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| GitIpcError::from(GitError::Io))?
        .map(GitSnapshotDto::from)
        .map_err(GitIpcError::from)
}

fn git_directory_error(error: SessionControlError) -> IpcError {
    match error {
        SessionControlError::SessionNotFound => {
            IpcError::new("sessionNotFound", "远程 Git 连接不存在，请重新连接", true)
        }
        SessionControlError::SessionNotConnected => IpcError::new(
            "sessionNotConnected",
            "远程 Git 尚未连接，请重新连接后浏览目录",
            true,
        ),
        _ => IpcError::new(
            "directoryUnavailable",
            "无法浏览远程目录，请直接输入路径",
            true,
        ),
    }
}

impl From<DirectoryListing> for GitDirectoryListingDto {
    fn from(value: DirectoryListing) -> Self {
        Self {
            path: value.path,
            entries: value
                .entries
                .into_iter()
                .filter(|entry| entry.is_directory)
                .map(GitDirectoryEntryDto::from)
                .collect(),
        }
    }
}

impl From<FileEntry> for GitDirectoryEntryDto {
    fn from(value: FileEntry) -> Self {
        Self {
            name: value.name,
            path: value.path,
            is_symlink: value.is_symlink,
            modified_at: value.modified_at,
            permission_mode: value.permission_mode,
        }
    }
}

impl From<GitError> for GitIpcError {
    fn from(error: GitError) -> Self {
        let (code, message, retryable) = match error {
            GitError::Missing => (
                "gitMissing",
                "目标环境中未找到 Git，请安装 Git 后重试".into(),
                false,
            ),
            GitError::InvalidPath => ("invalidGitPath", "请选择有效的 Git 工作目录".into(), false),
            GitError::NotRepository => (
                "notGitRepository",
                "所选目录尚未初始化为 Git 仓库".into(),
                false,
            ),
            GitError::InvalidInput => ("invalidGitInput", "Git 操作输入无效".into(), false),
            GitError::Conflict(detail) => (
                "gitConflict",
                if detail.is_empty() {
                    "Git 拒绝了会覆盖现有更改的操作".into()
                } else {
                    detail
                },
                false,
            ),
            GitError::Timeout => ("gitTimeout", "Git 操作超时，已终止进程".into(), true),
            GitError::OutputTooLarge => (
                "gitOutputTooLarge",
                "仓库状态输出过大，请缩小操作范围后重试".into(),
                true,
            ),
            GitError::CommandFailed(detail) => (
                "gitCommandFailed",
                if detail.is_empty() {
                    "Git 操作失败".into()
                } else {
                    detail
                },
                true,
            ),
            GitError::PermissionDenied => (
                "gitPermissionDenied",
                "远程路径或 Git 仓库权限不足".into(),
                false,
            ),
            GitError::UnsupportedRemote => (
                "gitUnsupportedRemote",
                "远程主机需要 POSIX shell 和 Git 2.25 或更高版本".into(),
                false,
            ),
            GitError::SessionUnavailable => (
                "gitSessionUnavailable",
                "远程 Git 连接不可用，请重新连接".into(),
                true,
            ),
            GitError::Io => ("gitUnavailable", "暂时无法执行 Git 操作".into(), true),
        };
        Self {
            code,
            message,
            retryable,
        }
    }
}

impl From<RemoteGitActionDto> for RemoteGitAction {
    fn from(value: RemoteGitActionDto) -> Self {
        match value {
            RemoteGitActionDto::Snapshot { path } => Self::Snapshot { path },
            RemoteGitActionDto::Initialize { path } => Self::Initialize { path },
            RemoteGitActionDto::Stage { repository, paths } => Self::Stage { repository, paths },
            RemoteGitActionDto::StageAll { repository } => Self::StageAll { repository },
            RemoteGitActionDto::Unstage { repository, paths } => {
                Self::Unstage { repository, paths }
            }
            RemoteGitActionDto::UnstageAll { repository } => Self::UnstageAll { repository },
            RemoteGitActionDto::Discard { repository, paths } => {
                Self::Discard { repository, paths }
            }
            RemoteGitActionDto::Commit {
                repository,
                message,
            } => Self::Commit {
                repository,
                message,
            },
            RemoteGitActionDto::CreateBranch { repository, name } => {
                Self::CreateBranch { repository, name }
            }
            RemoteGitActionDto::CreateBranchFrom {
                repository,
                name,
                source_ref,
            } => Self::CreateBranchFrom {
                repository,
                name,
                source_ref,
            },
            RemoteGitActionDto::CreateBranchFromCommit {
                repository,
                name,
                oid,
            } => Self::CreateBranchFromCommit {
                repository,
                name,
                oid,
            },
            RemoteGitActionDto::RenameBranch {
                repository,
                ref_name,
                new_name,
            } => Self::RenameBranch {
                repository,
                ref_name,
                new_name,
            },
            RemoteGitActionDto::DeleteBranch {
                repository,
                ref_name,
            } => Self::DeleteBranch {
                repository,
                ref_name,
            },
            RemoteGitActionDto::SwitchBranch { repository, name } => {
                Self::SwitchBranch { repository, name }
            }
            RemoteGitActionDto::Fetch { repository } => Self::Fetch { repository },
            RemoteGitActionDto::Pull { repository } => Self::Pull { repository },
            RemoteGitActionDto::Push { repository, remote } => Self::Push { repository, remote },
            RemoteGitActionDto::TrackRemoteBranch {
                repository,
                ref_name,
            } => Self::TrackRemoteBranch {
                repository,
                ref_name,
            },
            RemoteGitActionDto::MergeBranch {
                repository,
                source_ref,
            } => Self::MergeBranch {
                repository,
                source_ref,
            },
            RemoteGitActionDto::ContinueMerge { repository } => Self::ContinueMerge { repository },
            RemoteGitActionDto::AbortMerge { repository } => Self::AbortMerge { repository },
        }
    }
}

impl From<GitSnapshot> for GitSnapshotDto {
    fn from(value: GitSnapshot) -> Self {
        Self {
            repository_path: value.repository_path,
            repository_name: value.repository_name,
            head: value.head.into(),
            changes: value.changes.into_iter().map(Into::into).collect(),
            branches: value.branches.into_iter().map(Into::into).collect(),
            remotes: value.remotes,
            commits: value.commits.into_iter().map(Into::into).collect(),
            merge_in_progress: value.merge_in_progress,
            merge_head_oid: value.merge_head_oid,
        }
    }
}
impl From<GitHead> for GitHeadDto {
    fn from(value: GitHead) -> Self {
        Self {
            name: value.name,
            oid: value.oid,
            detached: value.detached,
            unborn: value.unborn,
            upstream: value.upstream,
            ahead: value.ahead,
            behind: value.behind,
        }
    }
}
impl From<GitChange> for GitChangeDto {
    fn from(value: GitChange) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            staged: value.staged,
            conflict: value.conflict,
            conflict_kind: value.conflict_kind.map(Into::into),
        }
    }
}

impl From<GitConflictKind> for GitConflictKindDto {
    fn from(value: GitConflictKind) -> Self {
        match value {
            GitConflictKind::BothModified => Self::BothModified,
            GitConflictKind::BothAdded => Self::BothAdded,
            GitConflictKind::CurrentDeleted => Self::CurrentDeleted,
            GitConflictKind::IncomingDeleted => Self::IncomingDeleted,
            GitConflictKind::BothDeleted => Self::BothDeleted,
            GitConflictKind::Other => Self::Other,
        }
    }
}

impl From<GitConflictContentKind> for GitConflictContentKindDto {
    fn from(value: GitConflictContentKind) -> Self {
        match value {
            GitConflictContentKind::Missing => Self::Missing,
            GitConflictContentKind::Text => Self::Text,
            GitConflictContentKind::Binary => Self::Binary,
            GitConflictContentKind::Unsupported => Self::Unsupported,
        }
    }
}

impl From<GitConflictVersion> for GitConflictVersionDto {
    fn from(value: GitConflictVersion) -> Self {
        Self {
            kind: value.kind.into(),
            content: value.content,
            size: value.size,
            mode: value.mode,
        }
    }
}

impl From<GitConflictResult> for GitConflictResultDto {
    fn from(value: GitConflictResult) -> Self {
        Self {
            kind: value.kind.into(),
            content: value.content,
            revision: value.revision,
            size: value.size,
            mode: value.mode,
        }
    }
}

impl From<GitConflictDetail> for GitConflictDetailDto {
    fn from(value: GitConflictDetail) -> Self {
        Self {
            path: value.path,
            kind: value.kind.into(),
            base: value.base.into(),
            current: value.current.into(),
            incoming: value.incoming.into(),
            result: value.result.into(),
            editable: value.editable,
            unsupported_reason: value.unsupported_reason,
        }
    }
}

impl From<GitDiffScope> for GitDiffScopeDto {
    fn from(value: GitDiffScope) -> Self {
        match value {
            GitDiffScope::Staged => Self::Staged,
            GitDiffScope::Unstaged => Self::Unstaged,
        }
    }
}

impl From<GitDiffSource> for GitDiffSourceDto {
    fn from(value: GitDiffSource) -> Self {
        match value {
            GitDiffSource::Head => Self::Head,
            GitDiffSource::Index => Self::Index,
            GitDiffSource::Worktree => Self::Worktree,
        }
    }
}

impl From<GitChangeDiff> for GitChangeDiffDto {
    fn from(value: GitChangeDiff) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            scope: value.scope.into(),
            before_source: value.before_source.into(),
            after_source: value.after_source.into(),
            before: value.before.into(),
            after: value.after.into(),
        }
    }
}

impl From<GitCommitFileDiff> for GitCommitFileDiffDto {
    fn from(value: GitCommitFileDiff) -> Self {
        Self {
            commit_oid: value.commit_oid,
            parent_oid: value.parent_oid,
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            before: value.before.into(),
            after: value.after.into(),
        }
    }
}

impl From<GitConflictResolutionDto> for GitConflictResolution {
    fn from(value: GitConflictResolutionDto) -> Self {
        match value {
            GitConflictResolutionDto::SaveText {
                content,
                expected_revision,
            } => Self::SaveText {
                content,
                expected_revision,
            },
            GitConflictResolutionDto::UseCurrent {} => Self::UseCurrent,
            GitConflictResolutionDto::UseIncoming {} => Self::UseIncoming,
            GitConflictResolutionDto::Delete {} => Self::Delete,
            GitConflictResolutionDto::MarkResolved {} => Self::MarkResolved,
        }
    }
}
impl From<GitBranch> for GitBranchDto {
    fn from(value: GitBranch) -> Self {
        Self {
            ref_name: value.ref_name,
            name: value.name,
            kind: value.kind.into(),
            oid: value.oid,
            current: value.current,
            upstream: value.upstream,
            upstream_ref: value.upstream_ref,
        }
    }
}

impl From<GitBranchKind> for GitBranchKindDto {
    fn from(value: GitBranchKind) -> Self {
        match value {
            GitBranchKind::Local => Self::Local,
            GitBranchKind::Remote => Self::Remote,
        }
    }
}
impl From<GitCommit> for GitCommitDto {
    fn from(value: GitCommit) -> Self {
        Self {
            oid: value.oid,
            parents: value.parents,
            decorations: value.decorations,
            subject: value.subject,
            body: value.body,
            author: value.author,
            timestamp: value.timestamp,
        }
    }
}
impl From<GitCommitFile> for GitCommitFileDto {
    fn from(value: GitCommitFile) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        GitBranchInput, GitChangeDiffInput, GitCommitFileDiffInput, GitCommitFilesInput,
        GitCommitInput, GitConflictDetailInput, GitCreateBranchFromCommitInput,
        GitDirectoryListingDto, GitIpcError, GitMergeBranchInput, GitPathInput, GitPathsInput,
        GitRemoteBranchInput, GitResolveConflictInput, RemoteGitChangeDiffInput,
        RemoteGitCommitFileDiffInput, RemoteGitCommitFilesInput, RemoteGitConflictDetailInput,
        RemoteGitDirectoryInput, RemoteGitInput, RemoteGitResolveConflictInput,
    };
    use crate::domain::{
        files::{DirectoryListing, FileEntry},
        git::GitError,
    };

    #[test]
    fn git_directory_dto_preserves_read_only_file_metadata() {
        let dto = GitDirectoryListingDto::from(DirectoryListing::new(
            "/srv".into(),
            vec![FileEntry {
                name: "project".into(),
                path: "/srv/project".into(),
                is_directory: true,
                is_symlink: false,
                size: 0,
                modified_at: Some(1_725_187_200),
                permission_mode: Some(0o754),
            }],
        ));
        let value = serde_json::to_value(dto).expect("serialize directory DTO");
        assert_eq!(value["entries"][0]["modifiedAt"], 1_725_187_200u64);
        assert_eq!(value["entries"][0]["permissionMode"], 0o754u32);
    }

    #[test]
    fn git_inputs_reject_arbitrary_process_fields() {
        assert!(
            serde_json::from_value::<GitPathInput>(serde_json::json!({
                "path": "D:/work/project",
                "executable": "powershell.exe"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "snapshot",
                    "path": "/srv/project",
                    "executable": "sh"
                }
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitInput>(serde_json::json!({
                "sessionId": "terminal-session",
                "profileId": "profile-1",
                "action": { "type": "snapshot", "path": "/srv/project" },
                "cwd": "/tmp"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitPathsInput>(serde_json::json!({
                "repository": "D:/work/project",
                "paths": ["file.txt"],
                "args": ["reset", "--hard"]
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitCommitInput>(serde_json::json!({
                "repository": "D:/work/project",
                "message": "feat: safe",
                "cwd": "D:/other"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitChangeDiffInput>(serde_json::json!({
                "repository": "D:/work/project",
                "path": "src/main.ts",
                "staged": false,
                "revision": "HEAD"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitChangeDiffInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "repository": "/srv/project",
                "path": "src/main.ts",
                "staged": true,
                "command": "show"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitCommitFileDiffInput>(serde_json::json!({
                "repository": "D:/work/project",
                "oid": "0123456789abcdef0123456789abcdef01234567",
                "path": "src/main.ts",
                "parent": "HEAD^"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitCommitFileDiffInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "repository": "/srv/project",
                "oid": "0123456789abcdef0123456789abcdef01234567",
                "path": "src/main.ts",
                "command": "show"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitBranchInput>(serde_json::json!({
                "repository": "D:/work/project",
                "name": "feature/test",
                "subcommand": "delete"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitCreateBranchFromCommitInput>(serde_json::json!({
                "repository": "D:/work/project",
                "name": "feature/history",
                "oid": "0123456789abcdef0123456789abcdef01234567",
                "revision": "HEAD"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitRemoteBranchInput>(serde_json::json!({
                "repository": "D:/work/project",
                "refName": "refs/remotes/origin/main",
                "args": ["reset", "--hard"]
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitMergeBranchInput>(serde_json::json!({
                "repository": "D:/work/project",
                "sourceRef": "refs/heads/feature/test",
                "strategy": "ours"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "fetch",
                    "repository": "/srv/project",
                    "remote": "attacker"
                }
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitCommitFilesInput>(serde_json::json!({
                "repository": "D:/work/project",
                "oid": "0123456789abcdef0123456789abcdef01234567",
                "args": ["reset", "--hard"]
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitCommitFilesInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "repository": "/srv/project",
                "oid": "0123456789abcdef0123456789abcdef01234567",
                "command": "cat /etc/passwd"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitDirectoryInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "path": "/srv/project",
                "readFile": "/etc/passwd"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GitConflictDetailInput>(serde_json::json!({
                "repository": "D:/work/project",
                "path": "conflict.txt",
                "stage": 2
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<RemoteGitConflictDetailInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "repository": "/srv/project",
                "path": "conflict.txt",
                "revision": "HEAD"
            }))
            .is_err()
        );
        for payload in [
            serde_json::json!({
                "repository": "D:/work/project",
                "path": "conflict.txt",
                "resolution": { "type": "useCurrent", "args": ["--force"] }
            }),
            serde_json::json!({
                "repository": "D:/work/project",
                "path": "conflict.txt",
                "resolution": { "type": "checkout", "revision": "HEAD" }
            }),
        ] {
            assert!(serde_json::from_value::<GitResolveConflictInput>(payload).is_err());
        }
        assert!(
            serde_json::from_value::<RemoteGitResolveConflictInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "repository": "/srv/project",
                "path": "conflict.txt",
                "resolution": {
                    "type": "saveText",
                    "content": "resolved",
                    "expectedRevision": "revision",
                    "command": "git add -A"
                }
            }))
            .is_err()
        );
    }

    #[test]
    fn conflict_resolution_inputs_deserialize_the_closed_contract() {
        let local = serde_json::from_value::<GitResolveConflictInput>(serde_json::json!({
            "repository": "D:/work/project",
            "path": "conflict.txt",
            "resolution": {
                "type": "saveText",
                "content": "resolved\n",
                "expectedRevision": "sha256:fixture"
            }
        }))
        .expect("local conflict resolution");
        assert_eq!(local.path, "conflict.txt");
        assert_eq!(
            crate::domain::git::GitConflictResolution::from(local.resolution),
            crate::domain::git::GitConflictResolution::SaveText {
                content: "resolved\n".into(),
                expected_revision: "sha256:fixture".into(),
            }
        );

        let remote = serde_json::from_value::<RemoteGitResolveConflictInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "path": "binary.bin",
            "resolution": { "type": "useIncoming" }
        }))
        .expect("remote conflict resolution");
        assert_eq!(remote.path, "binary.bin");
        assert_eq!(
            crate::domain::git::GitConflictResolution::from(remote.resolution),
            crate::domain::git::GitConflictResolution::UseIncoming
        );
    }

    #[test]
    fn remote_fetch_and_tracking_actions_deserialize_only_the_closed_contract() {
        let fetch = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": { "type": "fetch", "repository": "/srv/project" }
        }))
        .expect("fetch input");
        assert_eq!(
            crate::domain::git::RemoteGitAction::from(fetch.action),
            crate::domain::git::RemoteGitAction::Fetch {
                repository: "/srv/project".into()
            }
        );

        let merge = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "mergeBranch",
                "repository": "/srv/project",
                "sourceRef": "refs/remotes/origin/feature/test"
            }
        }))
        .expect("merge input");
        assert_eq!(
            crate::domain::git::RemoteGitAction::from(merge.action),
            crate::domain::git::RemoteGitAction::MergeBranch {
                repository: "/srv/project".into(),
                source_ref: "refs/remotes/origin/feature/test".into(),
            }
        );

        for (kind, expected) in [
            (
                "continueMerge",
                crate::domain::git::RemoteGitAction::ContinueMerge {
                    repository: "/srv/project".into(),
                },
            ),
            (
                "abortMerge",
                crate::domain::git::RemoteGitAction::AbortMerge {
                    repository: "/srv/project".into(),
                },
            ),
        ] {
            let input = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": { "type": kind, "repository": "/srv/project" }
            }))
            .expect("merge lifecycle input");
            assert_eq!(
                crate::domain::git::RemoteGitAction::from(input.action),
                expected
            );
        }

        let track = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "trackRemoteBranch",
                "repository": "/srv/project",
                "refName": "refs/remotes/origin/feature/test"
            }
        }))
        .expect("track input");
        assert_eq!(
            crate::domain::git::RemoteGitAction::from(track.action),
            crate::domain::git::RemoteGitAction::TrackRemoteBranch {
                repository: "/srv/project".into(),
                ref_name: "refs/remotes/origin/feature/test".into()
            }
        );

        let create_from_commit = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "createBranchFromCommit",
                "repository": "/srv/project",
                "name": "feature/history",
                "oid": "0123456789abcdef0123456789abcdef01234567"
            }
        }))
        .expect("create branch from commit input");
        assert_eq!(
            crate::domain::git::RemoteGitAction::from(create_from_commit.action),
            crate::domain::git::RemoteGitAction::CreateBranchFromCommit {
                repository: "/srv/project".into(),
                name: "feature/history".into(),
                oid: "0123456789abcdef0123456789abcdef01234567".into(),
            }
        );
    }

    #[test]
    fn p0_remote_actions_reject_command_url_and_force_fields() {
        let publish = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "push",
                "repository": "/srv/project",
                "remote": "origin"
            }
        }))
        .expect("closed publish action");
        assert_eq!(
            crate::domain::git::RemoteGitAction::from(publish.action),
            crate::domain::git::RemoteGitAction::Push {
                repository: "/srv/project".into(),
                remote: Some("origin".into()),
            }
        );

        for payload in [
            serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "push",
                    "repository": "/srv/project",
                    "remote": "origin",
                    "force": true
                }
            }),
            serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "pull",
                    "repository": "/srv/project",
                    "args": ["--rebase"]
                }
            }),
            serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "deleteBranch",
                    "repository": "/srv/project",
                    "refName": "refs/heads/main",
                    "command": "branch -D main"
                }
            }),
            serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "mergeBranch",
                    "repository": "/srv/project",
                    "sourceRef": "refs/heads/feature/test",
                    "strategy": "ours"
                }
            }),
            serde_json::json!({
                "sessionId": "git-session",
                "profileId": "profile-1",
                "action": {
                    "type": "abortMerge",
                    "repository": "/srv/project",
                    "args": ["reset", "--hard"]
                }
            }),
        ] {
            assert!(serde_json::from_value::<RemoteGitInput>(payload).is_err());
        }
        let invalid_remote = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "push",
                "repository": "/srv/project",
                "remote": "https://user:secret@example.com/repo"
            }
        }))
        .expect("shape remains closed");
        assert!(
            crate::domain::git::RemoteGitAction::from(invalid_remote.action)
                .validate()
                .is_err()
        );
    }

    #[test]
    fn git_failures_have_stable_ipc_codes() {
        let cases = [
            (GitError::Missing, "gitMissing"),
            (GitError::NotRepository, "notGitRepository"),
            (GitError::Conflict(String::new()), "gitConflict"),
            (GitError::Timeout, "gitTimeout"),
            (GitError::OutputTooLarge, "gitOutputTooLarge"),
            (GitError::CommandFailed(String::new()), "gitCommandFailed"),
        ];
        for (error, expected) in cases {
            assert_eq!(GitIpcError::from(error).code, expected);
        }
    }
}
