use crate::tests::{call, fixture};
use axum::http::StatusCode;
use serde_json::{Value, json};

#[tokio::test]
async fn recovery_rotation_preserves_credentials_and_rejects_the_previous_recovery_file() {
    let (_dir, state, token) = fixture();
    let (_, prepared) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/recovery",
        Value::Null,
    )
    .await;
    let download = format!(
        "/api/v1/vault/recovery/{}",
        prepared["id"].as_str().unwrap()
    );
    let (status, old_file) = call(state.clone(), &token, "GET", &download, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert!(!old_file.is_null());
    assert_eq!(call(state.clone(), &token, "POST", "/api/v1/vault/initialize", json!({"recoveryId":prepared["id"],"masterPassword":"original-master-password","savedRecovery":true})).await.0, StatusCode::OK);
    let (_, credential) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/credentials",
        json!({"name":"preserved","password":"retained-secret"}),
    )
    .await;
    call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/lock",
        Value::Null,
    )
    .await;
    let (status, prepared) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/reset/prepare",
        old_file.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let reset = json!({"recoveryId":prepared["id"],"masterPassword":"recovered-master-password","savedRecovery":true});
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/reset",
            reset.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let download = format!(
        "/api/v1/vault/recovery/{}",
        prepared["id"].as_str().unwrap()
    );
    let (status, new_file) = call(state.clone(), &token, "GET", &download, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(old_file, new_file);
    assert_eq!(
        call(state.clone(), &token, "POST", "/api/v1/vault/reset", reset)
            .await
            .0,
        StatusCode::OK
    );
    let reveal = format!(
        "/api/v1/credentials/{}/password",
        credential["id"].as_str().unwrap()
    );
    assert_eq!(
        call(state.clone(), &token, "POST", &reveal, Value::Null)
            .await
            .1,
        "retained-secret"
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/reset/prepare",
            old_file
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/lock",
        Value::Null,
    )
    .await;
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"original-master-password"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            state,
            &token,
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"recovered-master-password"})
        )
        .await
        .0,
        StatusCode::OK
    );
}
