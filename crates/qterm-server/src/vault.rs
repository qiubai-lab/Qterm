use crate::{
    auth::{Identity, random_token},
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use qterm_core::{
    application::credential_lifecycle::{LockReason, LockSchedule},
    domain::{
        auth::{SecretBytes, SecretText},
        credential::{
            CredentialKind, CredentialMaterial, CredentialSummary, GeneratedPrivateKeyAlgorithm,
            RecoveryKeyFile,
        },
    },
    infrastructure::ssh::auth::{generate_private_key_bytes, load_private_key_bytes},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub struct PendingRecovery {
    owner: String,
    id: String,
    expires: Instant,
    file: RecoveryKeyFile,
    downloaded: bool,
    current: Option<RecoveryKeyFile>,
}
pub async fn status(State(state): State<Arc<ServerState>>) -> Result<Json<Value>> {
    let value = state.vault.status()?;
    Ok(Json(
        json!({"initialized":value.initialized,"unlocked":value.unlocked,"legacy":value.legacy}),
    ))
}
pub async fn prepare_recovery(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if state.vault.status()?.initialized {
        return Err(ApiError::invalid());
    }
    let file = state.vault.prepare_initial_recovery()?;
    let id = random_token()?;
    *state.pending_recovery.lock().unwrap() = Some(PendingRecovery {
        owner: owner.0,
        id: id.clone(),
        expires: Instant::now() + Duration::from_secs(600),
        file,
        downloaded: false,
        current: None,
    });
    Ok(Json(json!({"id":id})))
}
pub async fn download_recovery(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Response> {
    let mut pending = state.pending_recovery.lock().unwrap();
    let p = pending.as_mut().ok_or_else(ApiError::invalid)?;
    if p.owner != owner.0 || p.id != id || p.expires < Instant::now() {
        return Err(ApiError::forbidden());
    }
    p.downloaded = true;
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=qterm-recovery.key",
            ),
            (header::CACHE_CONTROL, "no-store"),
        ],
        p.file.expose().to_vec(),
    )
        .into_response())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Initialize {
    recovery_id: String,
    master_password: String,
    saved_recovery: bool,
}
pub async fn initialize(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Initialize>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if !input.saved_recovery || input.master_password.len() > 1024 {
        return Err(ApiError::invalid());
    }
    let recovery = {
        let mut pending = state.pending_recovery.lock().unwrap();
        let p = pending.as_ref().ok_or_else(ApiError::invalid)?;
        if p.owner != owner.0
            || p.id != input.recovery_id
            || p.expires < Instant::now()
            || p.current.is_some()
            || !p.downloaded
        {
            return Err(ApiError::forbidden());
        }
        pending.take().unwrap().file
    };
    let vault = state.vault.clone();
    let password = SecretText::new(input.master_password);
    let settings = state.settings.security();
    let schedule =
        tokio::task::spawn_blocking(move || vault.initialize(password, recovery, settings))
            .await
            .map_err(|_| ApiError::storage())??;
    if !state.auth.valid(&owner.0) {
        state.vault.lock(LockReason::Manual);
        return Err(ApiError::unauthorized());
    }
    schedule_lock(&state, schedule);
    Ok(Json(json!({"completed":true})))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Unlock {
    master_password: String,
}
pub async fn unlock(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Unlock>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if input.master_password.len() > 1024 {
        return Err(ApiError::invalid());
    }
    let permit = state
        .auth
        .verification
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new(StatusCode::TOO_MANY_REQUESTS, "busy", "请稍后重试"))?;
    let vault = state.vault.clone();
    let password = SecretText::new(input.master_password);
    let settings = state.settings.security();
    let schedule = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        vault.unlock(password, settings)
    })
    .await
    .map_err(|_| ApiError::storage())??;
    if !state.auth.valid(&owner.0) {
        state.vault.lock(LockReason::Manual);
        return Err(ApiError::unauthorized());
    }
    schedule_lock(&state, schedule);
    Ok(Json(Value::Null))
}
pub(crate) fn schedule_lock(state: &ServerState, schedule: Option<LockSchedule>) {
    if let Some(schedule) = schedule {
        let vault = state.vault.clone();
        tokio::spawn(async move {
            tokio::time::sleep(schedule.delay).await;
            vault.lock_if_generation(schedule.generation);
        });
    }
}
pub async fn lock(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    state.vault.lock(LockReason::Manual);
    *state.credential_workflow.lock().unwrap() = Default::default();
    Ok(Json(Value::Null))
}
pub(crate) fn summary(item: CredentialSummary) -> Value {
    json!({"id":item.id.as_str(),"name":item.name,"kind":if item.kind==CredentialKind::Password {"password"}else{"privateKey"},"detail":item.detail})
}
pub async fn list(State(state): State<Arc<ServerState>>) -> Result<Json<Vec<Value>>> {
    Ok(Json(state.vault.list()?.into_iter().map(summary).collect()))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Password {
    name: String,
    password: String,
}
pub async fn create_password(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Password>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if input.password.len() > 4096 {
        return Err(ApiError::invalid());
    }
    Ok(Json(summary(state.vault.create_password(
        input.name,
        SecretText::new(input.password),
    )?)))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Name {
    name: String,
}
pub async fn rename(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
    Json(input): Json<Name>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    Ok(Json(summary(state.vault.rename(&id, input.name)?)))
}
pub async fn delete(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    state.vault.delete(&id)?;
    state.profiles.clear_credential_references(&id)?;
    Ok(Json(Value::Null))
}
pub async fn generate(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Name>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let vault = state.vault.clone();
    let value = tokio::task::spawn_blocking(move || -> Result<Value> {
        if !vault.status()?.unlocked {
            return Err(qterm_core::domain::credential::CredentialError::Locked.into());
        }
        let bytes = generate_private_key_bytes(GeneratedPrivateKeyAlgorithm::Ed25519, "")
            .map_err(qterm_core::application::error::ApplicationError::from)?;
        Ok(summary(vault.import_private_key(
            input.name,
            SecretBytes::new(bytes.to_vec()),
            None,
            "Ed25519".into(),
        )?))
    })
    .await
    .map_err(|_| ApiError::storage())??;
    Ok(Json(value))
}
pub async fn public_key(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<String>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let CredentialMaterial::PrivateKey { data, passphrase } = state.vault.load(&id)? else {
        return Err(ApiError::invalid());
    };
    let loaded = load_private_key_bytes(data.expose(), passphrase.as_ref())
        .map_err(qterm_core::application::error::ApplicationError::from)?;
    Ok(Json(loaded.openssh_public_key().map_err(
        qterm_core::application::error::ApplicationError::from,
    )?))
}

pub async fn prepare_reset(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    body: axum::body::Bytes,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if body.is_empty() || body.len() > 1024 * 1024 {
        return Err(ApiError::invalid());
    }
    let current = RecoveryKeyFile::new(body.to_vec());
    let vault = state.vault.clone();
    let (current, file) = tokio::task::spawn_blocking(move || {
        let replacement =
            vault.prepare_recovery_reset(RecoveryKeyFile::new(current.expose().to_vec()))?;
        Ok::<_, qterm_core::domain::credential::CredentialError>((current, replacement))
    })
    .await
    .map_err(|_| ApiError::storage())??;
    let id = random_token()?;
    *state.pending_recovery.lock().unwrap() = Some(PendingRecovery {
        owner: owner.0,
        id: id.clone(),
        expires: Instant::now() + Duration::from_secs(600),
        file,
        downloaded: false,
        current: Some(current),
    });
    Ok(Json(json!({"id":id})))
}
pub async fn reset(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Initialize>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if !input.saved_recovery || input.master_password.len() > 1024 {
        return Err(ApiError::invalid());
    }
    let pending = {
        let mut slot = state.pending_recovery.lock().unwrap();
        let p = slot.as_ref().ok_or_else(ApiError::invalid)?;
        if p.owner != owner.0
            || p.id != input.recovery_id
            || p.expires < Instant::now()
            || !p.downloaded
            || p.current.is_none()
        {
            return Err(ApiError::forbidden());
        }
        slot.take().unwrap()
    };
    let vault = state.vault.clone();
    let settings = state.settings.security();
    let password = SecretText::new(input.master_password);
    let schedule = tokio::task::spawn_blocking(move || {
        vault.reset_master_password(pending.current.unwrap(), pending.file, password, settings)
    })
    .await
    .map_err(|_| ApiError::storage())??;
    schedule_lock(&state, schedule);
    Ok(Json(json!({"completed":true})))
}
pub async fn cancel_reset(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    *state.pending_recovery.lock().unwrap() = None;
    Ok(Json(Value::Null))
}
