use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
    vault::{schedule_lock, summary},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use qterm_core::{
    application::{credential_workflow::PendingPrivateKeySource, error::ApplicationError},
    domain::{
        auth::{SecretBytes, SecretText},
        credential::{
            CredentialMaterial, GeneratedPrivateKeyAlgorithm, GeneratedPrivateKeyComment,
        },
    },
    infrastructure::ssh::auth::{generate_private_key_bytes, load_private_key_bytes},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Generate {
    algorithm: String,
    comment: Option<String>,
}
pub async fn generate(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Generate>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    if !state.vault.status()?.unlocked {
        return Err(qterm_core::domain::credential::CredentialError::Locked.into());
    }
    let algorithm = match input.algorithm.as_str() {
        "ed25519" => GeneratedPrivateKeyAlgorithm::Ed25519,
        "ecdsaP256" => GeneratedPrivateKeyAlgorithm::EcdsaP256,
        "ecdsaP384" => GeneratedPrivateKeyAlgorithm::EcdsaP384,
        "ecdsaP521" => GeneratedPrivateKeyAlgorithm::EcdsaP521,
        _ => return Err(ApiError::invalid()),
    };
    let comment = GeneratedPrivateKeyComment::parse(input.comment)?;
    let bytes = tokio::task::spawn_blocking(move || {
        generate_private_key_bytes(algorithm, comment.as_str())
    })
    .await
    .map_err(|_| ApiError::storage())?
    .map_err(ApplicationError::from)?;
    let draft = state
        .credential_workflow
        .lock()
        .unwrap()
        .remember_private_key(
            PendingPrivateKeySource::Generated,
            "生成的 SSH 密钥".into(),
            input.algorithm,
            bytes,
        );
    Ok(Json(
        json!({"id":draft.id,"source":"generated","label":draft.label,"detail":draft.detail}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Import {
    content: String,
    name: String,
}
pub async fn import(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Import>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    let content = zeroize::Zeroizing::new(input.content.into_bytes());
    if !state.vault.status()?.unlocked {
        return Err(qterm_core::domain::credential::CredentialError::Locked.into());
    }
    if content.is_empty() || content.len() > 1024 * 1024 || input.name.len() > 255 {
        return Err(ApiError::invalid());
    }
    let draft = state
        .credential_workflow
        .lock()
        .unwrap()
        .remember_private_key(
            PendingPrivateKeySource::File,
            input.name,
            "私钥文件".into(),
            content,
        );
    Ok(Json(
        json!({"id":draft.id,"source":"file","label":draft.label,"detail":draft.detail}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Commit {
    name: String,
    passphrase: Option<String>,
}
pub async fn commit(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
    Json(input): Json<Commit>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    if input
        .passphrase
        .as_ref()
        .is_some_and(|value| value.len() > 4096)
    {
        return Err(ApiError::invalid());
    }
    let (_, bytes) = state
        .credential_workflow
        .lock()
        .unwrap()
        .private_key(&id)
        .ok_or_else(ApiError::invalid)?;
    let passphrase = input
        .passphrase
        .filter(|v| !v.is_empty())
        .map(SecretText::new);
    let vault = state.vault.clone();
    let item = tokio::task::spawn_blocking(move || -> Result<_> {
        let loaded =
            load_private_key_bytes(&bytes, passphrase.as_ref()).map_err(ApplicationError::from)?;
        let detail = match loaded.algorithm() {
            qterm_core::domain::auth::PrivateKeyAlgorithm::Ed25519 => "ed25519",
            qterm_core::domain::auth::PrivateKeyAlgorithm::EcdsaP256 => "ecdsa-p256",
            qterm_core::domain::auth::PrivateKeyAlgorithm::EcdsaP384 => "ecdsa-p384",
            qterm_core::domain::auth::PrivateKeyAlgorithm::EcdsaP521 => "ecdsa-p521",
            qterm_core::domain::auth::PrivateKeyAlgorithm::Rsa => "rsa",
        };
        Ok(vault.import_private_key(
            input.name,
            SecretBytes::new(bytes.to_vec()),
            passphrase,
            detail.into(),
        )?)
    })
    .await
    .map_err(|_| ApiError::storage())??;
    state
        .credential_workflow
        .lock()
        .unwrap()
        .complete_private_key(&id);
    Ok(Json(summary(item)))
}
pub async fn cancel(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    state
        .credential_workflow
        .lock()
        .unwrap()
        .complete_private_key(&id);
    Ok(Json(Value::Null))
}
pub async fn reveal(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<String>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    let CredentialMaterial::Password(value) = state.vault.load(&id)? else {
        return Err(ApiError::invalid());
    };
    Ok(Json(value.expose().to_owned()))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    old_password: String,
    new_password: String,
}
pub async fn change(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Change>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    if input.old_password.len() > 1024 || input.new_password.len() > 1024 {
        return Err(ApiError::invalid());
    }
    let vault = state.vault.clone();
    let settings = state.settings.security();
    let old = SecretText::new(input.old_password);
    let new = SecretText::new(input.new_password);
    let schedule =
        tokio::task::spawn_blocking(move || vault.change_master_password(old, new, settings))
            .await
            .map_err(|_| ApiError::storage())??;
    schedule_lock(&state, schedule);
    Ok(Json(Value::Null))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clear {
    confirmation: String,
}
pub async fn clear(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Clear>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    authorize(&state, &owner)?;
    if input.confirmation != "确认清除" {
        return Err(ApiError::invalid());
    }
    state.profiles.clear_all_credential_references()?;
    state.vault.clear()?;
    *state.pending_recovery.lock().unwrap() = None;
    *state.credential_workflow.lock().unwrap() = Default::default();
    Ok(Json(Value::Null))
}
fn authorize(state: &ServerState, owner: &Identity) -> Result<()> {
    if state.auth.valid(&owner.0) {
        Ok(())
    } else {
        Err(ApiError::unauthorized())
    }
}
