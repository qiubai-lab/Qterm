//! Export only clipboard-selected bytes, never accept arbitrary filesystem paths from the UI.
use crate::{
    infrastructure::clipboard::NativeClipboardPayloadSource,
    ports::terminal_staging::{ClipboardPayload, ClipboardPayloadSource},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use tauri::{AppHandle, Manager};
#[derive(Serialize)]
pub struct ClipboardFile {
    name: String,
    data: String,
}
#[derive(Serialize)]
pub struct ClipboardSnapshot {
    text: String,
    files: Vec<ClipboardFile>,
}
#[tauri::command]
pub async fn remote_runtime_clipboard(app: AppHandle) -> Result<ClipboardSnapshot, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "无法准备剪贴板缓存")?
        .join("remote-clipboard");
    let source = NativeClipboardPayloadSource::new(cache);
    let payload = source
        .read_payload()
        .await
        .map_err(|_| "读取本机剪贴板失败")?;
    let mut snapshot = ClipboardSnapshot {
        text: String::new(),
        files: vec![],
    };
    match payload {
        ClipboardPayload::Empty => {}
        ClipboardPayload::Text(text) => snapshot.text = text,
        ClipboardPayload::Entries(entries) => {
            if entries.len() > 128 {
                return Err("一次粘贴最多 128 个文件".into());
            }
            let mut total = 0;
            for entry in entries {
                let result = async {
                    use tokio::io::AsyncReadExt;
                    let metadata = tokio::fs::symlink_metadata(&entry.path)
                        .await
                        .map_err(|_| "无法读取剪贴板文件")?;
                    if !metadata.is_file() {
                        return Err("目录请使用文件面板的上传文件夹功能");
                    }
                    if total + metadata.len() > 128 * 1024 * 1024 {
                        return Err("一次粘贴最多 128 MiB");
                    }
                    let file = tokio::fs::File::open(&entry.path)
                        .await
                        .map_err(|_| "无法读取剪贴板文件")?;
                    let mut bytes = Vec::new();
                    file.take(128 * 1024 * 1024 + 1 - total)
                        .read_to_end(&mut bytes)
                        .await
                        .map_err(|_| "无法读取剪贴板文件")?;
                    total += bytes.len() as u64;
                    if total > 128 * 1024 * 1024 {
                        return Err("一次粘贴最多 128 MiB");
                    }
                    Ok(ClipboardFile {
                        name: entry.display_name,
                        data: STANDARD.encode(bytes),
                    })
                }
                .await;
                if entry.cleanup_after {
                    let _ = tokio::fs::remove_file(&entry.path).await;
                }
                snapshot.files.push(result?);
            }
        }
    }
    Ok(snapshot)
}
