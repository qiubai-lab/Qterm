use crate::tests::{call, fixture};
use axum::http::StatusCode;
use serde_json::{Value, json};

#[tokio::test]
async fn settings_are_validated_and_survive_reopening_the_repository() {
    let (_dir, state, token) = fixture();
    for (path, input) in [
        ("appearance", json!({"theme":"cyberpunk"})),
        (
            "security",
            json!({"credentialAutoLockAfterSeconds":300,"terminalAutoLockAfterSeconds":600}),
        ),
        (
            "terminal",
            json!({"historyFreeBashEnabled":false,"remoteShellIntegrationEnabled":false}),
        ),
    ] {
        assert_eq!(
            call(
                state.clone(),
                &token,
                "PUT",
                &format!("/api/v1/settings/{path}"),
                input
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    assert_eq!(
        call(
            state.clone(),
            &token,
            "PUT",
            "/api/v1/settings/appearance",
            json!({"theme":"invalid"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, snapshot) = call(
        state.clone(),
        &token,
        "GET",
        "/api/v1/settings",
        Value::Null,
    )
    .await;
    assert_eq!(snapshot["appearance"]["theme"], "cyberpunk");
    assert_eq!(snapshot["security"]["credentialAutoLockAfterSeconds"], 300);
    let reloaded = crate::settings::ServerSettings::new(&state.config.data);
    assert_eq!(
        reloaded.security().terminal_auto_lock_after_seconds,
        Some(600)
    );
    assert!(!reloaded.terminal().remote_shell_integration_enabled);
    assert!(!reloaded.terminal().history_free_bash_enabled);
}

#[tokio::test]
async fn local_files_require_login_and_preserve_concurrent_edits() {
    let (dir, state, token) = fixture();
    let file = dir.path().join("notes.txt");
    std::fs::write(&file, "before").unwrap();
    let input = json!({"path":file});
    assert_eq!(
        call(
            state.clone(),
            "wrong",
            "POST",
            "/api/v1/local/files/read",
            input.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, document) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/local/files/read",
        input.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(document["content"], "before");
    std::fs::write(&file, "concurrent edit").unwrap();
    let write =
        json!({"path":file,"content":"replacement","expectedRevision":document["revision"]});
    let (status, error) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/local/files/write",
        write,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error["code"], "fileConflict");
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "concurrent edit");
    let (_, fresh) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/local/files/read",
        input,
    )
    .await;
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/local/files/write",
            json!({"path":file,"content":"saved","expectedRevision":fresh["revision"]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "saved");
    let (status, listing) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/local/files/list",
        json!({"path":dir.path()}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["name"] == "notes.txt")
    );
    assert_eq!(
        call(
            state,
            &token,
            "POST",
            "/api/v1/local/files/read",
            json!({"path":"relative"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn shared_credential_workflow_requires_recovery_and_invalidates_drafts_when_locked() {
    let (_dir, state, token) = fixture();
    let (_, recovery) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/recovery",
        Value::Null,
    )
    .await;
    let initialize = json!({"recoveryId":recovery["id"],"masterPassword":"fixture-master-password","savedRecovery":true});
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/initialize",
            initialize.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let path = format!(
        "/api/v1/vault/recovery/{}",
        recovery["id"].as_str().unwrap()
    );
    assert_eq!(
        call(state.clone(), &token, "GET", &path, Value::Null)
            .await
            .0,
        StatusCode::OK
    );
    let mut unconfirmed = initialize.clone();
    unconfirmed["savedRecovery"] = json!(false);
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/initialize",
            unconfirmed
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/initialize",
            initialize
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, draft) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/credentials/drafts/generate",
        json!({"algorithm":"ed25519","comment":"web fixture"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!draft.to_string().contains("PRIVATE KEY"));
    let path = format!(
        "/api/v1/credentials/drafts/{}",
        draft["id"].as_str().unwrap()
    );
    let (status, key) = call(
        state.clone(),
        &token,
        "POST",
        &path,
        json!({"name":"generated"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(key["kind"], "privateKey");
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            &path,
            json!({"name":"duplicate"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, password) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/credentials",
        json!({"name":"password","password":"credential-secret"}),
    )
    .await;
    let reveal = format!(
        "/api/v1/credentials/{}/password",
        password["id"].as_str().unwrap()
    );
    assert_eq!(
        call(state.clone(), &token, "POST", &reveal, Value::Null)
            .await
            .1,
        "credential-secret"
    );
    let (_, draft) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/credentials/drafts/generate",
        json!({"algorithm":"ed25519"}),
    )
    .await;
    assert_eq!(call(state.clone(), &token, "PUT", "/api/v1/vault/password", json!({"oldPassword":"fixture-master-password","newPassword":"replacement-master-password"})).await.0, StatusCode::OK);
    call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/vault/lock",
        Value::Null,
    )
    .await;
    assert_ne!(
        call(state.clone(), &token, "POST", &reveal, Value::Null)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            "/api/v1/vault/unlock",
            json!({"masterPassword":"replacement-master-password"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let path = format!(
        "/api/v1/credentials/drafts/{}",
        draft["id"].as_str().unwrap()
    );
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            &path,
            json!({"name":"expired"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(state, &token, "POST", &reveal, Value::Null).await.1,
        "credential-secret"
    );
}
