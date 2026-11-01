use std::sync::Arc;

use tauri::{State, ipc::Channel};

use crate::{
    application::network_service::NetworkService,
    commands::{
        credential::CredentialState,
        error::IpcError,
        profile::ProfileState,
        session::{
            SessionConnectDto, SessionEventDto, SessionState, build_connect_request, control_error,
        },
    },
    domain::network::ForwardRule,
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

    pub(crate) fn rule(&self, id: &str) -> Result<ForwardRule, IpcError> {
        self.service.get(id).map_err(IpcError::from)
    }
}

pub use qterm_protocol::network::*;

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
        false,
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
