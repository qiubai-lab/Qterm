//! Desktop connection bootstrap and native save boundary; protocol forwarding is infrastructure-owned.
use crate::infrastructure::remote_runtime::ConnectionInfo;
pub use crate::infrastructure::remote_runtime::RemoteRuntimeRegistry as RemoteRuntimeState;
use base64::{Engine, engine::general_purpose::STANDARD};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn remote_runtime_connect(
    webview: tauri::Webview,
    state: State<'_, RemoteRuntimeState>,
    endpoint: String,
    runtime_id: String,
) -> Result<ConnectionInfo, String> {
    let url = webview.url().map_err(|_| "无法读取客户端地址")?;
    let origin = if url.scheme() == "tauri" {
        "tauri://localhost".into()
    } else {
        url.origin().ascii_serialization()
    };
    state.connect(&runtime_id, &endpoint, origin).await
}

#[tauri::command]
pub async fn remote_runtime_disconnect(
    state: State<'_, RemoteRuntimeState>,
    runtime_id: String,
) -> Result<(), String> {
    state.disconnect(&runtime_id).await;
    Ok(())
}

#[tauri::command]
pub async fn remote_runtime_save(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<bool, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= 128 * 1024 * 1024 => bytes.clone(),
        _ => return Err("下载内容超过 128 MiB".into()),
    };
    let name = download_name(
        request
            .headers()
            .get("x-file-name-base64")
            .and_then(|v| v.to_str().ok()),
    );
    let Some(file) = super::native_dialog::save_file(
        app.dialog()
            .file()
            .set_title("保存下载文件")
            .set_file_name(name),
    )
    .await
    else {
        return Ok(false);
    };
    let path = file.into_path().map_err(|_| "无效的保存位置")?;
    tokio::fs::write(path, bytes)
        .await
        .map_err(|_| "保存文件失败")?;
    Ok(true)
}

fn download_name(encoded: Option<&str>) -> String {
    let decoded = encoded
        .filter(|s| s.len() <= 8192)
        .and_then(|s| STANDARD.decode(s).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_else(|| "qterm-download".into());
    let name: String = decoded
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .collect();
    if name.is_empty() || name == "." || name == ".." {
        "qterm-download".into()
    } else {
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_download_preserves_unicode_basenames_only() {
        assert_eq!(
            download_name(Some(&STANDARD.encode("../../配置.json"))),
            "配置.json"
        );
        assert_eq!(download_name(Some("invalid-base64!")), "qterm-download");
        assert_eq!(
            download_name(Some(&STANDARD.encode(".."))),
            "qterm-download"
        );
    }
}
