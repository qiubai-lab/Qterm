use crate::socket_io::{SessionControl, send};
use crate::{
    auth::{Identity, check_origin},
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::HeaderMap,
    response::Response,
};
use qterm_core::infrastructure::ssh::client::SessionPurpose;
use qterm_protocol::sessions::{SessionConnectDto, SessionEventDto};
use serde::Deserialize;
use serde_json::json;
use std::{sync::Arc, time::Duration};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Open {
    #[serde(flatten)]
    access: crate::access::Proof,
    version: u8,
    purpose: String,
    input: SessionConnectDto,
    #[serde(rename = "runtimeKey")]
    runtime_key: Option<String>,
}
pub async fn upgrade(
    State(state): State<Arc<ServerState>>,
    Extension(identity): Extension<Identity>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let permit = state.sockets.clone().try_acquire_owned().map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "sessionLimit",
            "已达到会话数量上限",
        )
    })?;
    Ok(ws
        .max_message_size(64 * 1024)
        .max_frame_size(64 * 1024)
        .on_upgrade(move |socket| async move {
            let _permit = permit;
            run(socket, state, identity.0).await;
        }))
}
async fn run(mut socket: WebSocket, state: Arc<ServerState>, owner: String) {
    let Some(Ok(Message::Text(text))) =
        tokio::time::timeout(Duration::from_secs(10), socket.recv())
            .await
            .ok()
            .flatten()
    else {
        return;
    };
    let Ok(open) = serde_json::from_str::<Open>(&text) else {
        return;
    };
    if state.auth.access.prove_owner(&owner, &open.access).is_err() {
        return;
    }
    if open.version != 1 || !state.auth.valid(&owner) {
        return;
    }
    let purpose = match open.purpose.as_str() {
        "terminal" => SessionPurpose::Terminal,
        "files" => SessionPurpose::Files,
        _ => return,
    };
    let gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner) {
        return;
    }
    if let Some(existing) = open
        .runtime_key
        .as_deref()
        .and_then(|key| crate::retained_socket::lookup(&state, key))
    {
        if existing.kind != open.purpose
            || existing.profile_id.as_deref() != Some(&open.input.profile_id)
        {
            return;
        }
        drop(gate);
        crate::retained_socket::attach(socket, state, owner, existing).await;
        return;
    }
    if state.retained.lock().unwrap().len() >= 32 {
        let _ = send(
            &mut socket,
            Message::Text(
                json!({"type":"error","error":{"message":"后台会话已达 32 个，请关闭不用的终端"}})
                    .to_string()
                    .into(),
            ),
        )
        .await;
        return;
    }
    let columns = open
        .input
        .terminal_size
        .as_ref()
        .map(|s| s.columns)
        .unwrap_or(80);
    let rows = open
        .input
        .terminal_size
        .as_ref()
        .map(|s| s.rows)
        .unwrap_or(24);
    let profile = Some(open.input.profile_id.clone());
    let session = crate::retained_session::RetainedSession::new(
        state.screen_worker.clone(),
        SessionControl::Remote(state.sessions.clone()),
        open.runtime_key,
        &open.purpose,
        profile,
        columns,
        rows,
    );
    let session = match session {
        Ok(s) => s,
        Err(e) => {
            let _ = send(
                &mut socket,
                Message::Text(json!({"type":"error","error":e}).to_string().into()),
            )
            .await;
            return;
        }
    };
    let output = session.bytes();
    let request = match crate::connection::prepare(&state, open.input, purpose, output) {
        Ok(value) => value,
        Err(error) => {
            drop(gate);
            let _ = send(
                &mut socket,
                Message::Text(json!({"type":"error","error":error}).to_string().into()),
            )
            .await;
            return;
        }
    };
    let emit = session.events();
    let events = Arc::new(move |event| emit(json!(SessionEventDto::from(event))));
    let id = state.sessions.connect(request, events);
    session.ready(id, None);
    if crate::retained_socket::register(&state, session.clone()).is_err() {
        return;
    }
    drop(gate);
    crate::retained_socket::attach(socket, state, owner, session).await;
}
