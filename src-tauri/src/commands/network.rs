use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};

use crate::{
    application::network_service::{NetworkRuleInput, NetworkService},
    commands::{
        credential::CredentialState,
        error::IpcError,
        profile::ProfileState,
        session::{
            SessionConnectDto, SessionEventDto, SessionState, build_connect_request, control_error,
        },
    },
    domain::network::{ForwardRule, ForwardRuleKind, ListenerExposure},
    infrastructure::{
        persistence::json_network_repository::JsonNetworkRepository, ssh::client::SessionPurpose,
    },
};

pub struct NetworkState {
    pub(crate) service: NetworkService<JsonNetworkRepository>,
}

impl NetworkState {
    pub fn new(repository: JsonNetworkRepository) -> Self {
        Self {
            service: NetworkService::new(repository),
        }
    }

    fn rule(&self, id: &str) -> Result<ForwardRule, IpcError> {
        self.service.get(id).map_err(IpcError::from)
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NetworkRuleInputDto {
    Local {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
        target_host: String,
        target_port: u32,
    },
    Remote {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
        target_host: String,
        target_port: u32,
    },
    Socks5 {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
    },
}

impl NetworkRuleInputDto {
    fn profile_id(&self) -> &str {
        match self {
            Self::Local { profile_id, .. }
            | Self::Remote { profile_id, .. }
            | Self::Socks5 { profile_id, .. } => profile_id,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NetworkRuleDto {
    Local {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
        exposed: bool,
    },
    Remote {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
        exposed: bool,
    },
    Socks5 {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        exposed: bool,
    },
}

#[tauri::command]
pub fn network_rule_list(
    profile_id: Option<String>,
    state: State<'_, NetworkState>,
) -> Result<Vec<NetworkRuleDto>, IpcError> {
    state
        .service
        .list(profile_id.as_deref())
        .map(|rules| rules.iter().map(NetworkRuleDto::from).collect())
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn network_rule_create(
    input: NetworkRuleInputDto,
    state: State<'_, NetworkState>,
    profile_state: State<'_, ProfileState>,
) -> Result<NetworkRuleDto, IpcError> {
    profile_state.profile(input.profile_id())?;
    state
        .service
        .create(input.try_into()?)
        .map(|rule| NetworkRuleDto::from(&rule))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn network_rule_update(
    id: String,
    input: NetworkRuleInputDto,
    state: State<'_, NetworkState>,
    profile_state: State<'_, ProfileState>,
) -> Result<NetworkRuleDto, IpcError> {
    profile_state.profile(input.profile_id())?;
    state
        .service
        .update(&id, input.try_into()?)
        .map(|rule| NetworkRuleDto::from(&rule))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn network_rule_delete(id: String, state: State<'_, NetworkState>) -> Result<(), IpcError> {
    state.service.delete(&id).map_err(IpcError::from)
}

#[tauri::command]
pub fn network_session_connect(
    input: SessionConnectDto,
    on_event: Channel<SessionEventDto>,
    session_state: State<'_, SessionState>,
    credential_state: State<'_, CredentialState>,
    profile_state: State<'_, ProfileState>,
) -> Result<String, IpcError> {
    let request = build_connect_request(
        input,
        &credential_state,
        &profile_state,
        SessionPurpose::Network,
        Arc::new(|_| {}),
    )?;
    let events = Arc::new(move |event| {
        let _ = on_event.send(SessionEventDto::from(event));
    });
    Ok(session_state.manager().connect(request, events))
}

#[tauri::command]
pub async fn network_rule_start(
    session_id: String,
    rule_id: String,
    network_state: State<'_, NetworkState>,
    session_state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    let rule = network_state.rule(&rule_id)?;
    session_state
        .manager()
        .start_network_rule(
            &session_id,
            rule_id,
            rule.profile_id().as_str(),
            rule.kind().clone(),
        )
        .await
        .map_err(control_error)
}

#[tauri::command]
pub async fn network_rule_stop(
    session_id: String,
    rule_id: String,
    session_state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    session_state
        .manager()
        .stop_network_rule(&session_id, rule_id)
        .await
        .map_err(control_error)
}

impl TryFrom<NetworkRuleInputDto> for NetworkRuleInput {
    type Error = IpcError;

    fn try_from(value: NetworkRuleInputDto) -> Result<Self, Self::Error> {
        let (profile_id, name, kind) = match value {
            NetworkRuleInputDto::Local {
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::local(bind_host, bind_port, target_host, target_port),
            ),
            NetworkRuleInputDto::Remote {
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::remote(bind_host, bind_port, target_host, target_port),
            ),
            NetworkRuleInputDto::Socks5 {
                profile_id,
                name,
                bind_host,
                bind_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::socks5(bind_host, bind_port),
            ),
        };
        let kind = kind.map_err(|_| {
            IpcError::from(crate::application::error::ApplicationError::new(
                crate::application::error::ApplicationErrorCode::InvalidNetworkRule,
                "网络规则字段无效",
                false,
            ))
        })?;
        Ok(Self {
            profile_id,
            name,
            kind,
        })
    }
}

impl From<&ForwardRule> for NetworkRuleDto {
    fn from(rule: &ForwardRule) -> Self {
        let common = || {
            (
                rule.id().as_str().to_owned(),
                rule.profile_id().as_str().to_owned(),
                rule.name().to_owned(),
                rule.kind().exposure() == ListenerExposure::Exposed,
            )
        };
        match rule.kind() {
            ForwardRuleKind::Local {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Local {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                    exposed,
                }
            }
            ForwardRuleKind::Remote {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Remote {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                    exposed,
                }
            }
            ForwardRuleKind::Socks5 {
                bind_host,
                bind_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Socks5 {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    exposed,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::NetworkRuleInputDto;

    #[test]
    fn input_rejects_unknown_and_sensitive_fields() {
        let value = json!({
            "type": "socks5",
            "profileId": "profile-1",
            "name": "Proxy",
            "bindHost": "127.0.0.1",
            "bindPort": 1080,
            "password": "must-not-cross"
        });
        assert!(serde_json::from_value::<NetworkRuleInputDto>(value).is_err());
    }
}
