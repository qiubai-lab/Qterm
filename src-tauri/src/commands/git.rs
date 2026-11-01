use std::sync::Arc;

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
        git::{GitError, GitSnapshot, RemoteGitAction},
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

pub use qterm_protocol::git::*;

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
pub async fn git_initialize_submodule(
    input: GitSubmoduleInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.initialize_submodule(input.repository, input.path)).await
}

#[tauri::command]
pub async fn git_checkout_submodule(
    input: GitSubmoduleInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.checkout_submodule(input.repository, input.path)).await
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
