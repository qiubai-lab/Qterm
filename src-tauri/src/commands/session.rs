use std::sync::Arc;

use serde::Serialize;
use tauri::{State, ipc::Channel};

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    commands::{
        credential::CredentialState, error::IpcError, profile::ProfileState,
        settings::SettingsState,
    },
    domain::{
        auth::{AuthRequest, SecretText},
        session::{InitialDirectory, TerminalSize},
    },
    infrastructure::ssh::client::{
        SessionConnectRequest, SessionControlError, SessionPurpose, SshSessionManager,
    },
};

pub struct SessionState {
    manager: Arc<SshSessionManager>,
}

impl SessionState {
    pub fn new(manager: SshSessionManager) -> Self {
        Self {
            manager: Arc::new(manager),
        }
    }

    pub(crate) fn manager(&self) -> &Arc<SshSessionManager> {
        &self.manager
    }
}

pub use qterm_protocol::sessions::{
    SessionAuthDto, SessionConnectDto, SessionEventDto, terminal_size,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDataDto {
    data: Vec<u8>,
}

#[tauri::command]
pub fn session_connect(
    input: SessionConnectDto,
    on_event: Channel<SessionEventDto>,
    on_terminal: Channel<TerminalDataDto>,
    session_state: State<'_, SessionState>,
    credential_state: State<'_, CredentialState>,
    profile_state: State<'_, ProfileState>,
    settings_state: State<'_, SettingsState>,
) -> Result<String, IpcError> {
    let terminal_output = Arc::new(move |data| {
        let _ = on_terminal.send(TerminalDataDto { data });
    });
    let terminal_settings = settings_state.terminal();
    let mut request = build_connect_request(
        input,
        &credential_state,
        &profile_state,
        SessionPurpose::Terminal,
        terminal_output,
        terminal_settings.remote_shell_integration_enabled,
    )?;
    request.history_free_bash_enabled = terminal_settings.history_free_bash_enabled;
    let sink = Arc::new(move |event| {
        let _ = on_event.send(SessionEventDto::from(event));
    });
    Ok(session_state.manager.connect(request, sink))
}

pub(crate) fn build_connect_request(
    input: SessionConnectDto,
    credential_state: &CredentialState,
    profile_state: &ProfileState,
    purpose: SessionPurpose,
    terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
    remote_shell_integration_enabled: bool,
) -> Result<SessionConnectRequest, IpcError> {
    let SessionConnectDto {
        profile_id,
        auth,
        terminal_size: requested_terminal_size,
        initial_directory,
    } = input;
    let terminal_size = terminal_size(requested_terminal_size, purpose).map_err(IpcError::from)?;
    let target_auth = match auth {
        SessionAuthDto::Password { password } => AuthRequest::Password(SecretText::new(password)),
        SessionAuthDto::SshAgent {} => AuthRequest::SshAgent,
        SessionAuthDto::StoredCredential { credential_id } => {
            credential_state.resolve_auth(&credential_id)?
        }
    };
    let profiles = profile_state.route(&profile_id)?;
    let route = crate::application::session_route::prepare_route(profiles, target_auth, |id| {
        credential_state.resolve_auth(id)
    })?;
    Ok(SessionConnectRequest {
        route,
        purpose,
        profile_id: Some(profile_id),
        terminal_size,
        initial_directory: if purpose == SessionPurpose::Terminal {
            initial_directory.and_then(InitialDirectory::new)
        } else {
            None
        },
        terminal_output,
        history_free_bash_enabled: false,
        remote_shell_integration_enabled: purpose == SessionPurpose::Terminal
            && remote_shell_integration_enabled,
    })
}

#[tauri::command]
pub fn session_write(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    state
        .manager
        .write(&session_id, data)
        .map_err(control_error)
}

#[tauri::command]
pub fn session_resize(
    session_id: String,
    columns: u32,
    rows: u32,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    let size = TerminalSize::new(columns, rows).map_err(|_| {
        IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "终端窗口尺寸无效",
            false,
        ))
    })?;
    state
        .manager
        .resize(&session_id, size)
        .map_err(control_error)
}

#[tauri::command]
pub fn session_accept_host_key(
    session_id: String,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    state
        .manager
        .accept_host_key(&session_id)
        .map_err(control_error)
}

#[tauri::command]
pub fn session_reject_host_key(
    session_id: String,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    state
        .manager
        .reject_host_key(&session_id)
        .map_err(control_error)
}

#[tauri::command]
pub fn session_close(session_id: String, state: State<'_, SessionState>) -> Result<(), IpcError> {
    state.manager.close(&session_id).map_err(control_error)
}

pub(crate) fn control_error(error: SessionControlError) -> IpcError {
    let application_error = match error {
        SessionControlError::SessionNotFound => ApplicationError::new(
            ApplicationErrorCode::SessionNotFound,
            "SSH 会话不存在",
            false,
        ),
        SessionControlError::SessionNotConnected => ApplicationError::new(
            ApplicationErrorCode::SessionNotConnected,
            "SSH 会话尚未连接",
            true,
        ),
        SessionControlError::InvalidTerminalInput => ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "终端输入为空或超过大小限制",
            false,
        ),
        SessionControlError::TerminalUnavailable => ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "文件会话不支持终端输入或调整尺寸",
            false,
        ),
        SessionControlError::ControlQueueUnavailable => {
            ApplicationError::new(ApplicationErrorCode::TerminalBusy, "终端输入队列繁忙", true)
        }
        SessionControlError::TransferNotFound => ApplicationError::new(
            ApplicationErrorCode::TransferNotFound,
            "文件传输任务不存在或已经结束",
            false,
        ),
        SessionControlError::DirectoryUnavailable => ApplicationError::new(
            ApplicationErrorCode::DirectoryUnavailable,
            "无法读取远程文件夹",
            true,
        ),
        SessionControlError::FileUnavailable
        | SessionControlError::FileTooLarge
        | SessionControlError::FileConflict => ApplicationError::new(
            ApplicationErrorCode::TerminalBusy,
            "SSH 会话暂时无法处理文件请求",
            true,
        ),
        SessionControlError::NetworkUnavailable => ApplicationError::new(
            ApplicationErrorCode::NetworkForwardUnavailable,
            "无法启动或停止网络转发，请检查端口占用与服务器策略",
            true,
        ),
        SessionControlError::NoHostKeyDecision => ApplicationError::new(
            ApplicationErrorCode::HostKeyDecisionUnavailable,
            "当前会话没有等待处理的主机密钥",
            false,
        ),
        SessionControlError::KnownHostsUnavailable => ApplicationError::new(
            ApplicationErrorCode::KnownHostsUnavailable,
            "无法保存主机密钥信任记录",
            true,
        ),
        SessionControlError::SessionFinished => ApplicationError::new(
            ApplicationErrorCode::SessionAlreadyFinished,
            "SSH 会话已经结束",
            false,
        ),
    };
    IpcError::from(application_error)
}
