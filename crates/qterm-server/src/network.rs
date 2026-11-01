use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
};
use qterm_protocol::network::{NetworkRuleDto, NetworkRuleInputDto};
use serde::Deserialize;
use std::sync::Arc;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Filter {
    profile_id: Option<String>,
}
pub async fn list(
    State(state): State<Arc<ServerState>>,
    Query(filter): Query<Filter>,
) -> Result<Json<Vec<NetworkRuleDto>>> {
    Ok(Json(
        state
            .network
            .list(filter.profile_id.as_deref())?
            .iter()
            .map(Into::into)
            .collect(),
    ))
}
fn current(state: &ServerState, owner: &str) -> Result<()> {
    if state.auth.valid(owner) {
        Ok(())
    } else {
        Err(ApiError::unauthorized())
    }
}
fn editable(state: &ServerState, id: &str) -> Result<()> {
    if state
        .network_running
        .lock()
        .unwrap()
        .values()
        .any(|rules| rules.contains_key(id))
    {
        return Err(ApiError::new(
            axum::http::StatusCode::CONFLICT,
            "ruleRunning",
            "请先停止正在运行的规则",
        ));
    }
    Ok(())
}
pub async fn create(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<NetworkRuleInputDto>,
) -> Result<Json<NetworkRuleDto>> {
    let _gate = state.network_gate.lock().await;
    current(&state, &owner.0)?;
    state.profiles.route(input.profile_id())?;
    Ok(Json((&state.network.create(input.try_into()?)?).into()))
}
pub async fn update(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
    Json(input): Json<NetworkRuleInputDto>,
) -> Result<Json<NetworkRuleDto>> {
    let _gate = state.network_gate.lock().await;
    current(&state, &owner.0)?;
    editable(&state, &id)?;
    state.profiles.route(input.profile_id())?;
    Ok(Json(
        (&state.network.update(&id, input.try_into()?)?).into(),
    ))
}
pub async fn delete(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<()>> {
    let _gate = state.network_gate.lock().await;
    current(&state, &owner.0)?;
    editable(&state, &id)?;
    state.network.delete(&id)?;
    Ok(Json(()))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Control {
    session_id: String,
    rule_id: String,
}
pub async fn start(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Control>,
) -> Result<Json<()>> {
    let _gate = state.network_gate.lock().await;
    state.authorize(&owner.0, &input.session_id)?;
    let rule = state.network.get(&input.rule_id)?;
    state
        .sessions
        .start_network_rule(
            &input.session_id,
            input.rule_id.clone(),
            rule.profile_id().as_str(),
            rule.kind().clone(),
        )
        .await?;
    state
        .network_running
        .lock()
        .unwrap()
        .entry(input.session_id)
        .or_default()
        .insert(input.rule_id, "running".into());
    Ok(Json(()))
}
pub async fn stop(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Control>,
) -> Result<Json<()>> {
    let _gate = state.network_gate.lock().await;
    state.authorize(&owner.0, &input.session_id)?;
    state
        .sessions
        .stop_network_rule(&input.session_id, input.rule_id.clone())
        .await?;
    if let Some(rules) = state
        .network_running
        .lock()
        .unwrap()
        .get_mut(&input.session_id)
    {
        rules.remove(&input.rule_id);
    }
    Ok(Json(()))
}
