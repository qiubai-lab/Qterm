use std::{path::PathBuf, sync::Arc};

use serde::Serialize;
use tauri::{State, ipc::Channel};

use crate::{
    application::terminal_staging_service::{
        LocalTerminalClipboardPaste, TerminalClipboardPasteStart, cancel_terminal_clipboard_paste,
        prepare_local_terminal_clipboard_paste, start_terminal_clipboard_paste,
    },
    commands::{error::IpcError, session::SessionState},
    domain::terminal_staging::{
        LocalTerminalPathStyle, TerminalStagingError, TerminalStagingEvent,
    },
    infrastructure::clipboard::NativeClipboardPayloadSource,
};

pub struct ClipboardState {
    source: NativeClipboardPayloadSource,
}

impl ClipboardState {
    pub fn new(cache_directory: PathBuf) -> Self {
        Self {
            source: NativeClipboardPayloadSource::new(cache_directory),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TerminalClipboardPasteStartDto {
    Empty,
    Text { text: String },
    Transfer { task_id: String },
}

impl From<TerminalClipboardPasteStart> for TerminalClipboardPasteStartDto {
    fn from(value: TerminalClipboardPasteStart) -> Self {
        match value {
            TerminalClipboardPasteStart::Empty => Self::Empty,
            TerminalClipboardPasteStart::Text(text) => Self::Text { text },
            TerminalClipboardPasteStart::Transfer { task_id } => Self::Transfer { task_id },
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LocalTerminalClipboardPasteDto {
    Empty,
    Text {
        text: String,
    },
    Paths {
        text: String,
        display_name: String,
        item_count: usize,
    },
}

impl From<LocalTerminalClipboardPaste> for LocalTerminalClipboardPasteDto {
    fn from(value: LocalTerminalClipboardPaste) -> Self {
        match value {
            LocalTerminalClipboardPaste::Empty => Self::Empty,
            LocalTerminalClipboardPaste::Text(text) => Self::Text { text },
            LocalTerminalClipboardPaste::Paths {
                text,
                display_name,
                item_count,
            } => Self::Paths {
                text,
                display_name,
                item_count,
            },
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TerminalStagingEventDto {
    Preparing,
    Scanning {
        item_count: usize,
    },
    Started {
        total_bytes: u64,
        item_count: usize,
        display_name: String,
    },
    Progress {
        transferred_bytes: u64,
        total_bytes: u64,
    },
    Completed {
        remote_paths: Vec<String>,
    },
    Cancelled,
    Failed,
}

impl From<TerminalStagingEvent> for TerminalStagingEventDto {
    fn from(value: TerminalStagingEvent) -> Self {
        match value {
            TerminalStagingEvent::Preparing => Self::Preparing,
            TerminalStagingEvent::Scanning { item_count } => Self::Scanning { item_count },
            TerminalStagingEvent::Started {
                total_bytes,
                item_count,
                display_name,
            } => Self::Started {
                total_bytes,
                item_count,
                display_name,
            },
            TerminalStagingEvent::Progress {
                transferred_bytes,
                total_bytes,
            } => Self::Progress {
                transferred_bytes,
                total_bytes,
            },
            TerminalStagingEvent::Completed { remote_paths } => Self::Completed { remote_paths },
            TerminalStagingEvent::Cancelled => Self::Cancelled,
            TerminalStagingEvent::Failed => Self::Failed,
        }
    }
}

#[tauri::command]
pub async fn session_start_clipboard_staging(
    session_id: String,
    on_event: Channel<TerminalStagingEventDto>,
    state: State<'_, SessionState>,
    clipboard: State<'_, ClipboardState>,
) -> Result<TerminalClipboardPasteStartDto, IpcError> {
    let events = Arc::new(move |event: TerminalStagingEvent| {
        let _ = on_event.send(TerminalStagingEventDto::from(event));
    });
    start_terminal_clipboard_paste(
        &clipboard.source,
        state.manager().as_ref(),
        &session_id,
        events,
    )
    .await
    .map(TerminalClipboardPasteStartDto::from)
    .map_err(staging_error)
}

#[tauri::command]
pub async fn local_terminal_prepare_clipboard_paste(
    clipboard: State<'_, ClipboardState>,
) -> Result<LocalTerminalClipboardPasteDto, IpcError> {
    prepare_local_terminal_clipboard_paste(&clipboard.source, LocalTerminalPathStyle::native())
        .await
        .map(LocalTerminalClipboardPasteDto::from)
        .map_err(local_clipboard_error)
}

#[tauri::command]
pub fn session_cancel_clipboard_staging(
    session_id: String,
    task_id: String,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    cancel_terminal_clipboard_paste(state.manager().as_ref(), &session_id, &task_id)
        .map_err(staging_error)
}

fn staging_error(error: TerminalStagingError) -> IpcError {
    match error {
        TerminalStagingError::ClipboardUnavailable => {
            IpcError::new("clipboardUnavailable", "暂时无法读取系统剪贴板", true)
        }
        TerminalStagingError::InvalidClipboardData => IpcError::new(
            "clipboardDataInvalid",
            "剪贴板中的内容无法用于远程粘贴",
            false,
        ),
        TerminalStagingError::LocalSourceUnavailable => IpcError::new(
            "clipboardSourceUnavailable",
            "剪贴板引用的本地文件不可访问",
            true,
        ),
        TerminalStagingError::SessionNotFound => {
            IpcError::new("sessionNotFound", "SSH 会话不存在", false)
        }
        TerminalStagingError::SessionNotConnected => {
            IpcError::new("sessionNotConnected", "SSH 会话尚未连接", true)
        }
        TerminalStagingError::TerminalUnavailable => IpcError::new(
            "terminalStagingUnavailable",
            "当前会话不支持终端文件暂存",
            false,
        ),
        TerminalStagingError::TemporaryDirectoryUnavailable => IpcError::new(
            "terminalStagingDirectoryUnavailable",
            "无法创建安全的远程临时目录",
            true,
        ),
        TerminalStagingError::UploadFailed => {
            IpcError::new("terminalStagingUploadFailed", "文件上传失败，请重试", true)
        }
        TerminalStagingError::TaskNotFound => IpcError::new(
            "terminalStagingTaskNotFound",
            "上传任务已结束或不存在",
            false,
        ),
    }
}

fn local_clipboard_error(error: TerminalStagingError) -> IpcError {
    match error {
        TerminalStagingError::ClipboardUnavailable => {
            IpcError::new("clipboardUnavailable", "暂时无法读取系统剪贴板", true)
        }
        TerminalStagingError::InvalidClipboardData => IpcError::new(
            "clipboardDataInvalid",
            "剪贴板中的内容无法用于本地终端粘贴",
            false,
        ),
        TerminalStagingError::LocalSourceUnavailable => IpcError::new(
            "clipboardSourceUnavailable",
            "剪贴板引用的本地文件不可访问",
            true,
        ),
        _ => IpcError::new(
            "terminalClipboardUnavailable",
            "当前本地终端无法准备剪贴板路径",
            true,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_events_never_serialize_local_paths_or_file_bytes() {
        let value = serde_json::to_value(TerminalStagingEventDto::Started {
            total_bytes: 42,
            item_count: 1,
            display_name: "photo.png".into(),
        })
        .expect("event");
        let serialized = value.to_string();
        assert!(!serialized.contains("localPath"));
        assert!(!serialized.contains("bytes"));
        assert!(!serialized.contains("C:/"));
    }

    #[test]
    fn local_path_result_contains_only_the_transient_paste_contract() {
        let value = serde_json::to_value(LocalTerminalClipboardPasteDto::Paths {
            text: r#""C:\My Models\model.bin""#.into(),
            display_name: "model.bin".into(),
            item_count: 1,
        })
        .expect("local result");
        assert_eq!(value["kind"], "paths");
        assert_eq!(value["displayName"], "model.bin");
        assert_eq!(value["itemCount"], 1);
        assert!(value.get("bytes").is_none());
        assert!(value.get("localPath").is_none());
    }
}
