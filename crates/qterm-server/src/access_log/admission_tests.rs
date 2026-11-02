use super::{model::Query, *};
use crate::{config::Config, router::router, state::ServerState, tests::call};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn login_failures_pending_admission_takeover_and_logout_have_distinct_correlated_events() {
    let dir = tempfile::tempdir().unwrap();
    let state = ServerState::new(Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        origin: "http://localhost:1423".into(),
        data: dir.path().join("data"),
        assets: dir.path().join("assets"),
        password_hash: crate::login_password::hash("test-access-password").unwrap(),
        secure_cookie: false,
        trusted_proxies: vec!["127.0.0.1".parse().unwrap()],
    })
    .unwrap();
    assert_eq!(
        call(
            state.clone(),
            "",
            "POST",
            "/api/v1/login",
            json!({"password":"wrong-access-secret","clientId":"test-client"})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (_, admitted) = call(
        state.clone(),
        "",
        "POST",
        "/api/v1/login",
        json!({"password":"test-access-password","clientId":"test-client"}),
    )
    .await;
    assert_eq!(admitted["authenticated"], true);
    let (_, pending) = call(
        state.clone(),
        "",
        "POST",
        "/api/v1/login",
        json!({"password":"test-access-password","clientId":"other-client"}),
    )
    .await;
    assert_eq!(pending["authenticated"], false);
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/access/takeover")
        .header("origin", "http://localhost:1423")
        .header("content-type", "application/json")
        .header("x-forwarded-for", "198.51.100.1, 192.0.2.1, 127.0.0.1")
        .extension(ConnectInfo(
            "127.0.0.1:1234".parse::<std::net::SocketAddr>().unwrap(),
        ))
        .body(Body::from(
            json!({"ticket":pending["takeoverTicket"],"clientId":"other-client"}).to_string(),
        ))
        .unwrap();
    let response = router(state.clone()).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let body: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/logout")
        .header("origin", "http://localhost:1423")
        .header("cookie", &cookie)
        .header("x-qterm-access", body["accessKey"].as_str().unwrap())
        .header("x-qterm-client", "other-client")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        router(state.clone())
            .oneshot(request)
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    let page = state.access_log.query(Query::default()).await.unwrap();
    assert_eq!(page.entries.len(), 5);
    assert_eq!(page.entries[4].reason, "invalidPassword");
    assert_eq!(page.entries[3].reason, "admitted");
    assert_eq!(page.entries[2].reason, "confirmationRequired");
    assert_eq!(page.entries[1].kind, Kind::Takeover);
    assert_eq!(page.entries[1].source.ip.as_deref(), Some("192.0.2.1"));
    assert_eq!(page.entries[0].kind, Kind::Logout);
    assert_eq!(
        page.entries[0].source.session,
        page.entries[1].source.session
    );
    assert_ne!(
        page.entries[1].source.session,
        page.entries[3].source.session
    );
    let text = serde_json::to_string(&page).unwrap();
    for secret in [
        "wrong-access-secret",
        "test-access-password",
        admitted["accessKey"].as_str().unwrap(),
        body["accessKey"].as_str().unwrap(),
        pending["takeoverTicket"].as_str().unwrap(),
    ] {
        assert!(!text.contains(secret));
    }
}

#[tokio::test]
async fn vault_password_failures_success_and_real_timeout_are_recorded() {
    use qterm_core::{
        application::credential_lifecycle::LockReason,
        domain::{auth::SecretText, settings::SecuritySettings},
    };
    let (_dir, state, token) = crate::tests::fixture();
    let recovery = state.vault.prepare_initial_recovery().unwrap();
    let schedule = state
        .vault
        .initialize(
            SecretText::new("test-master-password".into()),
            recovery,
            SecuritySettings::new(Some(3600), Some(900)).unwrap(),
        )
        .unwrap()
        .unwrap();
    assert!(!state.vault.lock_if_generation(schedule.generation + 1));
    assert!(state.vault.lock_if_generation(schedule.generation));
    assert!(!state.vault.lock_if_generation(schedule.generation));
    let failed = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/unlock",
        json!({"masterPassword":"wrong-master-secret"}),
    )
    .await;
    assert_ne!(failed.0, StatusCode::OK);
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"test-master-password"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let page = state.access_log.query(Query::default()).await.unwrap();
    assert_eq!(page.entries.len(), 3);
    assert_eq!(page.entries[0].kind, Kind::VaultUnlock);
    assert!(page.entries[0].success);
    assert!(!page.entries[1].success);
    assert_eq!(page.entries[1].reason, "verificationFailed");
    assert_eq!(page.entries[2].reason, "timeout");
    assert!(page.entries[2].source.session.is_none());
    assert_eq!(
        page.entries[0].source.session,
        page.entries[1].source.session
    );
    let text = serde_json::to_string(&page).unwrap();
    assert!(!text.contains("wrong-master-secret") && !text.contains("test-master-password"));
    state.vault.lock(LockReason::Manual);
}
