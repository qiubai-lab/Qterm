use super::{RemoteRuntime, upload::DropUploads};
use axum::{
    Router,
    body::Body,
    http::HeaderMap,
    routing::{get, post},
};
use futures_util::StreamExt;
use std::fs::{self, File};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn large_drop_streams_multipart_once_and_keeps_native_tokens_off_the_upstream() {
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/api/v1/transfers/upload",
            post(|headers: HeaderMap, body: Body| async move {
                assert!(
                    headers["content-type"]
                        .to_str()
                        .unwrap()
                        .starts_with("multipart/form-data; boundary=")
                );
                assert_eq!(headers["x-qterm-client"], "client");
                assert!(!headers.contains_key("x-qterm-drop-source"));
                let mut length = 0u64;
                let mut stream = body.into_data_stream();
                while let Some(chunk) = stream.next().await {
                    length += chunk.unwrap().len() as u64;
                }
                length.to_string()
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async { axum::serve(listener, app).await.unwrap() });
    let runtime = RemoteRuntime::start(
        &endpoint,
        "http://localhost:1420".into(),
        CancellationToken::new(),
    )
    .await
    .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("large.bin");
    let size = 129 * 1024 * 1024;
    File::create(&source).unwrap().set_len(size).unwrap();
    let selection = runtime.uploads.prepare(vec![source]).unwrap();
    let token = selection.entries[0].token.as_ref().unwrap();
    assert_eq!(selection.entries[0].size, size);
    let request = || {
        reqwest::Client::new()
            .post(format!("{}/transfers/upload", runtime.info().api_base))
            .header("origin", "http://localhost:1420")
            .header("x-qterm-client", "client")
            .header("x-qterm-drop-source", token)
    };
    let response = request().send().await.unwrap();
    assert!(response.status().is_success());
    let bytes: u64 = response.text().await.unwrap().parse().unwrap();
    assert!((size + 1..size + 1024).contains(&bytes));
    assert_eq!(request().send().await.unwrap().status(), 400);
    runtime.cancel.cancel();
    server.abort();
}

#[tokio::test]
async fn changed_and_released_sources_cannot_be_read_and_empty_directories_survive() {
    let uploads = DropUploads::default();
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir_all(folder.join("empty")).unwrap();
    let path = folder.join("file");
    fs::write(&path, b"initial").unwrap();
    let selection = uploads.prepare(vec![folder]).unwrap();
    assert!(
        selection
            .entries
            .iter()
            .any(|e| e.path == "folder/empty" && e.token.is_none())
    );
    let token = selection
        .entries
        .iter()
        .find_map(|entry| entry.token.as_ref())
        .unwrap();
    fs::rename(&path, root.path().join("original")).unwrap();
    fs::write(&path, b"changed").unwrap();
    assert!(uploads.multipart(token).await.is_err());

    let selection = uploads.prepare(vec![path]).unwrap();
    let token = selection.entries[0].token.as_ref().unwrap();
    assert!(DropUploads::default().multipart(token).await.is_err());
    uploads.release(&selection.id);
    assert!(uploads.multipart(token).await.is_err());
}
