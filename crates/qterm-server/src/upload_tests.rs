use crate::tests::{call, fixture};
use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
};
use futures_util::stream;
use serde_json::json;
use std::convert::Infallible;
use tower::ServiceExt;

#[tokio::test]
async fn multipart_upload_over_128_mib_reaches_disk_and_reports_both_transfer_legs() {
    let (dir, state, token) = fixture();
    let task = uuid::Uuid::new_v4().to_string();
    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs([
            ("sessionId", "local"),
            ("taskId", &task),
            ("path", dir.path().to_str().unwrap()),
            ("relativePath", "large.bin"),
        ])
        .finish();
    let chunk = Bytes::from(vec![37u8; 1024 * 1024]);
    let header = Bytes::from_static(
        b"--qterm\r\nContent-Disposition: form-data; name=\"file\"; filename=\"large.bin\"\r\n\r\n",
    );
    let footer = Bytes::from_static(b"\r\n--qterm--\r\n");
    let chunks = std::iter::once(header)
        .chain(std::iter::repeat_n(chunk, 129))
        .chain(std::iter::once(footer))
        .map(Ok::<_, Infallible>);
    let request = Request::post(format!("/api/v1/transfers/upload?{query}"))
        .header("Cookie", format!("qterm={token}"))
        .header("x-qterm-access", &token)
        .header("x-qterm-client", "test-client")
        .header("Origin", "http://localhost:1423")
        .header("Content-Type", "multipart/form-data; boundary=qterm")
        .body(Body::from_stream(stream::iter(chunks)))
        .unwrap();
    let response = crate::router::router(state.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let size = 129 * 1024 * 1024;
    assert_eq!(dir.path().join("large.bin").metadata().unwrap().len(), size);
    let (_, progress) = call(
        state,
        &token,
        "GET",
        &format!("/api/v1/transfers/{task}/progress"),
        json!(null),
    )
    .await;
    assert_eq!(progress["receivedBytes"], size);
    assert_eq!(progress["transferredBytes"], size);
}
