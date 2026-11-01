use crate::{
    auth::{Identity, random_token},
    error::{ApiError, Result},
    state::ServerState,
    transfer_lifecycle::Operation,
};
use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use qterm_core::{
    domain::transfer::TransferEvent,
    infrastructure::ssh::client::{SshSessionManager, TransferRequest},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::io::AsyncWriteExt;

pub const MAX_TRANSFER_BYTES: u64 = 128 * 1024 * 1024;
pub struct Download {
    pub owner: String,
    pub expires: Instant,
    file: tempfile::TempPath,
    filename: String,
    _permit: tokio::sync::OwnedSemaphorePermit,
}
struct ActiveTransfer {
    manager: Arc<SshSessionManager>,
    session: String,
    task: String,
}
impl Drop for ActiveTransfer {
    fn drop(&mut self) {
        let _ = self.manager.cancel_transfer(&self.session, &self.task);
    }
}
pub(crate) async fn transfer(
    state: &ServerState,
    owner: &str,
    session: &str,
    request: TransferRequest,
    operation: &Operation,
) -> Result<()> {
    state.authorize(owner, session)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    let progress = operation.progress.clone();
    let sink = Arc::new(move |event| {
        if let TransferEvent::Progress {
            transferred_bytes, ..
        } = &event
        {
            progress.store(*transferred_bytes, std::sync::atomic::Ordering::Relaxed);
        }
        let result = match event {
            TransferEvent::Completed => Some(true),
            TransferEvent::Cancelled | TransferEvent::Failed => Some(false),
            TransferEvent::Started { total_bytes }
            | TransferEvent::Progress { total_bytes, .. }
                if total_bytes > MAX_TRANSFER_BYTES =>
            {
                Some(false)
            }
            TransferEvent::Progress {
                transferred_bytes, ..
            } if transferred_bytes > MAX_TRANSFER_BYTES => Some(false),
            _ => None,
        };
        if let Some(result) = result
            && let Some(sender) = tx.lock().unwrap().take()
        {
            let _ = sender.send(result);
        }
    });
    let task = state.sessions.start_transfer(session, request, sink)?;
    let _active = ActiveTransfer {
        manager: state.sessions.clone(),
        session: session.into(),
        task,
    };
    let mut rx = Box::pin(rx);
    let deadline = tokio::time::sleep(Duration::from_secs(600));
    tokio::pin!(deadline);
    let mut check = tokio::time::interval(Duration::from_secs(2));
    loop {
        tokio::select! {
            value=&mut rx=>return if value==Ok(true){Ok(())}else{Err(ApiError::new(axum::http::StatusCode::BAD_REQUEST,"transferFailed","传输失败或文件超过 128 MiB 限制"))},
            _=&mut deadline=>return Err(ApiError::new(axum::http::StatusCode::REQUEST_TIMEOUT,"transferTimeout","传输超时")),
            _=check.tick()=>{state.authorize(owner,session)?;operation.check()?;},
        }
    }
}
pub(crate) fn temporary(state: &ServerState) -> Result<tempfile::TempPath> {
    tempfile::NamedTempFile::new_in(state.config.data.join("cache/transfers"))
        .map(|file| file.into_temp_path())
        .map_err(|_| ApiError::storage())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadQuery {
    session_id: String,
    path: String,
    task_id: String,
    #[serde(default)]
    relative_path: Option<String>,
    #[serde(default)]
    directory: bool,
}
pub async fn upload(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Query(input): Query<UploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<Value>> {
    crate::transfer_storage::authorize(&state, &owner.0, &input.session_id)?;
    state
        .downloads
        .lock()
        .unwrap()
        .retain(|_, d| d.expires > Instant::now());
    let _permit = state.transfers.clone().try_acquire_owned().map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "transferLimit",
            "并行传输数量已达上限",
        )
    })?;
    let operation = Operation::start(&state, &owner.0, input.task_id)?;
    let path = temporary(&state)?;
    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|_| ApiError::storage())?;
    let mut field = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::invalid())?
        .ok_or_else(ApiError::invalid)?;
    let mut bytes = 0u64;
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(30), field.chunk())
        .await
        .map_err(|_| ApiError::invalid())?
        .map_err(|_| ApiError::invalid())?
    {
        operation.check()?;
        bytes += chunk.len() as u64;
        if bytes > MAX_TRANSFER_BYTES {
            return Err(ApiError::new(
                axum::http::StatusCode::PAYLOAD_TOO_LARGE,
                "fileTooLarge",
                "单文件上限为 128 MiB",
            ));
        }
        crate::transfer_storage::authorize(&state, &owner.0, &input.session_id)?;
        file.write_all(&chunk)
            .await
            .map_err(|_| ApiError::storage())?;
    }
    file.flush().await.map_err(|_| ApiError::storage())?;
    drop(file);
    drop(field);
    if multipart
        .next_field()
        .await
        .map_err(|_| ApiError::invalid())?
        .is_some()
    {
        return Err(ApiError::invalid());
    }
    crate::transfer_storage::upload(
        &state,
        &owner.0,
        &input.session_id,
        &input.path,
        input.relative_path.as_deref(),
        input.directory,
        &path,
        &operation,
    )
    .await?;
    Ok(Json(json!({"completed":true,"bytes":bytes})))
}
pub async fn prepare_download(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<UploadQuery>,
) -> Result<Json<Value>> {
    crate::transfer_storage::authorize(&state, &owner.0, &input.session_id)?;
    state
        .downloads
        .lock()
        .unwrap()
        .retain(|_, d| d.expires > Instant::now());
    let _permit = state.transfers.clone().try_acquire_owned().map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "transferLimit",
            "并行传输数量已达上限",
        )
    })?;
    {
        let mut downloads = state.downloads.lock().unwrap();
        downloads.retain(|_, d| d.expires > Instant::now());
        if downloads.len() >= 4 {
            return Err(ApiError::invalid());
        }
    }
    let operation = Operation::start(&state, &owner.0, input.task_id)?;
    let (file, filename) = crate::transfer_storage::download(
        &state,
        &owner.0,
        &input.session_id,
        &input.path,
        input.directory,
        &operation,
    )
    .await?;
    crate::transfer_storage::authorize(&state, &owner.0, &input.session_id)?;
    operation.check()?;
    let id = random_token()?;
    state.downloads.lock().unwrap().insert(
        id.clone(),
        Download {
            owner: owner.0,
            expires: Instant::now() + Duration::from_secs(60),
            file,
            filename,
            _permit,
        },
    );
    Ok(Json(json!({"id":id})))
}
pub async fn download(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Response> {
    let download = {
        let mut downloads = state.downloads.lock().unwrap();
        let value = downloads.get(&id).ok_or_else(ApiError::invalid)?;
        if value.owner != owner.0 || value.expires < Instant::now() {
            return Err(ApiError::forbidden());
        }
        downloads.remove(&id).unwrap()
    };
    let file = tokio::fs::File::open(&download.file)
        .await
        .map_err(|_| ApiError::storage())?;
    let disposition = format!(
        "attachment; filename*=UTF-8''{}",
        url::form_urlencoded::byte_serialize(download.filename.as_bytes())
            .collect::<String>()
            .replace('+', "%20")
    );
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(file).map(move |chunk| {
        let _keep = (&download.file, &download._permit);
        chunk
    }));
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CONTENT_DISPOSITION, disposition.as_str()),
        ],
        body,
    )
        .into_response())
}
