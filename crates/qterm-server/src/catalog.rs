use crate::{
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Json,
    extract::{Path, State},
};
use qterm_core::domain::profile::AuthPreference;
use qterm_protocol::{
    profiles::{
        CreateProfileDto, JumpCandidateDto, ProfileDto, ProfileGroupDto, ProfileGroupInputDto,
    },
    workspaces::WorkspaceDocumentDto,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

pub async fn profiles(State(state): State<Arc<ServerState>>) -> Result<Json<Vec<ProfileDto>>> {
    Ok(Json(
        state
            .profiles
            .list()?
            .iter()
            .map(ProfileDto::from)
            .collect(),
    ))
}
pub async fn create_profile(
    State(state): State<Arc<ServerState>>,
    Json(input): Json<CreateProfileDto>,
) -> Result<Json<ProfileDto>> {
    let input = input.into();
    validate_auth(&state, &input)?;
    Ok(Json(ProfileDto::from(&state.profiles.create(input)?)))
}
pub async fn update_profile(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(input): Json<CreateProfileDto>,
) -> Result<Json<ProfileDto>> {
    let input = input.into();
    validate_auth(&state, &input)?;
    Ok(Json(ProfileDto::from(&state.profiles.update(&id, input)?)))
}
fn validate_auth(
    state: &ServerState,
    input: &qterm_core::application::profile_service::ProfileInput,
) -> Result<()> {
    if input.auth_preference == AuthPreference::SshAgent {
        return Err(ApiError::invalid());
    }
    if let Some(id) = &input.credential_id
        && !state
            .vault
            .list()?
            .iter()
            .any(|item| item.id.as_str() == id)
    {
        return Err(ApiError::invalid());
    }
    Ok(())
}
pub async fn delete_profile(
    State(state): State<Arc<ServerState>>,
    axum::Extension(owner): axum::Extension<crate::auth::Identity>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let _gate = state.network_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(crate::error::ApiError::unauthorized());
    }
    let deleted = qterm_core::application::profile_service::delete_profile_with_network_rules(
        &state.profiles,
        &state.network,
        &id,
    )?;
    state.sessions.close_profile_network_sessions(&id);
    Ok(Json(json!({"deletedNetworkRules": deleted})))
}
pub async fn groups(State(state): State<Arc<ServerState>>) -> Result<Json<Vec<ProfileGroupDto>>> {
    Ok(Json(
        state
            .profiles
            .list_groups()?
            .iter()
            .map(ProfileGroupDto::from)
            .collect(),
    ))
}
pub async fn create_group(
    State(state): State<Arc<ServerState>>,
    Json(input): Json<ProfileGroupInputDto>,
) -> Result<Json<ProfileGroupDto>> {
    Ok(Json(ProfileGroupDto::from(
        &state.profiles.create_group(input.into())?,
    )))
}
pub async fn update_group(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(input): Json<ProfileGroupInputDto>,
) -> Result<Json<ProfileGroupDto>> {
    Ok(Json(ProfileGroupDto::from(
        &state.profiles.update_group(&id, input.into())?,
    )))
}
pub async fn delete_group(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    state.profiles.delete_group(&id)?;
    Ok(Json(Value::Null))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Candidates {
    current_profile_id: Option<String>,
    #[serde(default)]
    selected_profile_ids: Vec<String>,
}
pub async fn candidates(
    State(state): State<Arc<ServerState>>,
    Json(input): Json<Candidates>,
) -> Result<Json<Vec<JumpCandidateDto>>> {
    Ok(Json(
        state
            .profiles
            .jump_candidates(
                input.current_profile_id.as_deref(),
                &input.selected_profile_ids,
            )?
            .into_iter()
            .map(Into::into)
            .collect(),
    ))
}
pub async fn requirements(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let route = state.profiles.route(&id)?;
    Ok(Json(
        json!({"usesCredential":route.iter().any(|p| p.credential_id().is_some()), "routeNames":route.iter().map(|p|p.name()).collect::<Vec<_>>()}),
    ))
}
pub async fn load_workspace(State(state): State<Arc<ServerState>>) -> Result<Json<Value>> {
    let mut revision = state.workspace_revision.lock().unwrap();
    let mut runtime = state.workspace_runtime.lock().unwrap();
    if runtime.document.is_none() {
        let document = state
            .workspaces
            .load()?
            .as_ref()
            .map(WorkspaceDocumentDto::from_domain)
            .unwrap_or_else(crate::workspace_runtime::default_document);
        state.workspaces.save(document.clone().into_domain())?;
        runtime.document = Some(document);
    }
    if crate::workspace_recovery::recover(&state, runtime.document.as_mut().unwrap()) {
        state
            .workspaces
            .save(runtime.document.as_ref().unwrap().clone().into_domain())?;
        *revision += 1;
    }
    let document = runtime.document.clone();
    Ok(Json(json!({"revision":*revision,"document":document})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceSave {
    revision: u64,
    document: WorkspaceDocumentDto,
}
pub async fn save_workspace(
    State(state): State<Arc<ServerState>>,
    Json(input): Json<WorkspaceSave>,
) -> Result<Json<Value>> {
    let mut revision = state.workspace_revision.lock().unwrap();
    if input.revision != *revision {
        return Err(ApiError::new(
            axum::http::StatusCode::CONFLICT,
            "workspaceConflict",
            "工作区已在另一页面更新，请刷新后重试",
        ));
    }
    let unchanged = state
        .workspace_runtime
        .lock()
        .unwrap()
        .document
        .as_ref()
        .is_some_and(|document| {
            document.clone().into_domain() == input.document.clone().into_domain()
        });
    if unchanged && input.document.schema_version == 10 {
        return Ok(Json(json!({"revision":*revision})));
    }
    if input.document.schema_version != 10 {
        return Err(ApiError::invalid());
    }
    state
        .workspaces
        .save(input.document.clone().into_domain())?;
    let keys = crate::workspace_recovery::keys(&input.document);
    let mut runtime = state.workspace_runtime.lock().unwrap();
    runtime
        .panes
        .retain(|key, _| keys.contains(key.split(':').next().unwrap_or(key)));
    runtime.document = Some(input.document);
    *revision += 1;
    Ok(Json(json!({"revision":*revision})))
}
