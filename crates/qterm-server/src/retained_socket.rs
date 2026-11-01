//! Attachments are disposable. Only an explicit close or server shutdown ends a process.
use crate::{
    auth::{Identity, check_origin},
    error::{ApiError, Result},
    retained_session::RetainedSession,
    socket_io::send,
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::HeaderMap,
    response::Response,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::broadcast;

pub fn lookup(state: &ServerState, key: &str) -> Option<Arc<RetainedSession>> {
    state
        .retained
        .lock()
        .unwrap()
        .values()
        .find(|s| s.runtime_key.as_deref() == Some(key))
        .cloned()
}
pub fn register(state: &ServerState, session: Arc<RetainedSession>) -> Result<()> {
    let mut registry = state.retained.lock().unwrap();
    if registry.len() >= 32 {
        session.stop();
        return Err(ApiError::new(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "sessionLimit",
            "后台会话已达 32 个，请关闭不用的终端",
        ));
    }
    let id = session.id();
    state
        .owners
        .lock()
        .unwrap()
        .insert(id.clone(), "single-user".into());
    registry.insert(id, session);
    Ok(())
}
pub async fn list(State(state): State<Arc<ServerState>>) -> Json<Value> {
    Json(json!(
        state
            .retained
            .lock()
            .unwrap()
            .values()
            .map(|s| s.metadata())
            .collect::<Vec<_>>()
    ))
}
pub async fn destroy(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &id)?;
    if let Some(session) = state.retained.lock().unwrap().remove(&id) {
        session.stop();
    }
    state.owners.lock().unwrap().remove(&id);
    Ok(Json(Value::Null))
}
pub async fn upgrade(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let permit = state
        .sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::forbidden())?;
    Ok(ws
        .max_message_size(64 * 1024)
        .on_upgrade(move |mut socket| async move {
            let _permit = permit;
            let Some(Ok(Message::Text(text))) =
                tokio::time::timeout(Duration::from_secs(10), socket.recv())
                    .await
                    .ok()
                    .flatten()
            else {
                return;
            };
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase", deny_unknown_fields)]
            struct Attach {
                version: u8,
                session_id: String,
                #[serde(rename = "runtimeKey")]
                _runtime_key: Option<String>,
            }
            let Ok(input) = serde_json::from_str::<Attach>(&text) else {
                return;
            };
            if input.version != 2 || state.authorize(&owner.0, &input.session_id).is_err() {
                return;
            }
            let session = state
                .retained
                .lock()
                .unwrap()
                .get(&input.session_id)
                .cloned();
            if let Some(session) = session {
                attach(socket, state, owner.0, session).await;
            }
        }))
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
enum Control {
    Resize { columns: u32, rows: u32 },
    AcceptHostKey,
    RejectHostKey,
    Close,
    Ack { bytes: usize },
}
pub async fn attach(
    mut socket: WebSocket,
    state: Arc<ServerState>,
    owner: String,
    session: Arc<RetainedSession>,
) {
    let prepared = {
        let session = session.clone();
        tokio::task::spawn_blocking(move || session.attach()).await
    };
    let Ok(Ok((client, ready, snapshot, mut output))) = prepared else {
        let _ = send(
            &mut socket,
            Message::Text(
                json!({"type":"error","error":{"message":"无法恢复终端画面，后台任务仍在运行"}})
                    .to_string()
                    .into(),
            ),
        )
        .await;
        return;
    };
    let id = session.id();
    if send(&mut socket, Message::Text(ready.to_string().into()))
        .await
        .is_err()
    {
        session.detach(client);
        return;
    }
    let mut outstanding = 0usize;
    // Snapshot consumption uses the same bounded credit as live output.
    let mut initial = snapshot.chunks(16384);
    let mut snapshot_done = false;
    let mut last_seen = Instant::now();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(1));
    let mut writable = session.writable(client);
    loop {
        if !snapshot_done && outstanding < 256 * 1024 {
            if let Some(chunk) = initial.next() {
                if send(&mut socket, Message::Binary(chunk.to_vec().into()))
                    .await
                    .is_err()
                {
                    break;
                }
                outstanding += chunk.len();
                continue;
            }
            snapshot_done = true;
            if send(
                &mut socket,
                Message::Text(json!({"type":"restored"}).to_string().into()),
            )
            .await
            .is_err()
            {
                break;
            }
            // Restore current connection/host-key state after its screen.
            let _ = send(
                &mut socket,
                Message::Text(
                    json!({"type":"event","event":{"type":"stateChanged","state":ready["status"]}})
                        .to_string()
                        .into(),
                ),
            )
            .await;
            for event in [ready.get("event"), ready.get("failure")]
                .into_iter()
                .flatten()
                .filter(|v| !v.is_null())
            {
                let _ = send(
                    &mut socket,
                    Message::Text(json!({"type":"event","event":event}).to_string().into()),
                )
                .await;
            }
        }
        tokio::select! {
            _=heartbeat.tick()=>{
                if !state.auth.valid(&owner)||last_seen.elapsed()>Duration::from_secs(30)||state.authorize(&owner,&id).is_err(){break;}
                let access=session.writable(client);
                if access!=writable{writable=access;let _=send(&mut socket,Message::Text(json!({"type":"access","readOnly":!access}).to_string().into())).await;}
                if send(&mut socket,Message::Ping(Vec::new().into())).await.is_err(){break;}
            }
            next=output.recv(),if snapshot_done && outstanding<256*1024=>{
                match next{
                    Ok(message)=>{if let Message::Binary(bytes)=&message{outstanding+=bytes.len();}
                        if send(&mut socket,message).await.is_err(){break;}}
                    Err(broadcast::error::RecvError::Lagged(_))=>{
                        let _=send(&mut socket,Message::Text(json!({"type":"resync"}).to_string().into())).await;break;
                    }
                    Err(_)=>break,
                }
            }
            input=socket.recv()=>{
                if !state.auth.valid(&owner){break;}
                last_seen=Instant::now();
                let result=match input{
                    Some(Ok(Message::Binary(bytes))) if !bytes.is_empty() && session.writable(client)=>session.control.write(&id,bytes.to_vec()).await,
                    Some(Ok(Message::Text(text)))=>match serde_json::from_str::<Control>(&text){
                        Ok(Control::Ack{bytes}) if bytes>0 && bytes<=outstanding=>{outstanding-=bytes;Ok(())},
                        Ok(Control::Close) if session.writable(client)=>{session.stop();state.retained.lock().unwrap().remove(&id);state.owners.lock().unwrap().remove(&id);break;},
                        Ok(Control::Resize{columns,rows}) if session.writable(client)=>session.resize(columns,rows),
                        Ok(Control::AcceptHostKey) if session.writable(client)=>session.control.host_key(&id,true),
                        Ok(Control::RejectHostKey) if session.writable(client)=>session.control.host_key(&id,false),
                        _=>Err(ApiError::invalid()),
                    },
                    Some(Ok(Message::Pong(_)))=>Ok(()),Some(Ok(Message::Ping(bytes)))=>send(&mut socket,Message::Pong(bytes)).await,
                    _=>break,
                };
                if result.is_err(){break;}
            }
        }
    }
    session.detach(client);
    if send(&mut socket, Message::Close(None)).await.is_ok() {
        // Drain the close handshake. Dropping TCP with unread credits can send RST
        // and discard the resync marker that was just flushed to a slow viewer.
        let _ = tokio::time::timeout(Duration::from_secs(2), async {
            while let Some(Ok(message)) = socket.recv().await {
                if matches!(message, Message::Close(_)) {
                    break;
                }
            }
        })
        .await;
    }
}
