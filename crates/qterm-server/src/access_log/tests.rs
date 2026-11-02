use super::*;
use crate::tests::{call, fixture};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn journal_survives_restart_filters_and_pages_without_duplicates() {
    let dir = tempfile::tempdir().unwrap();
    let log = AccessLog::new(dir.path().join("logs"));
    for index in 0..65 {
        log.record(
            Kind::Login,
            index % 2 == 0,
            "invalidPassword",
            Source::default(),
        );
    }
    let first = log.query(Query::default()).await.unwrap();
    assert_eq!(first.entries.len(), 50);
    let cursor = first.next_cursor.clone();
    log.record(Kind::Takeover, true, "admitted", Source::default());
    let second = log
        .query(Query {
            before: cursor,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(second.entries.len(), 15);
    assert!(
        second
            .entries
            .iter()
            .all(|event| !first.entries.iter().any(|old| old.id == event.id))
    );
    drop(log);
    let log = AccessLog::new(dir.path().join("logs"));
    let failed = log
        .query(Query {
            kind: Some(Kind::Login),
            success: Some(false),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(failed.entries.len(), 32);
    assert!(failed.recording_healthy);
    assert!(
        log.query(Query {
            before: Some("missing".into()),
            ..Default::default()
        })
        .await
        .is_err()
    );
}

#[tokio::test]
async fn unavailable_storage_is_visible_and_does_not_panic_or_block_authentication() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("logs");
    std::fs::write(&path, "not a directory").unwrap();
    let log = AccessLog::new(path);
    log.record(Kind::Login, false, "invalidPassword", Source::default());
    let page = log.query(Query::default()).await.unwrap();
    assert!(!page.recording_healthy);
    assert_eq!(page.dropped_events, 1);
}

#[tokio::test]
async fn truncated_record_is_reported_and_never_joins_new_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("logs");
    let log = AccessLog::new(path.clone());
    log.record(Kind::Login, true, "admitted", Source::default());
    log.query(Query::default()).await.unwrap();
    drop(log);
    let file = std::fs::read_dir(&path)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    use std::io::Write;
    std::fs::OpenOptions::new()
        .append(true)
        .open(file)
        .unwrap()
        .write_all(b"{incomplete")
        .unwrap();
    let log = AccessLog::new(path);
    log.record(Kind::Logout, true, "completed", Source::default());
    let page = log.query(Query::default()).await.unwrap();
    assert_eq!(page.entries.len(), 2);
    assert_eq!(page.dropped_events, 1);
    assert!(!page.recording_healthy);
}

#[tokio::test]
async fn http_events_exclude_secrets_and_queries_require_unlocked_current_owner() {
    let (_dir, state, token) = fixture();
    let (status, _) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/unlock",
        json!({"masterPassword":"not-a-real-master-secret"}),
    )
    .await;
    assert_ne!(status, StatusCode::OK);
    let (status, page) = call(
        state.clone(),
        &token,
        "GET",
        "/api/v1/access-log",
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["entries"][0]["kind"], "vaultUnlock");
    assert_eq!(page["entries"][0]["success"], false);
    let text = page.to_string();
    assert!(!text.contains("not-a-real-master-secret"));
    assert!(!text.contains(&token));
    assert!(page["entries"][0]["source"]["session"].as_str().is_some());
    assert_eq!(
        call(
            state.clone(),
            "invalid",
            "GET",
            "/api/v1/access-log",
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    state.auth.access.set_terminal_locked(&token, true).unwrap();
    assert_eq!(
        call(
            state.clone(),
            &token,
            "GET",
            "/api/v1/access-log",
            Value::Null
        )
        .await
        .0,
        StatusCode::LOCKED
    );
    state.auth.revoke();
    assert_eq!(
        call(state, &token, "GET", "/api/v1/access-log", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn request_metadata_uses_peer_ip_and_ignores_untrusted_forwarded_headers() {
    let (_dir, state, token) = fixture();
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/access/takeover")
        .header("origin", "http://localhost:1423")
        .header("content-type", "application/json")
        .header("cookie", format!("qterm={token}"))
        .header("x-qterm-access", &token)
        .header("x-qterm-client", "test-client")
        .header("user-agent", "Test browser")
        .header("x-forwarded-for", "1.2.3.4")
        .extension(ConnectInfo(
            "127.0.0.1:1234".parse::<std::net::SocketAddr>().unwrap(),
        ))
        .body(Body::from(
            r#"{"ticket":"secret-ticket","clientId":"new-page"}"#,
        ))
        .unwrap();
    let response = crate::router::router(state.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    // Consume the response just as a client would, including any permit wrapper.
    response.into_body().collect().await.unwrap();
    let page = state.access_log.query(Query::default()).await.unwrap();
    assert_eq!(page.entries[0].source.ip.as_deref(), Some("127.0.0.1"));
    assert_eq!(
        page.entries[0].source.browser.as_deref(),
        Some("Test browser")
    );
    assert!(
        !serde_json::to_string(&page)
            .unwrap()
            .contains("secret-ticket")
    );
}
