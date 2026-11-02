//! Workbench privacy lock belongs to the login, not the lifetime of a browser document.
use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
    vault,
};
use axum::{Extension, Json, extract::State};
use qterm_core::application::credential_lifecycle::LockReason;
use serde_json::{Value, json};
use std::sync::Arc;

pub async fn status(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    Ok(Json(
        json!({"locked": state.auth.access.terminal_locked(&owner.0)?}),
    ))
}

pub async fn lock(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    state.auth.access.terminal_locked(&owner.0)?;
    let status = state.vault.status()?;
    if !status.initialized || status.legacy {
        return Err(ApiError::invalid());
    }
    state.vault.lock(LockReason::Manual);
    *state.credential_workflow.lock().unwrap() = Default::default();
    state.auth.access.set_terminal_locked(&owner.0, true)?;
    state.downloads.lock().unwrap().clear();
    state.transfer_tasks.clear();
    Ok(Json(json!({"locked": true})))
}

pub async fn unlock(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<vault::Unlock>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    vault::unlock_for_owner(&state, &owner.0, input.master_password).await?;
    state.auth.access.set_terminal_locked(&owner.0, false)?;
    Ok(Json(json!({"locked": false})))
}

#[cfg(test)]
#[path = "terminal_lock_tests.rs"]
mod tests;
