use super::*;
use crate::tests::{call, fixture};
use axum::{body::Body, http::Request as HttpRequest};
use http_body_util::BodyExt;
use qterm_core::domain::auth::SecretText;
use serde_json::json;
use tower::ServiceExt;

#[test]
fn rolling_window_expires_individual_attempts_without_extending_on_rejection() {
    let budget = Budget::default();
    let start = Instant::now();
    for second in [0, 10, 20, 30, 40] {
        assert!(budget.admit(start + Duration::from_secs(second)));
    }
    for second in [41, 59] {
        assert!(!budget.admit(start + Duration::from_secs(second)));
    }
    assert!(budget.admit(start + WINDOW));
    assert!(!budget.admit(start + WINDOW));
    assert!(budget.admit(start + Duration::from_secs(70)));
}

#[test]
fn concurrent_requests_cannot_exceed_five_admissions() {
    let budget = Arc::new(Budget::default());
    let handles: Vec<_> = (0..32)
        .map(|_| {
            let budget = budget.clone();
            std::thread::spawn(move || budget.admit(Instant::now()))
        })
        .collect();
    assert_eq!(
        handles
            .into_iter()
            .filter_map(|h| h.join().unwrap().then_some(()))
            .count(),
        5
    );
}

#[tokio::test]
async fn login_failure_and_throttled_correct_password_have_identical_public_responses() {
    let (_dir, mut state, _) = fixture();
    Arc::get_mut(&mut state).unwrap().config.password_hash =
        crate::login_password::hash("correct-login-password").unwrap();
    let request = |password: &str| {
        HttpRequest::builder()
            .method("POST")
            .uri("/api/v1/login")
            .header("Origin", "http://localhost:1423")
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!({"password":password,"clientId":"page"}).to_string(),
            ))
            .unwrap()
    };
    let started = Instant::now();
    let wrong = crate::router::router(state.clone())
        .oneshot(request("wrong"))
        .await
        .unwrap();
    assert!(started.elapsed() >= FAILURE_FLOOR);
    assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
    let wrong_headers = wrong.headers().clone();
    let wrong_body = wrong.into_body().collect().await.unwrap().to_bytes();
    for _ in 0..4 {
        assert!(state.auth.failures.budgets[0].admit(Instant::now()));
    }
    let started = Instant::now();
    let limited = crate::router::router(state.clone())
        .oneshot(request("correct-login-password"))
        .await
        .unwrap();
    assert!(started.elapsed() >= FAILURE_FLOOR);
    assert_eq!(limited.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(limited.headers(), &wrong_headers);
    assert_eq!(
        limited.extensions().get::<ResponseErrorCode>().unwrap().0,
        "rateLimited"
    );
    assert_eq!(
        limited.into_body().collect().await.unwrap().to_bytes(),
        wrong_body
    );
    // Expiry restores admission; a successful request still consumes its window slot.
    state.auth.failures.budgets[0]
        .0
        .lock()
        .unwrap()
        .iter_mut()
        .for_each(|time| *time = Instant::now() - WINDOW);
    let accepted = crate::router::router(state.clone())
        .oneshot(request("correct-login-password"))
        .await
        .unwrap();
    assert!(accepted.status().is_success());
    assert_eq!(state.auth.failures.budgets[0].0.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn master_budget_is_shared_across_routes_and_survives_owner_rotation() {
    let (_dir, state, token) = fixture();
    let recovery = state.vault.prepare_initial_recovery().unwrap();
    state
        .vault
        .initialize(
            SecretText::new("correct-master-password".into()),
            recovery,
            state.settings.security(),
        )
        .unwrap();
    let (_, expected) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/unlock",
        json!({"masterPassword":"wrong"}),
    )
    .await;
    for _ in 0..4 {
        assert!(state.auth.failures.budgets[1].admit(Instant::now()));
    }
    let token = state.auth.issue().unwrap();
    for (method, path, input) in [
        (
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"correct-master-password"}),
        ),
        (
            "POST",
            "/api/v1/terminal-lock/unlock",
            json!({"masterPassword":"correct-master-password"}),
        ),
        (
            "PUT",
            "/api/v1/vault/password",
            json!({"oldPassword":"correct-master-password","newPassword":"replacement-password"}),
        ),
    ] {
        let (status, body) = call(state.clone(), &token, method, path, input).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, expected);
    }
    assert!(state.vault_gate.try_lock().is_ok());
    assert!(state.auth.failures.budgets[0].admit(Instant::now()));
    assert!(state.auth.failures.budgets[2].admit(Instant::now()));
}

#[tokio::test]
async fn rejected_key_verifications_do_not_run_handlers_or_consume_drafts() {
    let (_dir, state, token) = fixture();
    for scope in [Scope::Recovery, Scope::PrivateKey] {
        for _ in 0..5 {
            assert!(state.auth.failures.budgets[scope as usize].admit(Instant::now()));
        }
    }
    // Invalid bodies would fail extraction/validation if the handlers were reached.
    for (path, scope) in [
        ("/api/v1/vault/reset/prepare", Scope::Recovery),
        ("/api/v1/credentials/drafts/new-draft", Scope::PrivateKey),
    ] {
        let (status, body) = call(state.clone(), &token, "POST", path, json!({})).await;
        assert_eq!(status, scope.error().status);
        assert_eq!(body, serde_json::to_value(scope.error()).unwrap());
    }
}

#[tokio::test]
async fn invalid_origin_and_unauthorized_requests_do_not_consume_budget() {
    let (_dir, state, _) = fixture();
    for _ in 0..6 {
        let response = crate::router::router(state.clone())
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/api/v1/vault/unlock")
                    .header("Origin", "http://localhost:1423")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let response = crate::router::router(state.clone())
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/api/v1/login")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    for scope in [Scope::Login, Scope::Master] {
        for _ in 0..5 {
            assert!(state.auth.failures.budgets[scope as usize].admit(Instant::now()));
        }
    }
}

#[tokio::test]
async fn resource_saturation_is_independent_of_attempt_history() {
    let (_dir, state, token) = fixture();
    let permits = state.auth.failures.pending.acquire_many(64).await.unwrap();
    let (status, body) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/login",
        json!({"password":"wrong","clientId":"page"}),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body["code"], "busy");
    assert!(state.auth.failures.budgets[0].0.lock().unwrap().is_empty());
    drop(permits);
}

#[tokio::test]
async fn response_padding_does_not_hold_the_vault_gate() {
    use axum::{Router, middleware, routing::post};
    let (_dir, state, _) = fixture();
    let finished = Arc::new(tokio::sync::Notify::new());
    let handler_state = state.clone();
    let handler_finished = finished.clone();
    let app = Router::new()
        .route(
            "/vault/unlock",
            post(move || async move {
                let _gate = handler_state.vault_gate.lock().await;
                handler_finished.notify_one();
                Scope::Master.error()
            }),
        )
        .layer(middleware::from_fn_with_state(state.clone(), serve));
    let task = tokio::spawn(
        app.oneshot(
            HttpRequest::builder()
                .method("POST")
                .uri("/vault/unlock")
                .header("Origin", "http://localhost:1423")
                .body(Body::empty())
                .unwrap(),
        ),
    );
    finished.notified().await;
    assert!(!task.is_finished());
    assert!(state.vault_gate.try_lock().is_ok());
    assert_eq!(
        task.await.unwrap().unwrap().status(),
        StatusCode::BAD_REQUEST
    );
}
