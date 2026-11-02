use crate::{
    auth::{Identity, check_origin},
    error::{ApiError, Result},
    socket_io::{SessionControl, send},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::HeaderMap,
    response::Response,
};
use qterm_core::{
    domain::session::TerminalSize,
    infrastructure::local::pty::{LocalSessionEvent, terminal_capabilities},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Open {
    #[serde(flatten)]
    access: crate::access::Proof,
    version: u8,
    columns: u32,
    rows: u32,
    osc7_enabled: bool,
    initial_directory: Option<PathBuf>,
    runtime_key: Option<String>,
}

pub async fn capabilities() -> Json<Value> {
    Json(
        json!({"windowsPty":terminal_capabilities().windows_pty.map(|value|json!({"backend":value.backend,"buildNumber":value.build_number}))}),
    )
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
    let Ok(size) = TerminalSize::new(open.columns, open.rows) else {
        return;
    };
    if state.auth.access.prove_owner(&owner, &open.access).is_err() {
        return;
    }
    if open.version != 1 || !state.auth.valid(&owner) {
        return;
    }
    let gate = state.vault_gate.lock().await;
    if crate::data_access::Permit::new(&state, &owner).is_err() {
        return;
    }
    if let Some(existing) = open
        .runtime_key
        .as_deref()
        .and_then(|key| crate::retained_socket::lookup(&state, key))
    {
        if existing.kind != "local" {
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
    let manager = state.local_sessions.clone();
    let history_free = state.settings.terminal().history_free_bash_enabled;
    let session = crate::retained_session::RetainedSession::new(
        state.screen_worker.clone(),
        SessionControl::Local(manager.clone()),
        open.runtime_key,
        "local",
        None,
        open.columns,
        open.rows,
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
    let emit = session.events();
    let connection=tokio::task::spawn_blocking(move||manager.connect_with_mode(
        portable_pty::PtySize{cols:size.columns as u16,rows:size.rows as u16,pixel_width:0,pixel_height:0},
        open.osc7_enabled,open.initial_directory,output,
        Arc::new(move|event|emit(json!({"type":"stateChanged","state":match event{LocalSessionEvent::Connected=>"connected",LocalSessionEvent::Closed=>"closed"}}))),history_free)).await;
    let Ok(Ok(connection)) = connection else {
        drop(gate);
        let _=send(&mut socket,Message::Text(json!({"type":"error","error":{"message":"无法启动服务所在主机的 Shell，请检查账户、主目录和 Shell 配置"}}).to_string().into())).await;
        return;
    };
    session.ready(
        connection.session_id,
        Some(connection.cwd.to_string_lossy().into_owned()),
    );
    if crate::retained_socket::register(&state, session.clone()).is_err() {
        return;
    }
    drop(gate);
    crate::retained_socket::attach(socket, state, owner, session).await;
}
