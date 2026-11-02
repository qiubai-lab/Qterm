//! One small presence socket per page, independent of terminal and file blocks.
use crate::{
    access::Proof,
    auth::{Identity, check_origin},
    error::{ApiError, Result},
    socket_io::{finish, send},
    state::ServerState,
};
use axum::{
    Extension,
    extract::{State, WebSocketUpgrade, ws::Message},
    http::HeaderMap,
    response::Response,
};
use serde_json::json;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub async fn upgrade(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    headers: HeaderMap,
    Extension(mut audit): Extension<crate::access_log::Source>,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let permit = state
        .access_sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "busy",
                "连接请求过多，请稍后重试",
            )
        })?;
    Ok(ws.max_message_size(4096).max_frame_size(4096).on_upgrade(move |mut socket| async move {
        let _permit=permit;
        let Some(Ok(Message::Text(text)))=tokio::time::timeout(Duration::from_secs(5),socket.recv()).await.ok().flatten() else { state.access_log.record(crate::access_log::Kind::AccessDenied, false, "requestRejected", audit); return; };
        let Ok(proof)=serde_json::from_str::<Proof>(&text) else { state.access_log.record(crate::access_log::Kind::AccessDenied, false, "requestRejected", audit); return; };
        if let Err(error)=state.auth.access.prove_owner(&owner.0,&proof) { state.access_log.record(crate::access_log::Kind::AccessDenied, false, if error.code == "sessionReplaced" { "sessionReplaced" } else { "sessionExpired" }, audit.clone()); let _=send(&mut socket,Message::Text(json!({"type":"revoked","reason":error.code}).to_string().into())).await;finish(&mut socket).await;return; }
        audit.session = state.auth.access.audit_session_for_cookie(crate::auth::token(&headers, state.config.secure_cookie).unwrap_or_default());
        let Ok(transport)=state.auth.access.attach(&owner.0) else { return; };
        let mut changes=state.auth.access.subscribe();
        let mut vault_changes=state.vault.subscribe();
        let mut vault_revision=None;
        let mut heartbeat=tokio::time::interval(Duration::from_secs(5));
        let mut seen=Instant::now();
        let mut terminal_locked=state.auth.access.terminal_locked(&owner.0).unwrap_or(true);
        if send(&mut socket,Message::Text(json!({"type":"ready"}).to_string().into())).await.is_ok() {
            state.access_log.record(crate::access_log::Kind::Connected, true, "presenceReady", audit.clone());
            loop {
                if let Err(error)=state.auth.access.prove_owner(&owner.0,&proof) {
                    state.access_log.record(crate::access_log::Kind::Revoked, true, if error.code == "sessionReplaced" { "sessionReplaced" } else { "sessionExpired" }, audit.clone());
                    let _=send(&mut socket,Message::Text(json!({"type":"revoked","reason":error.code}).to_string().into())).await;break;
                }
                let locked=state.auth.access.terminal_locked(&owner.0).unwrap_or(true);
                if locked != terminal_locked {
                    terminal_locked=locked;
                    if send(&mut socket,Message::Text(json!({"type":"terminalLock","locked":locked}).to_string().into())).await.is_err(){break;}
                }
                let vault_status=vault_changes.borrow_and_update().clone();
                if locked { vault_revision=None; }
                else if let Some(status)=vault_status
                    && vault_revision != Some(status.revision) {
                        let initial=vault_revision.is_none();
                        if let Ok(permit)=crate::data_access::Permit::new(&state,&owner.0) {
                            let message=Message::Text(json!({"type":"vaultStatus","initial":initial,"status":status}).to_string().into());
                            if permit.run(send(&mut socket,message)).await.is_ok(){vault_revision=Some(status.revision);}
                        }
                }
                tokio::select! {
                    _=changes.changed()=>{},
                    _=vault_changes.changed()=>{},
                    _=heartbeat.tick()=>{
                        if seen.elapsed()>Duration::from_secs(30) { break; }
                        if send(&mut socket,Message::Ping(Vec::new().into())).await.is_err() { break; }
                    },
                    input=socket.recv()=>match input {
                        Some(Ok(Message::Pong(_)))=>{seen=Instant::now();if !state.auth.access.touch(&owner.0,&transport) { break; }},
                        Some(Ok(Message::Ping(bytes)))=>{if send(&mut socket,Message::Pong(bytes)).await.is_err() { break; }},
                        _=>break,
                    }
                }
            }
        }
        state.access_log.record(crate::access_log::Kind::Disconnected, true, "connectionClosed", audit);
        state.auth.access.detach(&owner.0,&transport);
        finish(&mut socket).await;
    }))
}
