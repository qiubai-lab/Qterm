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

#[derive(Clone)]
pub struct AdmissionOutcome {
    pub pending: bool,
    pub session: Option<String>,
}

pub fn admitted(state: &ServerState, admission: Admission) -> Result<Response> {
    match admission {
        Admission::Occupied { ticket } => {
            let mut response =
                Json(json!({"authenticated":false,"takeoverTicket":ticket})).into_response();
            response.extensions_mut().insert(AdmissionOutcome {
                pending: true,
                session: None,
            });
            Ok(response)
        }
        Admission::Granted { cookie: token, key } => {
            let mut response = (
                [(
                    header::SET_COOKIE,
                    cookie(state.config.secure_cookie, &token, 8 * 3600),
                )],
                Json(json!({"authenticated":true,"accessKey":key})),
            )
                .into_response();
            response.extensions_mut().insert(AdmissionOutcome {
                pending: false,
                session: state.auth.access.audit_session_for_cookie(&token),
            });
            Ok(response)
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
    let admission = crate::access_lifecycle::resume(&state, cookie, &proof).await?;
    admitted(&state, admission)
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
    let admission =
        crate::access_lifecycle::takeover(&state, &input.ticket, &input.client_id).await?;
    admitted(&state, admission)
}

#[cfg(test)]
#[path = "access_takeover_tests.rs"]
mod tests;
