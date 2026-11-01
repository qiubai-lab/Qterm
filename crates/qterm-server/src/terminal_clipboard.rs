//! Browser files are staged on the selected terminal host; client paths are never trusted.
use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
    transfer_lifecycle::Operation,
    transfers::MAX_TRANSFER_BYTES,
};
use axum::{
    Extension, Json,
    extract::{Multipart, Query, State},
};
use qterm_core::{
    domain::terminal_staging::{TerminalStagingEvent, safe_staging_extension},
    ports::terminal_staging::{RemoteTerminalStagingStore, StagingSourceEntry},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex, atomic::Ordering},
    time::Duration,
};
use tokio::io::AsyncWriteExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    session_id: String,
    task_id: String,
}
struct RemoteTask {
    state: Arc<ServerState>,
    session: String,
    task: String,
}
impl Drop for RemoteTask {
    fn drop(&mut self) {
        let _ = self.state.sessions.cancel(&self.session, &self.task);
    }
}
pub async fn upload(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Query(input): Query<Request>,
    mut body: Multipart,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    let session = state
        .retained
        .lock()
        .unwrap()
        .get(&input.session_id)
        .cloned()
        .ok_or_else(ApiError::invalid)?;
    if !matches!(session.kind.as_str(), "local" | "terminal")
        || session.metadata()["status"] != "connected"
    {
        return Err(ApiError::invalid());
    }
    state
        .downloads
        .lock()
        .unwrap()
        .retain(|_, d| d.expires > std::time::Instant::now());
    let _permit = state.transfers.clone().try_acquire_owned().map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "transferLimit",
            "并行传输数量已达上限",
        )
    })?;
    let operation = Operation::start(&state, &owner.0, input.task_id)?;
    let directory = tempfile::Builder::new()
        .prefix("clipboard-")
        .tempdir_in(state.config.data.join("cache/transfers"))
        .map_err(|_| ApiError::storage())?;
    let mut entries = Vec::new();
    let mut total = 0u64;
    while let Some(mut field) = tokio::time::timeout(Duration::from_secs(30), body.next_field())
        .await
        .map_err(|_| ApiError::invalid())?
        .map_err(|_| ApiError::invalid())?
    {
        if entries.len() >= 128 {
            return Err(ApiError::invalid());
        }
        let name = field.file_name().unwrap_or("clipboard").to_owned();
        let extension = safe_staging_extension(std::path::Path::new(&name));
        let filename = format!(
            "file-{}{}",
            entries.len() + 1,
            extension
                .as_ref()
                .map(|s| format!(".{s}"))
                .unwrap_or_default()
        );
        let path = directory.path().join(filename);
        let mut file = tokio::fs::File::create(&path)
            .await
            .map_err(|_| ApiError::storage())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))
                .await
                .map_err(|_| ApiError::storage())?;
        }
        while let Some(bytes) = tokio::time::timeout(Duration::from_secs(30), field.chunk())
            .await
            .map_err(|_| ApiError::invalid())?
            .map_err(|_| ApiError::invalid())?
        {
            operation.check()?;
            total += bytes.len() as u64;
            if total > MAX_TRANSFER_BYTES {
                return Err(ApiError::invalid());
            }
            file.write_all(&bytes)
                .await
                .map_err(|_| ApiError::storage())?;
        }
        file.flush().await.map_err(|_| ApiError::storage())?;
        entries.push(StagingSourceEntry {
            path,
            display_name: name,
            extension,
            cleanup_after: false,
        });
    }
    operation.check()?;
    state.authorize(&owner.0, &input.session_id)?;
    if entries.is_empty() {
        return Err(ApiError::invalid());
    }
    let paths = if session.kind == "local" {
        let paths = entries
            .iter()
            .map(|e| local_path(&e.path))
            .collect::<Result<Vec<_>>>()?;
        operation.progress.store(total, Ordering::Relaxed);
        let _ = directory.keep(); // Files remain usable until server restart, like other runtime cache.
        paths
    } else {
        let (tx, mut rx) = tokio::sync::oneshot::channel();
        let tx = Mutex::new(Some(tx));
        let progress = operation.progress.clone();
        let events = Arc::new(move |event| {
            let outcome = match event {
                TerminalStagingEvent::Progress {
                    transferred_bytes, ..
                } => {
                    progress.store(transferred_bytes, Ordering::Relaxed);
                    None
                }
                TerminalStagingEvent::Completed { remote_paths } => Some(Ok(remote_paths
                    .into_iter()
                    .map(|path| format!("'{}'", path.replace('\'', "'\\''")))
                    .collect::<Vec<_>>())),
                TerminalStagingEvent::Failed | TerminalStagingEvent::Cancelled => {
                    Some(Err(ApiError::storage()))
                }
                _ => None,
            };
            if let Some(outcome) = outcome
                && let Some(tx) = tx.lock().unwrap().take()
            {
                let _ = tx.send(outcome);
            }
        });
        let task = state
            .sessions
            .start(&input.session_id, entries, events)
            .map_err(|_| ApiError::invalid())?;
        let _guard = RemoteTask {
            state: state.clone(),
            session: input.session_id.clone(),
            task,
        };
        let deadline = tokio::time::sleep(Duration::from_secs(600));
        tokio::pin!(deadline);
        let mut check = tokio::time::interval(Duration::from_millis(250));
        loop {
            tokio::select! {
                value = &mut rx => break value.map_err(|_|ApiError::storage())??,
                _ = check.tick() => { operation.check()?; state.authorize(&owner.0, &input.session_id)?; },
                _ = &mut deadline => return Err(ApiError::storage()),
            }
        }
    };
    operation.check()?;
    Ok(Json(json!({"remotePaths": paths})))
}
fn local_path(path: &std::path::Path) -> Result<String> {
    let path = std::path::absolute(path).map_err(|_| ApiError::storage())?;
    let value = path.to_str().ok_or_else(ApiError::invalid)?;
    #[cfg(windows)]
    {
        if value.contains(['"', '%', '!', '\r', '\n']) {
            return Err(ApiError::invalid());
        }
        Ok(format!("\"{value}\""))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("'{}'", value.replace('\'', "'\\''")))
    }
}
