use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    commands::{credential::CredentialState, error::IpcError, profile::ProfileState},
    domain::{
        auth::{AuthFailure, AuthRequest, SecretText},
        profile::{AuthPreference, ConnectionProfile},
        session::{
            HostEndpoint, RouteNodeMetadata, RouteNodeRole, RouteStage, SessionEvent,
            SessionFailure, SessionState as DomainSessionState, TerminalSize, validate_username,
        },
    },
    infrastructure::ssh::client::{
        SessionConnectRequest, SessionControlError, SessionPurpose, SessionRouteNode,
        SshSessionManager,
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
    profile_id: String,
    auth: SessionAuthDto,
    terminal_size: Option<TerminalSizeDto>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct TerminalSizeDto {
    columns: u32,
    rows: u32,
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
    RouteProgress {
        node: SessionNodeDto,
        stage: &'static str,
    },
    HostKeyConfirmationRequired {
        node: SessionNodeDto,
        algorithm: String,
        fingerprint: String,
    },
    HostKeyChanged {
        node: SessionNodeDto,
        trusted_fingerprint: String,
        presented_fingerprint: String,
    },
    Failed {
        code: &'static str,
        message: &'static str,
        node: Option<SessionNodeDto>,
        stage: Option<&'static str>,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionNodeDto {
    profile_id: String,
    name: String,
    host: String,
    port: u16,
    index: usize,
    total: usize,
    role: &'static str,
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
    profile_state: State<'_, ProfileState>,
) -> Result<String, IpcError> {
    let terminal_output = Arc::new(move |data| {
        let _ = on_terminal.send(TerminalDataDto { data });
    });
    let request = build_connect_request(
        input,
        &credential_state,
        &profile_state,
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
    profile_state: &ProfileState,
    purpose: SessionPurpose,
    terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<SessionConnectRequest, IpcError> {
    let SessionConnectDto {
        profile_id,
        auth,
        terminal_size: requested_terminal_size,
    } = input;
    let terminal_size = terminal_size(requested_terminal_size, purpose)?;
    let target_auth = match auth {
        SessionAuthDto::Password { password } => AuthRequest::Password(SecretText::new(password)),
        SessionAuthDto::SshAgent {} => AuthRequest::SshAgent,
        SessionAuthDto::StoredCredential { credential_id } => {
            credential_state.resolve_auth(&credential_id)?
        }
    };
    let profiles = profile_state.route(&profile_id)?;
    let route_length = profiles.len();
    let mut target_auth = Some(target_auth);
    let route = profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            let auth = if index + 1 == route_length {
                target_auth.take().expect("target auth is consumed once")
            } else {
                configured_jump_auth(&profile, credential_state)?
            };
            Ok(SessionRouteNode {
                profile_id: profile.id().as_str().to_owned(),
                name: profile.name().to_owned(),
                endpoint: HostEndpoint::new(profile.host(), u32::from(profile.port()))
                    .map_err(invalid_target)?,
                username: validate_username(profile.username()).map_err(invalid_target)?,
                auth,
            })
        })
        .collect::<Result<Vec<_>, IpcError>>()?;
    Ok(SessionConnectRequest {
        route,
        purpose,
        profile_id: Some(profile_id),
        terminal_size,
        terminal_output,
    })
}

fn terminal_size(
    requested: Option<TerminalSizeDto>,
    purpose: SessionPurpose,
) -> Result<Option<TerminalSize>, IpcError> {
    if purpose != SessionPurpose::Terminal {
        return Ok(None);
    }
    let requested = requested.ok_or_else(|| {
        IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "SSH 终端缺少初始窗口尺寸",
            false,
        ))
    })?;
    TerminalSize::new(requested.columns, requested.rows)
        .map(Some)
        .map_err(|_| {
            IpcError::from(ApplicationError::new(
                ApplicationErrorCode::InvalidTerminalInput,
                "终端窗口尺寸无效",
                false,
            ))
        })
}

fn configured_jump_auth(
    profile: &ConnectionProfile,
    credential_state: &CredentialState,
) -> Result<AuthRequest, IpcError> {
    match profile.auth_preference() {
        AuthPreference::SshAgent => Ok(AuthRequest::SshAgent),
        AuthPreference::Password | AuthPreference::PrivateKey => {
            let credential_id = profile.credential_id().ok_or_else(invalid_jump_auth)?;
            let auth = credential_state.resolve_auth(credential_id.as_str())?;
            let matches_preference = matches!(
                (profile.auth_preference(), &auth),
                (AuthPreference::Password, AuthRequest::Password(_))
                    | (AuthPreference::PrivateKey, AuthRequest::PrivateKey { .. })
                    | (
                        AuthPreference::PrivateKey,
                        AuthRequest::PrivateKeyData { .. }
                    )
            );
            if matches_preference {
                Ok(auth)
            } else {
                Err(invalid_jump_auth())
            }
        }
        AuthPreference::Manual => Err(invalid_jump_auth()),
    }
}

fn invalid_jump_auth() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::InvalidProfileJump,
        "中间节点没有可自动使用的认证配置",
        false,
    ))
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

