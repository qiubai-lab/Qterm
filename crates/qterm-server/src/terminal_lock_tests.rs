use crate::{
    access::Proof,
    tests::{call, fixture},
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use qterm_core::domain::auth::SecretText;
use serde_json::{Value, json};
use tower::ServiceExt;

fn initialize(state: &crate::state::ServerState) {
    let recovery = state.vault.prepare_initial_recovery().unwrap();
    state
        .vault
        .initialize(
            SecretText::new("terminal-master-password".into()),
            recovery,
            state.settings.security(),
        )
        .unwrap();
}

#[tokio::test]
async fn terminal_lock_survives_refresh_and_rejects_old_document_requests() {
    let (_dir, state, token) = fixture();
    initialize(&state);
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/lock",
            Value::Null
        )
        .await,
        (StatusCode::OK, json!({"locked":true}))
    );
    assert!(!state.vault.status().unwrap().unlocked);
    let transport = state.auth.access.attach(&token).unwrap();
    state.auth.access.detach(&token, &transport);
    let (status, resumed) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/access/resume",
        json!({"accessKey":token,"clientId":"refreshed-page"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(resumed["authenticated"], true);
    let request = Request::builder()
        .uri("/api/v1/terminal-lock")
        .header("Cookie", format!("qterm={token}"))
        .header("x-qterm-access", &token)
        .header("x-qterm-client", "refreshed-page")
        .body(Body::empty())
        .unwrap();
    let response = crate::router::router(state.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        serde_json::from_slice::<Value>(&bytes).unwrap(),
        json!({"locked":true})
    );
    for path in ["/api/v1/terminal-lock/lock", "/api/v1/terminal-lock/unlock"] {
        assert_eq!(
            call(
                state.clone(),
                &token,
                "POST",
                path,
                json!({"masterPassword":"terminal-master-password"})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
}

#[tokio::test]
async fn only_verified_terminal_unlock_clears_the_lock() {
    let (_dir, state, token) = fixture();
    initialize(&state);
    // Locking only the vault must not lock the terminal.
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/lock",
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "GET",
            "/api/v1/terminal-lock",
            Value::Null
        )
        .await
        .1,
        json!({"locked":false})
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/lock",
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/unlock",
            json!({"masterPassword":"incorrect-password"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(state.auth.access.terminal_locked(&token).unwrap());
    assert!(!state.vault.status().unwrap().unlocked);
    // Vault-only unlock is not admitted while the entire workbench is locked.
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"terminal-master-password"})
        )
        .await
        .0,
        StatusCode::LOCKED
    );
    assert!(state.auth.access.terminal_locked(&token).unwrap());
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/unlock",
            json!({"masterPassword":"incorrect-password"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(state.auth.access.terminal_locked(&token).unwrap());
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/unlock",
            json!({"masterPassword":"terminal-master-password"})
        )
        .await,
        (StatusCode::OK, json!({"locked":false}))
    );
    assert!(state.vault.status().unwrap().unlocked);
}

#[tokio::test]
async fn terminal_lock_requires_an_initialized_vault_and_authenticated_owner() {
    let (_dir, state, token) = fixture();
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/terminal-lock/lock",
            Value::Null
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(!state.auth.access.terminal_locked(&token).unwrap());
    assert_eq!(
        call(
            state.clone(),
            "invalid",
            "GET",
            "/api/v1/terminal-lock",
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn takeover_starts_a_new_lock_and_logout_ends_its_lifetime() {
    let (_dir, state, token) = fixture();
    initialize(&state);
    call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/terminal-lock/lock",
        Value::Null,
    )
    .await;
    let pending = state.auth.access.login("takeover-page").unwrap();
    let crate::access::Admission::Occupied { ticket } = pending else {
        panic!("expected occupied")
    };
    let admission = state
        .auth
        .access
        .takeover(&ticket, "takeover-page", true)
        .unwrap();
    let crate::access::Admission::Granted {
        ref cookie,
        ref key,
    } = admission
    else {
        panic!("expected admission")
    };
    let owner = state
        .auth
        .access
        .authorize(
            cookie,
            &Proof {
                access_key: key.clone(),
                client_id: "takeover-page".into(),
            },
        )
        .unwrap();
    crate::access_transport::admitted(&state, admission, true).unwrap();
    assert!(state.auth.access.terminal_locked(&owner).unwrap());
    assert!(
        state
            .auth
            .access
            .set_terminal_locked(&token, false)
            .is_err()
    );
    assert!(!state.vault.status().unwrap().unlocked);
    // A new login (including after server restart) starts with no terminal lock.
    state.auth.revoke();
    let next = state.auth.issue().unwrap();
    state.auth.access.set_terminal_locked(&next, true).unwrap();
    assert_eq!(
        call(state.clone(), &next, "POST", "/api/v1/logout", Value::Null)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert!(state.auth.access.terminal_locked(&next).is_err());
    let next = state.auth.issue().unwrap();
    assert!(!state.auth.access.terminal_locked(&next).unwrap());
}
