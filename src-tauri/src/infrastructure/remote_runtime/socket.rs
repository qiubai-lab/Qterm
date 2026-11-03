use super::RemoteRuntime;
use axum::{
    extract::ws::{Message, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use reqwest::{Url, cookie::CookieStore};
use std::sync::Arc;
use tokio_tungstenite::tungstenite::{Message as RemoteMessage, client::IntoClientRequest};

pub async fn upgrade(
    runtime: Arc<RemoteRuntime>,
    mut target: Url,
    ws: WebSocketUpgrade,
) -> Response {
    let cookies = runtime.cookies.cookies(&target);
    let scheme = if target.scheme() == "https" {
        "wss"
    } else {
        "ws"
    };
    if target.set_scheme(scheme).is_err() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(mut request) = target.as_str().into_client_request() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    request.headers_mut().insert(
        header::USER_AGENT,
        super::client_identity::user_agent()
            .parse()
            .expect("static desktop identity is a valid header"),
    );
    request.headers_mut().insert(
        header::ORIGIN,
        runtime
            .endpoint
            .origin()
            .ascii_serialization()
            .parse()
            .unwrap(),
    );
    if let Some(cookie) = cookies {
        request.headers_mut().insert(header::COOKIE, cookie);
    }
    let connected = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio_tungstenite::connect_async(request),
    )
    .await;
    let Ok(Ok((remote, _))) = connected else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    ws.max_message_size(2 * 1024 * 1024).on_upgrade(move |local| async move {
        let (mut local_send, mut local_read) = local.split();
        let (mut remote_send, mut remote_read) = remote.split();
        let send = async {
            while let Some(Ok(message)) = local_read.next().await {
                let message = match message {
                    Message::Text(v) => RemoteMessage::Text(v.as_str().into()),
                    Message::Binary(v) => RemoteMessage::Binary(v),
                    Message::Ping(v) => RemoteMessage::Ping(v),
                    Message::Pong(v) => RemoteMessage::Pong(v),
                    Message::Close(_) => break,
                };
                if remote_send.send(message).await.is_err() { break; }
            }
        };
        let receive = async {
            while let Some(Ok(message)) = remote_read.next().await {
                let message = match message {
                    RemoteMessage::Text(v) => Message::Text(v.as_str().into()),
                    RemoteMessage::Binary(v) => Message::Binary(v),
                    RemoteMessage::Ping(v) => Message::Ping(v),
                    RemoteMessage::Pong(v) => Message::Pong(v),
                    RemoteMessage::Close(_) => break,
                    RemoteMessage::Frame(_) => continue,
                };
                if local_send.send(message).await.is_err() { break; }
            }
        };
        tokio::select! { _ = send => {}, _ = receive => {}, _ = runtime.cancel.cancelled() => {} }
        let _ = local_send.close().await;
        let _ = remote_send.close().await;
    }).into_response()
}
