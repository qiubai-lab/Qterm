use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    commands::{credential::CredentialState, error::IpcError},
    domain::{
        auth::{AuthFailure, AuthRequest, SecretText},
        session::{
            HostEndpoint, SessionEvent, SessionFailure, SessionState as DomainSessionState,
            TerminalSize, validate_username,
        },
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SessionConnectDto {
    host: String,
    port: u32,
    username: String,
    auth: SessionAuthDto,
}

#[derive(Deserialize)]
#[serde(
    tag = "method",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum SessionAuthDto {
    Password { password: String },
    SshAgent {},
    StoredCredential { credential_id: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SessionEventDto {
    StateChanged {
        state: &'static str,
    },
    HostKeyConfirmationRequired {
        algorithm: String,
        fingerprint: String,
    },
    HostKeyChanged {
        trusted_fingerprint: String,
        presented_fingerprint: String,
    },
    Failed {
        code: &'static str,
        message: &'static str,
    },
}

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
) -> Result<String, IpcError> {
    let terminal_output = Arc::new(move |data| {
        let _ = on_terminal.send(TerminalDataDto { data });
    });
    let request = build_connect_request(
        input,
        &credential_state,
        SessionPurpose::Terminal,
        terminal_output,
    )?;
    let sink = Arc::new(move |event| {
        let _ = on_event.send(SessionEventDto::from(event));
    });
    Ok(session_state.manager.connect(request, sink))
}

pub(crate) fn build_connect_request(
    input: SessionConnectDto,
    credential_state: &CredentialState,
    purpose: SessionPurpose,
    terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<SessionConnectRequest, IpcError> {
    let endpoint = HostEndpoint::new(&input.host, input.port).map_err(invalid_target)?;
    let username = validate_username(&input.username).map_err(invalid_target)?;
    let auth = match input.auth {
        SessionAuthDto::Password { password } => AuthRequest::Password(SecretText::new(password)),
        SessionAuthDto::SshAgent {} => AuthRequest::SshAgent,
        SessionAuthDto::StoredCredential { credential_id } => {
            credential_state.resolve_auth(&credential_id)?
        }
    };
    Ok(SessionConnectRequest {
        endpoint,
        username,
        auth,
        purpose,
        terminal_output,
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

fn invalid_target(_: crate::domain::session::SessionValidationError) -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::InvalidSessionTarget,
        "SSH 连接目标或用户名无效",
        false,
    ))
}

fn control_error(error: SessionControlError) -> IpcError {
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

impl From<SessionEvent> for SessionEventDto {
    fn from(event: SessionEvent) -> Self {
        match event {
            SessionEvent::StateChanged(state) => Self::StateChanged {
                state: state_name(state),
            },
            SessionEvent::HostKeyConfirmationRequired {
                algorithm,
                fingerprint,
            } => Self::HostKeyConfirmationRequired {
                algorithm,
                fingerprint,
            },
            SessionEvent::HostKeyChanged {
                trusted_fingerprint,
                presented_fingerprint,
            } => Self::HostKeyChanged {
                trusted_fingerprint,
                presented_fingerprint,
            },
            SessionEvent::Failed(failure) => {
                let (code, message) = failure_message(failure);
                Self::Failed { code, message }
            }
        }
    }
}

fn state_name(state: DomainSessionState) -> &'static str {
    match state {
        DomainSessionState::Connecting => "connecting",
        DomainSessionState::AwaitingHostKey => "awaitingHostKey",
        DomainSessionState::Authenticating => "authenticating",
        DomainSessionState::Connected => "connected",
        DomainSessionState::Closing => "closing",
        DomainSessionState::Closed => "closed",
        DomainSessionState::Failed => "failed",
    }
}

fn failure_message(failure: SessionFailure) -> (&'static str, &'static str) {
    match failure {
        SessionFailure::ConnectionFailed => ("connectionFailed", "无法建立 SSH 连接"),
        SessionFailure::HostKeyChanged => ("hostKeyChanged", "主机密钥已变化，连接已阻断"),
        SessionFailure::HostKeyRejected => ("hostKeyRejected", "已拒绝未知主机密钥"),
        SessionFailure::HostKeyDecisionTimeout => {
            ("hostKeyDecisionTimeout", "等待主机密钥确认超时")
        }
        SessionFailure::KnownHostsUnavailable => {
            ("knownHostsUnavailable", "无法读取或写入主机密钥信任记录")
        }
        SessionFailure::Authentication(error) => match error {
            AuthFailure::InvalidCredentials => ("invalidCredentials", "用户名或凭据不正确"),
            AuthFailure::AuthenticationMethodDisabled => {
                ("authenticationMethodDisabled", "服务器未启用此认证方式")
            }
            AuthFailure::KeyMissing => ("privateKeyMissing", "所选私钥文件不存在"),
            AuthFailure::KeyUnreadable => ("privateKeyUnreadable", "无法读取所选私钥文件"),
            AuthFailure::KeyTooLarge => ("privateKeyTooLarge", "私钥文件超过大小限制"),
            AuthFailure::KeyEncrypted => ("privateKeyEncrypted", "该私钥需要口令"),
            AuthFailure::InvalidPassphrase => ("invalidKeyPassphrase", "私钥口令不正确"),
            AuthFailure::UnsupportedKey => ("unsupportedPrivateKey", "暂不支持该私钥"),
            AuthFailure::CorruptKey => ("corruptPrivateKey", "私钥文件已损坏"),
            AuthFailure::SshAgentUnavailable => (
                "sshAgentUnavailable",
                "无法连接系统 SSH Agent，请确认服务已启动",
            ),
            AuthFailure::SshAgentEmpty => (
                "sshAgentEmpty",
                "SSH Agent 中没有可用密钥，请先使用 ssh-add 添加",
            ),
            AuthFailure::SshAgentRejected => {
                ("sshAgentRejected", "服务器未接受 SSH Agent 中的密钥")
            }
            AuthFailure::ServerRejected => ("authenticationRejected", "服务器要求额外认证"),
            AuthFailure::Connection => ("connectionFailed", "认证期间连接中断"),
        },
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{SessionConnectDto, SessionEventDto};
    use crate::domain::session::{SessionEvent, SessionFailure};

    #[test]
    fn connect_input_rejects_unknown_fields_that_could_persist_secrets() {
        let input = json!({
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "auth": { "method": "password", "password": "temporary" },
            "savePassword": true
        });
        assert!(serde_json::from_value::<SessionConnectDto>(input).is_err());

        let nested = json!({
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "auth": {
                "method": "password",
                "password": "temporary",
                "savePassword": true
            }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(nested).is_err());
    }

    #[test]
    fn connect_input_accepts_secret_free_agent_and_credential_reference_auth() {
        let input = json!({
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "auth": { "method": "sshAgent" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(input).is_ok());

        let stored = json!({
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "auth": { "method": "storedCredential", "credentialId": "credential-1" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(stored).is_ok());

        let with_secret = json!({
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "auth": { "method": "sshAgent", "password": "must-not-be-accepted" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(with_secret).is_err());
    }

    #[test]
    fn changed_host_key_has_a_distinct_blocking_event() {
        let dto = SessionEventDto::from(SessionEvent::HostKeyChanged {
            trusted_fingerprint: "SHA256:old".into(),
            presented_fingerprint: "SHA256:new".into(),
        });
        let value = serde_json::to_value(dto).expect("serialize event");
        assert_eq!(value["type"], "hostKeyChanged");
        assert_eq!(value["trustedFingerprint"], "SHA256:old");
        assert_eq!(value["presentedFingerprint"], "SHA256:new");

        let failure = serde_json::to_value(SessionEventDto::from(SessionEvent::Failed(
            SessionFailure::HostKeyChanged,
        )))
        .expect("serialize failure");
        assert_eq!(failure["code"], "hostKeyChanged");
    }
}
