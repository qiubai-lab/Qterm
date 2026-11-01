use qterm_core::domain::{
    auth::AuthFailure,
    session::{
        RouteNodeMetadata, RouteNodeRole, RouteStage, SessionEvent, SessionFailure,
        SessionState as DomainSessionState,
    },
};
use qterm_core::{
    application::error::{ApplicationError, ApplicationErrorCode},
    domain::session::TerminalSize,
    infrastructure::ssh::client::SessionPurpose,
};
use serde::{Deserialize, Serialize};
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SessionConnectDto {
    pub profile_id: String,
    pub auth: SessionAuthDto,
    pub terminal_size: Option<TerminalSizeDto>,
    pub initial_directory: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerminalSizeDto {
    pub columns: u32,
    pub rows: u32,
}

#[derive(Deserialize)]
#[serde(
    tag = "method",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SessionAuthDto {
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
        SessionFailure::HistoryFreeStartupFailed => (
            "historyFreeStartupFailed",
            "Bash 会话启动失败；请检查 Bash 启动配置及 SSH exec 支持",
        ),
        SessionFailure::ConnectionFailed => ("connectionFailed", "无法建立 SSH 连接"),
        SessionFailure::TransportLost => {
            ("transportLost", "SSH 连接已中断，请检查网络或服务器状态")
        }
        SessionFailure::RemoteDisconnected => ("remoteDisconnected", "服务器已关闭 SSH 连接"),
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

pub fn terminal_size(
    requested: Option<TerminalSizeDto>,
    purpose: SessionPurpose,
) -> Result<Option<TerminalSize>, ApplicationError> {
    if purpose != SessionPurpose::Terminal {
        return Ok(None);
    }
    let requested = requested.ok_or_else(|| {
        ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "SSH 终端缺少初始窗口尺寸",
            false,
        )
    })?;
    TerminalSize::new(requested.columns, requested.rows)
        .map(Some)
        .map_err(|_| {
            ApplicationError::new(
                ApplicationErrorCode::InvalidTerminalInput,
                "终端窗口尺寸无效",
                false,
            )
        })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{SessionConnectDto, SessionEventDto, failure_message, terminal_size};
    use qterm_core::domain::session::{
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
                qterm_core::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .expect("valid size"),
            Some(qterm_core::domain::session::TerminalSize::new(93, 31).expect("terminal size"))
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
                qterm_core::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .is_err()
        );
        assert!(
            terminal_size(
                None,
                qterm_core::infrastructure::ssh::client::SessionPurpose::Terminal
            )
            .is_err()
        );
        assert!(
            terminal_size(
                None,
                qterm_core::infrastructure::ssh::client::SessionPurpose::Files
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

    #[test]
    fn runtime_disconnects_have_stable_user_facing_failures() {
        assert_eq!(
            failure_message(SessionFailure::TransportLost),
            ("transportLost", "SSH 连接已中断，请检查网络或服务器状态")
        );
        assert_eq!(
            failure_message(SessionFailure::RemoteDisconnected),
            ("remoteDisconnected", "服务器已关闭 SSH 连接")
        );
    }
}
