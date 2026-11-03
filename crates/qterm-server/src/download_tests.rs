use crate::tests::{call, fixture};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn download_exposes_size_progress_stream_and_consumes_ticket_once() {
    let (dir, state, token) = fixture();
    let path = dir.path().join("download.bin");
    let bytes = vec![42u8; 180_000];
    tokio::fs::write(&path, &bytes).await.unwrap();
    let task = uuid::Uuid::new_v4().to_string();
    let (status, ticket) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/transfers/download",
        json!({"sessionId":"local","path":path,"taskId":task,"directory":false}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, progress) = call(
        state.clone(),
        &token,
        "GET",
        &format!("/api/v1/transfers/{task}/progress"),
        json!(null),
    )
    .await;
    assert_eq!(
        progress,
        json!({"transferredBytes":bytes.len(),"totalBytes":bytes.len()})
    );
    let url = format!("/api/v1/downloads/{}", ticket["id"].as_str().unwrap());
    let response = crate::router::router(state.clone())
        .oneshot(
            Request::builder()
                .uri(&url)
                .header("Cookie", format!("qterm={token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-length"], "180000");
    assert!(
        response.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .starts_with("attachment;")
    );
    assert_eq!(
        response.into_body().collect().await.unwrap().to_bytes(),
        bytes
    );
    assert_eq!(
        call(state, &token, "GET", &url, json!(null)).await.0,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn cancelled_preparation_never_issues_a_download_ticket() {
    let (dir, state, token) = fixture();
    let path = dir.path().join("download.bin");
    tokio::fs::write(&path, b"file").await.unwrap();
    let task = uuid::Uuid::new_v4().to_string();
    call(
        state.clone(),
        &token,
        "POST",
        &format!("/api/v1/transfers/{task}/cancel"),
        json!(null),
    )
    .await;
    let (status, _) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/transfers/download",
        json!({"sessionId":"local","path":path,"taskId":task,"directory":false}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(state.downloads.lock().unwrap().is_empty());
}
