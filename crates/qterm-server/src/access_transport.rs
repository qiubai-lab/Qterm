//! Admission endpoints do not grant workspace access until confirmation succeeds.
use crate::{
    access::{Admission, Proof},
    auth::{check_origin, cookie, token},
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

pub fn admitted(state: &ServerState, admission: Admission, lock_vault: bool) -> Result<Response> {
    match admission {
        Admission::Occupied { ticket } => {
            Ok(Json(json!({"authenticated":false,"takeoverTicket":ticket})).into_response())
        }
        Admission::Granted { cookie: token, key } => {
            if lock_vault {
                state.clear_login_secrets();
                state
                    .vault
                    .lock(qterm_core::application::credential_lifecycle::LockReason::Manual);
            }
            Ok((
                [(
                    header::SET_COOKIE,
                    cookie(state.config.secure_cookie, &token, 8 * 3600),
                )],
                Json(json!({"authenticated":true,"accessKey":key})),
            )
                .into_response())
        }
    }
}
pub async fn resume(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(proof): Json<Proof>,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let cookie = token(&headers, state.config.secure_cookie).ok_or_else(ApiError::unauthorized)?;
    let _gate = state.vault_gate.lock().await;
    admitted(&state, state.auth.access.resume(cookie, &proof)?, false)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Takeover {
    ticket: String,
    client_id: String,
}
pub async fn takeover(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(input): Json<Takeover>,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let _gate = state.vault_gate.lock().await;
    admitted(
        &state,
        state
            .auth
            .access
            .takeover(&input.ticket, &input.client_id)?,
        true,
    )
}
