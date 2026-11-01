use crate::{config::Config, router::router, state::ServerState};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

pub(super) fn fixture() -> (tempfile::TempDir, Arc<ServerState>, String) {
    let dir = tempfile::tempdir().unwrap();
    let state = ServerState::new(Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        origin: "http://localhost:1423".into(),
        data: dir.path().join("data"),
        assets: dir.path().join("assets"),
        password_hash: String::new(),
        secure_cookie: false,
    })
    .unwrap();
    let token = state.auth.issue().unwrap();
    (dir, state, token)
}
pub(super) async fn call(
    state: Arc<ServerState>,
    token: &str,
    method: &str,
    path: &str,
    body: Value,
) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header("Cookie", format!("qterm={token}"))
        .header("x-qterm-access", token)
        .header("x-qterm-client", "test-client")
        .header("Origin", "http://localhost:1423")
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let response = router(state).oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
#[tokio::test]
async fn unauthenticated_requests_and_cross_origin_mutations_are_rejected() {
    let (_dir, state, token) = fixture();
    assert_eq!(
        call(
            state.clone(),
            "wrong",
            "GET",
            "/api/v1/profiles",
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/profiles")
        .header("Cookie", format!("qterm={token}"))
        .header("x-qterm-access", token)
        .header("x-qterm-client", "test-client")
        .header("Origin", "https://attacker.test")
        .header("Content-Type", "application/json")
        .body(Body::from("{}"))
        .unwrap();
    assert_eq!(
        router(state).oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}
#[tokio::test]
async fn profiles_persist_and_never_contain_supplied_secrets() {
    let (dir, state, token) = fixture();
    let profile = json!({"name":"Test","host":"127.0.0.1","port":22,"username":"test","authPreference":"manual","credentialId":null,"groupId":null,"jumpProfileIds":[]});
    let (status, value) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/profiles",
        profile.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(value["id"].is_string());
    let mut bad = profile;
    bad["password"] = json!("must-never-persist");
    assert_eq!(
        call(state.clone(), &token, "POST", "/api/v1/profiles", bad)
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let bytes = std::fs::read_to_string(dir.path().join("data/data/connections.json")).unwrap();
    assert!(!bytes.contains("must-never-persist"));
    assert_eq!(
        call(state, &token, "GET", "/api/v1/profiles", Value::Null)
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[tokio::test]
async fn file_requests_require_owned_sessions_and_logout_revokes_access() {
    let (_dir, state, token) = fixture();
    state
        .owners
        .lock()
        .unwrap()
        .insert("other-session".into(), "other-owner".into());
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/files/list",
            json!({"sessionId":"other-session","path":"/"})
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(state.clone(), &token, "POST", "/api/v1/logout", Value::Null)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(state, &token, "GET", "/api/v1/profiles", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
#[test]
fn data_root_is_exclusive() {
    let (_dir, state, _) = fixture();
    let config = Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        origin: state.config.origin.clone(),
        data: state.config.data.clone(),
        assets: state.config.assets.clone(),
        password_hash: String::new(),
        secure_cookie: false,
    };
    assert!(ServerState::new(config).is_err());
}

#[tokio::test]
async fn retired_logout_cannot_revoke_a_new_login() {
    let (_dir, state, old) = fixture();
    let current = state.auth.issue().unwrap();
    assert_eq!(
        call(state.clone(), &old, "POST", "/api/v1/logout", Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert!(state.auth.valid(&current));
}

#[tokio::test]
async fn login_checks_password_and_sets_an_http_only_cookie() {
    use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
    let dir = tempfile::tempdir().unwrap();
    let salt = SaltString::encode_b64(b"qterm-test-salt!!").unwrap();
    let hash = Argon2::default()
        .hash_password(b"test-only-long-password", &salt)
        .unwrap()
        .to_string();
    let state = ServerState::new(Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        origin: "http://localhost:1423".into(),
        data: dir.path().join("data"),
        assets: dir.path().join("assets"),
        password_hash: hash,
        secure_cookie: false,
    })
    .unwrap();
    assert_eq!(
        call(
            state.clone(),
            "",
            "POST",
            "/api/v1/login",
            json!({"password":"wrong","clientId":"test-client"})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/login")
        .header("Origin", "http://localhost:1423")
        .header("Content-Type", "application/json")
        .body(Body::from(
            r#"{"password":"test-only-long-password","clientId":"test-client"}"#,
        ))
        .unwrap();
    let response = router(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response.headers()["set-cookie"].to_str().unwrap();
    assert!(cookie.contains("HttpOnly"));
    assert!(cookie.contains("SameSite=Strict"));
    assert!(!cookie.contains("test-only-long-password"));
}

#[tokio::test]
async fn an_already_admitted_logout_rechecks_identity_after_waiting_for_the_vault() {
    let (_dir, state, old) = fixture();
    let gate = state.vault_gate.lock().await;
    let waiting = state.clone();
    let logout = tokio::spawn(async move {
        crate::auth::logout(
            axum::extract::State(waiting),
            axum::Extension(crate::auth::Identity(old)),
        )
        .await
    });
    tokio::task::yield_now().await;
    let current = state.auth.issue().unwrap();
    drop(gate);
    assert_eq!(
        logout.await.unwrap().unwrap_err().status,
        StatusCode::UNAUTHORIZED
    );
    assert!(state.auth.valid(&current));
}
