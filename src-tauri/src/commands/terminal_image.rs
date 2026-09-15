use tauri::{
    AppHandle,
    ipc::{InvokeBody, Request},
};
use tauri_plugin_dialog::DialogExt;

use crate::{
    commands::{error::IpcError, native_dialog},
    infrastructure::terminal_image::{ImageExportError, TerminalPng},
};

#[tauri::command]
pub async fn terminal_image_save(
    app: AppHandle,
    request: Request<'_>,
) -> Result<Option<String>, IpcError> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if bytes.len() <= 64 * 1024 * 1024 => bytes.clone(),
        _ => return Err(image_error(ImageExportError::InvalidImage)),
    };
    let png = tauri::async_runtime::spawn_blocking(move || TerminalPng::validate(bytes))
        .await
        .map_err(|_| image_error(ImageExportError::Unavailable))?
        .map_err(image_error)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let selected = native_dialog::save_file(
        app.dialog()
            .file()
            .set_title("保存终端图片")
            .set_file_name(format!("terminal-{stamp}.png"))
            .add_filter("PNG 图片", &["png"]),
    )
    .await;
    let path = selected
        .map(|file| file.into_path())
        .transpose()
        .map_err(|_| image_error(ImageExportError::Unavailable))?;
    tauri::async_runtime::spawn_blocking(move || png.save_selected(path))
        .await
        .map_err(|_| image_error(ImageExportError::Unavailable))?
        .map_err(image_error)
}

fn image_error(error: ImageExportError) -> IpcError {
    match error {
        ImageExportError::InvalidImage => IpcError::new(
            "invalidTerminalImage",
            "图片无效或尺寸过大，请减少选中行数后重试",
            false,
        ),
        ImageExportError::Unavailable => IpcError::new(
            "terminalImageSaveFailed",
            "图片保存失败，请重试或选择其他位置",
            true,
        ),
    }
}
