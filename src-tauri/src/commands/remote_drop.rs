use super::{remote_runtime::RemoteRuntimeState, transfer::TransferState};
use crate::infrastructure::remote_runtime::upload::DropSelection;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn remote_runtime_drop(
    state: State<'_, TransferState>,
    runtimes: State<'_, RemoteRuntimeState>,
    runtime_id: String,
    paths: Vec<PathBuf>,
) -> Result<DropSelection, String> {
    let runtime = runtimes.runtime(&runtime_id).await?;
    if !state.take_drop_paths(&paths) {
        return Err("文件拖放授权已失效，请重新拖入".into());
    }
    tokio::task::spawn_blocking(move || runtime.uploads.prepare(paths))
        .await
        .map_err(|_| "无法扫描拖放文件".to_owned())?
}

#[tauri::command]
pub async fn remote_drop_release(
    runtimes: State<'_, RemoteRuntimeState>,
    runtime_id: String,
    id: String,
) -> Result<(), String> {
    if let Ok(runtime) = runtimes.runtime(&runtime_id).await {
        runtime.uploads.release(&id);
    }
    Ok(())
}
