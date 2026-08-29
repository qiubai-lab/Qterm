use std::{path::PathBuf, sync::Arc};

use portable_pty::PtySize;
use serde::Serialize;
use tauri::{State, ipc::Channel};

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    commands::error::IpcError,
    domain::session::{InitialDirectory, TerminalSize},
    infrastructure::local::pty::{
        LocalSessionError, LocalSessionEvent, LocalSessionManager, terminal_capabilities,
    },
};

pub struct LocalSessionState {
    manager: Arc<LocalSessionManager>,
}

impl LocalSessionState {
    pub fn new(manager: LocalSessionManager) -> Self {
        Self {
            manager: Arc::new(manager),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LocalSessionEventDto {
    StateChanged { state: &'static str },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalDataDto {
    data: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionConnectionDto {
    session_id: String,
    cwd: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalCapabilitiesDto {
    windows_pty: Option<WindowsPtyDto>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsPtyDto {
    backend: &'static str,
    build_number: u32,
}

#[tauri::command]
pub fn local_terminal_capabilities() -> LocalTerminalCapabilitiesDto {
    let capabilities = terminal_capabilities();
    LocalTerminalCapabilitiesDto {
        windows_pty: capabilities.windows_pty.map(|windows_pty| WindowsPtyDto {
            backend: windows_pty.backend,
            build_number: windows_pty.build_number,
        }),
    }
}

#[tauri::command]
pub fn local_session_connect(
    columns: u32,
    rows: u32,
    osc7_enabled: bool,
    initial_directory: Option<String>,
    on_event: Channel<LocalSessionEventDto>,
    on_terminal: Channel<LocalTerminalDataDto>,
    state: State<'_, LocalSessionState>,
) -> Result<LocalSessionConnectionDto, IpcError> {
    let size = terminal_size(columns, rows)?;
    let events = Arc::new(move |event| {
        let state = match event {
            LocalSessionEvent::Connected => "connected",
            LocalSessionEvent::Closed => "closed",
        };
        let _ = on_event.send(LocalSessionEventDto::StateChanged { state });
    });
    let output = Arc::new(move |data| {
        let _ = on_terminal.send(LocalTerminalDataDto { data });
    });
    let connection = state
        .manager
        .connect(
            size,
            osc7_enabled,
            initial_directory
                .and_then(InitialDirectory::new)
                .map(InitialDirectory::into_string)
                .map(PathBuf::from),
            output,
            events,
        )
        .map_err(local_error)?;
    Ok(LocalSessionConnectionDto {
        session_id: connection.session_id,
        cwd: connection.cwd.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn local_session_write(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, LocalSessionState>,
) -> Result<(), IpcError> {
    state.manager.write(&session_id, data).map_err(local_error)
}

#[tauri::command]
pub fn local_session_resize(
    session_id: String,
    columns: u32,
    rows: u32,
    state: State<'_, LocalSessionState>,
) -> Result<(), IpcError> {
    let size = terminal_size(columns, rows)?;
    state.manager.resize(&session_id, size).map_err(local_error)
}

#[tauri::command]
pub fn local_session_close(
    session_id: String,
    state: State<'_, LocalSessionState>,
) -> Result<(), IpcError> {
    state.manager.close(&session_id).map_err(local_error)
}

fn terminal_size(columns: u32, rows: u32) -> Result<PtySize, IpcError> {
    let size = TerminalSize::new(columns, rows).map_err(|_| {
        IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "终端窗口尺寸无效",
            false,
        ))
    })?;
    Ok(PtySize {
        rows: size.rows as u16,
        cols: size.columns as u16,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn local_error(error: LocalSessionError) -> IpcError {
    let application_error = match error {
        LocalSessionError::StartFailed => ApplicationError::new(
            ApplicationErrorCode::LocalShellUnavailable,
            "无法启动本地终端",
            true,
        ),
        LocalSessionError::SessionNotFound => ApplicationError::new(
            ApplicationErrorCode::SessionNotFound,
            "本地终端会话不存在",
            false,
        ),
        LocalSessionError::InvalidTerminalInput => ApplicationError::new(
            ApplicationErrorCode::InvalidTerminalInput,
            "终端输入为空或超过大小限制",
            false,
        ),
        LocalSessionError::ControlUnavailable => ApplicationError::new(
            ApplicationErrorCode::TerminalBusy,
            "本地终端暂时无法响应",
            true,
        ),
    };
    IpcError::from(application_error)
}

#[cfg(test)]
mod tests {
    use super::local_terminal_capabilities;

    #[test]
    fn reports_the_native_local_pty_compatibility_mode() {
        let capabilities = local_terminal_capabilities();

        #[cfg(windows)]
        {
            let windows_pty = capabilities.windows_pty.expect("Windows uses ConPTY");
            assert_eq!(windows_pty.backend, "conpty");
            assert!(windows_pty.build_number >= 17_763);
        }

        #[cfg(not(windows))]
        assert!(capabilities.windows_pty.is_none());
    }
}
