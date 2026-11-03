use super::*;
use axum::{
    Router,
    extract::ws::{Message, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{Message as WsMessage, client::IntoClientRequest};

#[test]
fn addresses_reject_credentials_paths_and_non_http_schemes() {
    for value in [
        "file:///tmp/test",
        "https://user:secret@example.com",
        "https://example.com/path",
        "https://example.com?token=x",
        "https://example.com/#x",
    ] {
        assert!(endpoint(value).is_err(), "{value}");
    }
    assert_eq!(
        endpoint(" http://127.0.0.1:8080 ").unwrap().as_str(),
        "http://127.0.0.1:8080/"
    );
}
async fn fixture() -> (Arc<RemoteRuntime>, tokio::task::JoinHandle<()>) {
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/api/v1/login",
            post(|headers: HeaderMap| async move {
                assert_eq!(headers["user-agent"], client_identity::user_agent());
                (
                    [("set-cookie", "qterm=private; Path=/; HttpOnly")],
                    "logged-in",
                )
            }),
        )
        .route(
            "/api/v1/auth",
            get(|headers: HeaderMap| async move {
                if headers.get("cookie").is_some_and(|v| v == "qterm=private") {
                    StatusCode::OK
                } else {
                    StatusCode::UNAUTHORIZED
                }
            }),
        )
        .route(
            "/api/v1/redirect",
            get(|| async { (StatusCode::FOUND, [("location", "http://example.invalid/")]) }),
        )
        .route(
            "/api/v1/socket",
            get(|headers: HeaderMap, ws: WebSocketUpgrade| async move {
                if headers.get("cookie").is_none_or(|v| v != "qterm=private") {
                    return StatusCode::UNAUTHORIZED.into_response();
                }
                let agent = headers
                    .get("user-agent")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or_default()
                    .to_owned();
                ws.on_upgrade(|mut socket| async move {
                    socket.send(Message::Text(agent.into())).await.unwrap();
                    while let Some(Ok(value)) = socket.recv().await {
                        if matches!(value, Message::Close(_)) {
                            break;
                        }
                        if socket.send(value).await.is_err() {
                            break;
                        }
                    }
                })
                .into_response()
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let runtime = RemoteRuntime::start(&endpoint, "http://localhost:1420".into())
        .await
        .unwrap();
    (runtime, server)
}
#[tokio::test]
async fn native_cookie_jar_and_origin_are_enforced_without_browser_cookies() {
    let (runtime, server) = fixture().await;
    let browser = Client::new();
    let base = runtime.info().api_base;
    assert_eq!(
        browser
            .get(format!("{base}/auth"))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        browser
            .get(format!("{base}/auth"))
            .header("origin", "https://evil.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let login = browser
        .post(format!("{base}/login"))
        .header("origin", "http://localhost:1420")
        .send()
        .await
        .unwrap();
    assert_eq!(login.status(), 200);
    assert!(login.headers().get("set-cookie").is_none());
    assert_eq!(
        login.headers()["access-control-allow-origin"],
        "http://localhost:1420"
    );
    assert_eq!(
        browser
            .get(format!("{base}/auth"))
            .header("origin", "http://localhost:1420")
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        browser
            .get(format!("{}/wrong/api/v1/auth", runtime.address))
            .header("origin", "http://localhost:1420")
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert!(runtime.target("/api/v1/../../../secret").is_err());
    let redirect = browser
        .get(format!("{base}/redirect"))
        .header("origin", "http://localhost:1420")
        .send()
        .await
        .unwrap();
    assert_eq!(redirect.status(), 302);
    assert!(redirect.headers().get("location").is_none());
    runtime.cancel.cancel();
    server.abort();
}
#[tokio::test]
async fn websocket_forwards_text_and_binary_and_disconnect_revokes_it() {
    let (runtime, server) = fixture().await;
    let base = runtime.info().api_base;
    Client::new()
        .post(format!("{base}/login"))
        .header("origin", "http://localhost:1420")
        .send()
        .await
        .unwrap();
    let mut request = format!("{}/socket", base.replacen("http:", "ws:", 1))
        .into_client_request()
        .unwrap();
    request
        .headers_mut()
        .insert("origin", "http://localhost:1420".parse().unwrap());
    let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    let expected_agent = format!(
        "Qterm Desktop/{} ({}; {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        WsMessage::Text(expected_agent.into())
    );
    for message in [
        WsMessage::Text("input".into()),
        WsMessage::Binary(vec![0, 255, 1].into()),
    ] {
        ws.send(message.clone()).await.unwrap();
        assert_eq!(ws.next().await.unwrap().unwrap(), message);
    }
    runtime.cancel.cancel();
    let closed = tokio::time::timeout(std::time::Duration::from_secs(2), ws.next())
        .await
        .unwrap();
    assert!(closed.is_none() || matches!(closed, Some(Ok(WsMessage::Close(_))) | Some(Err(_))));
    server.abort();
}
