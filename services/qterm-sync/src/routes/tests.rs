use super::*;
use axum::{body::Body, http::Request};
use tower::ServiceExt;

#[tokio::test]
async fn api_rejects_missing_or_wrong_token_and_accepts_correct_one() {
    let dir = tempfile::tempdir().unwrap();
    let token = "a-secure-random-token-at-least-32-bytes";
    let app = router(
        Database::open(&dir.path().join("db")).unwrap(),
        Sha256::digest(token).into(),
    );
    for (header, expected) in [
        (None, 401),
        (Some("Bearer incorrect".to_string()), 401),
        (Some(format!("Bearer {token}")), 200),
    ] {
        let mut request = Request::builder().uri("/v1/catalog");
        if let Some(header) = header {
            request = request.header("authorization", header);
        }
        assert_eq!(
            app.clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap()
                .status()
                .as_u16(),
            expected
        );
    }
}

#[tokio::test]
async fn malformed_sensitive_and_stale_writes_do_not_mutate_the_catalog() {
    let dir = tempfile::tempdir().unwrap();
    let token = "another-random-test-token-at-least-32-bytes";
    let mut database = Database::open(&dir.path().join("db")).unwrap();
    let initial = database.snapshot().unwrap();
    let app = router(database, Sha256::digest(token).into());
    let valid = serde_json::json!({ "protocol":1, "serverId":initial.server_id, "baseRevision":0,
        "catalog": { "profiles": {}, "groups": { "g": { "name":"Group" } } } });
    let mut sensitive = valid.clone();
    sensitive["catalog"]["password"] = "forbidden".into();
    for (body, auth, expected) in [
        (valid.clone(), false, 401),
        (sensitive, true, 422),
        (valid.clone(), true, 200),
        (valid, true, 409),
    ] {
        let mut request = Request::builder()
            .method("PUT")
            .uri("/v1/catalog")
            .header("content-type", "application/json");
        if auth {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .clone()
            .oneshot(request.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), expected);
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v1/catalog")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), MAX_BYTES)
        .await
        .unwrap();
    let saved: Snapshot = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(saved.catalog.groups.len(), 1);
}
