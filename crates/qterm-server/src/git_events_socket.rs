//! Multiplexed Git invalidation stream. Payloads remain behind authenticated HTTP.
use crate::{
    auth::{Identity, check_origin},
    data_access::Permit,
    error::{ApiError, Result},
    git_observation::Target,
    socket_io::{finish, send},
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
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Hello {
    #[serde(flatten)]
    access: crate::access::Proof,
    version: u8,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
enum Control {
    Subscribe { id: String, target: Target },
    Unsubscribe { id: String },
}
struct Subscription(tokio::task::JoinHandle<()>);
impl Drop for Subscription {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub async fn upgrade(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    let slot = state
        .sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::forbidden())?;
    Ok(ws
        .max_message_size(16 * 1024)
        .on_upgrade(move |socket| async move {
            let _slot = slot;
            run(socket, state, owner.0).await;
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
    let Ok(hello) = serde_json::from_str::<Hello>(&text) else {
        return;
    };
    if hello.version != 1
        || state
            .auth
            .access
            .prove_owner(&owner, &hello.access)
            .is_err()
    {
        return;
    }
    let Ok(permit) = Permit::new(&state, &owner) else {
        return;
    };
    let (events, mut messages) = tokio::sync::mpsc::channel(32);
    let mut subscriptions = HashMap::<String, Subscription>::new();
    let mut changes = state.auth.access.subscribe();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(5));
    let mut seen = Instant::now();
    loop {
        if permit.check().is_err() {
            break;
        }
        tokio::select! {
            _=changes.changed()=>{},
            _=heartbeat.tick()=>{if seen.elapsed()>Duration::from_secs(30)||send(&mut socket,Message::Ping(Vec::new().into())).await.is_err(){break;}},
            Some((id,revision))=messages.recv()=>{
                if !subscriptions.contains_key(&id){continue;}
                let message=Message::Text(json!({"type":"repositoryChanged","id":id,"revision":revision}).to_string().into());
                if permit.run(send(&mut socket,message)).await.is_err(){break;}
            },
            message=socket.recv()=>{
                if permit.check().is_err(){break;}
                seen=Instant::now();
                match message{
                    Some(Ok(Message::Text(text)))=>{
                        let result=match serde_json::from_str::<Control>(&text){
                            Ok(Control::Unsubscribe{id})=>{subscriptions.remove(&id);Ok(())},
                            Ok(Control::Subscribe{id,target})=>{
                                if id.len()>80 || id.is_empty() || subscriptions.len()>=32 {break;}
                                let feed = match target.normalize().and_then(|target|state.git_observations.subscribe(&state,&owner,target)) {
                                    Ok(feed) => feed,
                                    Err(error) => {
                                        let message=Message::Text(json!({"type":"subscriptionError","id":id,"error":error}).to_string().into());
                                        if permit.run(send(&mut socket,message)).await.is_err(){break;}
                                        continue;
                                    }
                                };
                                {
                                    let mut revisions=feed.changes.subscribe();let events=events.clone();let event_id=id.clone();
                                    let task=tokio::spawn(async move{
                                        let _feed=feed;
                                        loop {
                                            let revision=*revisions.borrow_and_update();
                                            if revision>0 && events.send((event_id.clone(),revision)).await.is_err(){break;}
                                            if revisions.changed().await.is_err(){break;}
                                        }
                                    });
                                    subscriptions.insert(id,Subscription(task));
                                }
                                Ok(())
                            },
                            Err(_)=>Err(ApiError::invalid()),
                        };
                        if let Err(error)=result{
                            let _=permit.run(send(&mut socket,Message::Text(json!({"type":"error","error":error}).to_string().into()))).await;
                            break;
                        }
                    },
                    Some(Ok(Message::Pong(_)))=>{},
                    Some(Ok(Message::Ping(bytes)))=>{if send(&mut socket,Message::Pong(bytes)).await.is_err(){break;}},
                    _=>break,
                }
            }
        }
    }
    drop(subscriptions);
    finish(&mut socket).await;
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Read {
    target: Target,
    revision: u64,
}
pub async fn snapshot(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Read>,
) -> Result<Json<Value>> {
    let target = input.target.normalize()?;
    target.authorize(&state, &owner.0)?;
    Ok(Json(state.git_observations.snapshot(
        &owner.0,
        target,
        input.revision,
    )?))
}
