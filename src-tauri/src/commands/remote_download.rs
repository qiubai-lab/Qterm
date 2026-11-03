//! Native save selection and bounded stream sink IPC for remote downloads.
use super::{native_dialog, remote_runtime::RemoteRuntimeState};
use crate::infrastructure::remote_runtime::RemoteRuntime;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

async fn runtime(state: &RemoteRuntimeState) -> Result<Arc<RemoteRuntime>, String> {
    state
        .0
        .lock()
        .await
        .as_ref()
        .filter(|r| !r.cancel.is_cancelled())
        .cloned()
        .ok_or("远程连接已断开".into())
}
#[tauri::command]
pub async fn remote_download_select(
    app: AppHandle,
    state: State<'_, RemoteRuntimeState>,
    name: String,
) -> Result<Option<String>, String> {
    let runtime = runtime(&state).await?;
    let name = name.rsplit(['/', '\\']).next().unwrap_or("download");
    let Some(file) = native_dialog::save_file(
        app.dialog()
            .file()
            .set_title("保存下载文件")
            .set_file_name(name),
    )
    .await
    else {
        return Ok(None);
    };
    if runtime.cancel.is_cancelled() {
        return Err("远程连接已断开".into());
    }
    runtime
        .downloads
        .select(file.into_path().map_err(|_| "无效的保存位置")?)
        .await
        .map(Some)
}
#[tauri::command]
pub async fn remote_download_write(
    state: State<'_, RemoteRuntimeState>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-download-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("无效的下载任务")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("无效的下载数据".into());
    };
    runtime(&state).await?.downloads.write(id, bytes).await
}
#[tauri::command]
pub async fn remote_download_finish(
    state: State<'_, RemoteRuntimeState>,
    id: String,
) -> Result<(), String> {
    runtime(&state).await?.downloads.finish(&id).await
}
#[tauri::command]
pub async fn remote_download_cancel(
    state: State<'_, RemoteRuntimeState>,
    id: String,
) -> Result<(), String> {
    if let Ok(runtime) = runtime(&state).await {
        runtime.downloads.cancel(&id).await;
    }
    Ok(())
}