impl From<SessionEvent> for SessionEventDto {
    fn from(event: SessionEvent) -> Self {
        match event {
            SessionEvent::StateChanged(state) => Self::StateChanged {
                state: state_name(state),
            },
            SessionEvent::RouteProgress { node, stage } => Self::RouteProgress {
                node: node.into(),
                stage: route_stage_name(stage),
            },
            SessionEvent::HostKeyConfirmationRequired {
                node,
                algorithm,
                fingerprint,
            } => Self::HostKeyConfirmationRequired {
                node: node.into(),
                algorithm,
                fingerprint,
            },
            SessionEvent::HostKeyChanged {
                node,
                trusted_fingerprint,
                presented_fingerprint,
            } => Self::HostKeyChanged {
                node: node.into(),
                trusted_fingerprint,
                presented_fingerprint,
            },
            SessionEvent::Failed {
                failure,
                node,
                stage,
            } => {
                let (code, message) = failure_message(failure);
                Self::Failed {
                    code,
                    message,
                    node: node.map(Into::into),
                    stage: stage.map(route_stage_name),
                }
            }
        }
    }
}

impl From<RouteNodeMetadata> for SessionNodeDto {
    fn from(node: RouteNodeMetadata) -> Self {
        Self {
            profile_id: node.profile_id,
            name: node.name,
            host: node.endpoint.host().to_owned(),
            port: node.endpoint.port(),
            index: node.index,
            total: node.total,
            role: match node.role {
                RouteNodeRole::Jump => "jump",
                RouteNodeRole::Target => "target",
            },
        }
    }
}

fn route_stage_name(stage: RouteStage) -> &'static str {
    match stage {
        RouteStage::Connect => "connect",
        RouteStage::VerifyHostKey => "verifyHostKey",
        RouteStage::Authenticate => "authenticate",
        RouteStage::OpenTunnel => "openTunnel",
        RouteStage::StartSession => "startSession",
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
        SessionFailure::TunnelOpenFailed => (
            "jumpTunnelOpenFailed",
            "跳板节点拒绝或无法建立到下一节点的转发通道",
        ),
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
            AuthFailure::KeyGenerationFailed => ("privateKeyGenerationFailed", "无法生成私钥"),
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

    use super::{SessionConnectDto, SessionEventDto, terminal_size};
    use crate::domain::session::{
        HostEndpoint, RouteNodeMetadata, RouteNodeRole, RouteStage, SessionEvent, SessionFailure,
    };

    fn node() -> RouteNodeMetadata {
        RouteNodeMetadata {
            profile_id: "profile-1".into(),
            name: "Production".into(),
            endpoint: HostEndpoint::new("example.com", 22).expect("endpoint"),
            index: 0,
            total: 1,
            role: RouteNodeRole::Target,
        }
    }

    #[test]
    fn connect_input_rejects_unknown_fields_that_could_persist_secrets() {
        let input = json!({
            "profileId": "profile-1",
            "auth": { "method": "password", "password": "temporary" },
            "savePassword": true
        });
        assert!(serde_json::from_value::<SessionConnectDto>(input).is_err());

        let nested = json!({
            "profileId": "profile-1",
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
            "profileId": "profile-1",
            "auth": { "method": "sshAgent" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(input).is_ok());

        let stored = json!({
            "profileId": "profile-1",
            "auth": { "method": "storedCredential", "credentialId": "credential-1" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(stored).is_ok());

        let with_secret = json!({
            "profileId": "profile-1",
            "auth": { "method": "sshAgent", "password": "must-not-be-accepted" }
        });
        assert!(serde_json::from_value::<SessionConnectDto>(with_secret).is_err());
    }

    #[test]
    fn terminal_connect_input_validates_initial_pty_size() {
        let input = json!({
            "profileId": "profile-1",
            "auth": { "method": "sshAgent" },
            "terminalSize": { "columns": 93, "rows": 31 }
        });
        let input = serde_json::from_value::<SessionConnectDto>(input).expect("terminal input");
        assert_eq!(
            terminal_size(
                input.terminal_size,
                crate::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .expect("valid size"),
            Some(crate::domain::session::TerminalSize::new(93, 31).expect("terminal size"))
        );

        let invalid = json!({
            "profileId": "profile-1",
            "auth": { "method": "sshAgent" },
            "terminalSize": { "columns": 0, "rows": 31 }
        });
        let invalid =
            serde_json::from_value::<SessionConnectDto>(invalid).expect("transport input");
        assert!(
            terminal_size(
                invalid.terminal_size,
                crate::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .is_err()
        );
        assert!(
            terminal_size(
                None,
                crate::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .is_err()
        );
        assert!(
            terminal_size(
                None,
                crate::infrastructure::ssh::client::SessionPurpose::Files
            )
            .expect("file sessions do not need a PTY size")
            .is_none()
        );
    }

    #[test]
    fn changed_host_key_has_a_distinct_blocking_event() {
        let dto = SessionEventDto::from(SessionEvent::HostKeyChanged {
            node: node(),
            trusted_fingerprint: "SHA256:old".into(),
            presented_fingerprint: "SHA256:new".into(),
        });
        let value = serde_json::to_value(dto).expect("serialize event");
        assert_eq!(value["type"], "hostKeyChanged");
        assert_eq!(value["trustedFingerprint"], "SHA256:old");
        assert_eq!(value["presentedFingerprint"], "SHA256:new");

        let failure = serde_json::to_value(SessionEventDto::from(SessionEvent::Failed {
            failure: SessionFailure::HostKeyChanged,
            node: Some(node()),
            stage: Some(RouteStage::VerifyHostKey),
        }))
        .expect("serialize failure");
        assert_eq!(failure["code"], "hostKeyChanged");
    }
}
