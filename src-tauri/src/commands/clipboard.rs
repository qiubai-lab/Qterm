use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{
    application::{
        clipboard_image_service::{ClipboardImagePasteError, paste_remote_clipboard_image},
        error::{ApplicationError, ApplicationErrorCode},
    },
    commands::{error::IpcError, session::SessionState},
    domain::clipboard_image::ClipboardImageError,
    infrastructure::clipboard::NativeClipboardImageSource,
    ports::clipboard_image::RemoteClipboardImageError,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImagePasteDto {
    remote_path: String,
    width: u32,
    height: u32,
}

#[tauri::command]
pub async fn session_paste_clipboard_image(
    app: AppHandle,
    session_id: String,
    state: State<'_, SessionState>,
) -> Result<ClipboardImagePasteDto, IpcError> {
    let source = NativeClipboardImageSource::new(app);
    let result = paste_remote_clipboard_image(&source, state.manager().as_ref(), &session_id)
        .await
        .map_err(paste_error)?;
    Ok(ClipboardImagePasteDto {
        remote_path: result.remote_path,
        width: result.width,
        height: result.height,
    })
}

fn paste_error(error: ClipboardImagePasteError) -> IpcError {
    let error = match error {
        ClipboardImagePasteError::Clipboard(ClipboardImageError::Unavailable) => {
            ApplicationError::new(
                ApplicationErrorCode::ClipboardImageUnavailable,
                "剪贴板中没有可用图片",
                false,
            )
        }
        ClipboardImagePasteError::Clipboard(
            ClipboardImageError::InvalidDimensions | ClipboardImageError::InvalidPixelData,
        ) => ApplicationError::new(
            ApplicationErrorCode::ClipboardImageInvalid,
            "剪贴板图片尺寸或像素数据无效",
            false,
        ),
        ClipboardImagePasteError::Clipboard(
            ClipboardImageError::TooManyPixels | ClipboardImageError::TooLarge,
        ) => ApplicationError::new(
            ApplicationErrorCode::ClipboardImageTooLarge,
            "剪贴板图片超过 8192 像素边长、16777216 像素或 20 MiB 限制",
            false,
        ),
        ClipboardImagePasteError::Clipboard(ClipboardImageError::EncodingFailed) => {
            ApplicationError::new(
                ApplicationErrorCode::ClipboardImageEncodingFailed,
                "无法将剪贴板图片编码为 PNG",
                true,
            )
        }
        ClipboardImagePasteError::Remote(RemoteClipboardImageError::SessionNotFound) => {
            ApplicationError::new(
                ApplicationErrorCode::SessionNotFound,
                "SSH 会话不存在",
                false,
            )
        }
        ClipboardImagePasteError::Remote(RemoteClipboardImageError::SessionNotConnected) => {
            ApplicationError::new(
                ApplicationErrorCode::SessionNotConnected,
                "SSH 会话尚未连接",
                true,
            )
        }
        ClipboardImagePasteError::Remote(RemoteClipboardImageError::TerminalUnavailable) => {
            ApplicationError::new(
                ApplicationErrorCode::InvalidTerminalInput,
                "只有远程终端会话支持粘贴图片",
                false,
            )
        }
        ClipboardImagePasteError::Remote(RemoteClipboardImageError::SftpUnavailable) => {
            ApplicationError::new(
                ApplicationErrorCode::ClipboardImageSftpUnavailable,
                "远程服务器未提供可用的 SFTP 子系统",
                true,
            )
        }
        ClipboardImagePasteError::Remote(
            RemoteClipboardImageError::TemporaryDirectoryUnavailable,
        ) => ApplicationError::new(
            ApplicationErrorCode::ClipboardImageTemporaryDirectoryUnavailable,
            "无法创建安全的远程图片临时目录",
            true,
        ),
        ClipboardImagePasteError::Remote(RemoteClipboardImageError::UploadFailed) => {
            ApplicationError::new(
                ApplicationErrorCode::ClipboardImageUploadFailed,
                "远程图片上传失败",
                true,
            )
        }
    };
    IpcError::from(error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_dto_contains_no_image_bytes_or_remote_policy_controls() {
        let value = serde_json::to_value(ClipboardImagePasteDto {
            remote_path: "/tmp/.qterm-clipboard-session/image.png".into(),
            width: 12,
            height: 8,
        })
        .expect("serialize");
        assert_eq!(
            value,
            serde_json::json!({
                "remotePath": "/tmp/.qterm-clipboard-session/image.png",
                "width": 12,
                "height": 8
            })
        );
    }
}
