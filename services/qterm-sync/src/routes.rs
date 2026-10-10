use crate::database::Database;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use qterm_sync_core::{MAX_BYTES, Push, Snapshot};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use subtle::ConstantTimeEq;

#[derive(Clone)]
struct AppState {
    database: Arc<Mutex<Database>>,
    digest: [u8; 32],
}

pub fn parse_digest(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.is_ascii() {
        return None;
    }
    let mut result = [0; 32];
    for (index, byte) in result.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(result)
}

pub fn router(database: Database, digest: [u8; 32]) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/catalog", get(snapshot).put(push))
        .layer(DefaultBodyLimit::max(MAX_BYTES))
        .with_state(AppState {
            database: Arc::new(Mutex::new(database)),
            digest,
        })
}

fn authorize(headers: &HeaderMap, state: &AppState) -> Result<(), StatusCode> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| (32..=512).contains(&v.len()))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let hash: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    if bool::from(hash.ct_eq(&state.digest)) {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Snapshot>, StatusCode> {
    authorize(&headers, &state)?;
    tokio::task::spawn_blocking(move || {
        state
            .database
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .snapshot()
            .map(Json)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
}

async fn push(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Push>,
) -> Result<Json<Snapshot>, StatusCode> {
    authorize(&headers, &state)?;
    tokio::task::spawn_blocking(move || {
        state
            .database
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .push(input)
            .map(Json)
            .map_err(|error| match error {
                "conflict" => StatusCode::CONFLICT,
                "invalid" | "protocol" => StatusCode::UNPROCESSABLE_ENTITY,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
}

#[cfg(test)]
mod tests;
