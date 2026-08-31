use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::git_service::{GitService, execute_remote_git, execute_remote_git_commit_files},
    commands::{
        credential::CredentialState,
        native_dialog,
        profile::ProfileState,
        session::{SessionConnectDto, SessionEventDto, SessionState, build_connect_request},
    },
    domain::git::{
        GitBranch, GitChange, GitCommit, GitCommitFile, GitError, GitHead, GitSnapshot,
        RemoteGitAction,
    },
    infrastructure::{git_cli::SystemGitExecutor, ssh::client::SessionPurpose},
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
    commits: Vec<GitCommitDto>,
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
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchDto {
    name: String,
    oid: String,
    current: bool,
    upstream: Option<String>,
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
pub struct GitBranchInput {
    repository: String,
    name: String,
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
    Commit {
        repository: String,
        message: String,
    },
    CreateBranch {
        repository: String,
        name: String,
    },
    SwitchBranch {
        repository: String,
        name: String,
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
pub async fn git_create_branch(
    input: GitBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.create_branch(input.repository, input.name)).await
}

#[tauri::command]
pub async fn git_switch_branch(
    input: GitBranchInput,
    state: State<'_, GitState>,
) -> Result<GitSnapshotDto, GitIpcError> {
    let service = Arc::clone(&state.service);
    run(move || service.switch_branch(input.repository, input.name)).await
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
            RemoteGitActionDto::SwitchBranch { repository, name } => {
                Self::SwitchBranch { repository, name }
            }
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
            commits: value.commits.into_iter().map(Into::into).collect(),
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
        }
    }
}
impl From<GitBranch> for GitBranchDto {
    fn from(value: GitBranch) -> Self {
        Self {
            name: value.name,
            oid: value.oid,
            current: value.current,
            upstream: value.upstream,
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
        GitBranchInput, GitCommitFilesInput, GitCommitInput, GitIpcError, GitPathInput,
        GitPathsInput, RemoteGitCommitFilesInput, RemoteGitInput,
    };
    use crate::domain::git::GitError;

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
            serde_json::from_value::<GitBranchInput>(serde_json::json!({
                "repository": "D:/work/project",
                "name": "feature/test",
                "subcommand": "delete"
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
