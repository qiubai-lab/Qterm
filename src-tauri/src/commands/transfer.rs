use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    commands::{error::IpcError, native_dialog, session::SessionState},
    domain::{transfer::RemotePath, transfer::TransferEvent},
    infrastructure::ssh::client::{SessionControlError, TransferRequest},
};

pub struct TransferState {
    upload_path: Mutex<Option<PathBuf>>,
    selected_upload_paths: Mutex<Option<Vec<PathBuf>>>,
    download_paths: Mutex<HashSet<PathBuf>>,
    dropped_paths: Mutex<HashSet<PathBuf>>,
}

impl TransferState {
    pub fn new() -> Self {
        Self {
            upload_path: Mutex::new(None),
            selected_upload_paths: Mutex::new(None),
            download_paths: Mutex::new(HashSet::new()),
            dropped_paths: Mutex::new(HashSet::new()),
        }
    }

    fn remember(slot: &Mutex<Option<PathBuf>>, path: Option<PathBuf>) {
        *slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = path;
    }

    fn matches(slot: &Mutex<Option<PathBuf>>, path: &Path) -> bool {
        slot.lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_deref()
            == Some(path)
    }

    fn approve_download(&self, path: Option<PathBuf>) {
        if let Some(path) = path {
            self.download_paths
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(path);
        }
    }

    fn take_download(&self, path: &Path) -> bool {
        self.download_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(path)
    }

    fn clear_selected_upload_paths(&self) {
        *self
            .selected_upload_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    }

    fn approve_selected_upload_paths(&self, paths: Vec<PathBuf>) {
        *self
            .selected_upload_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(paths);
    }

    fn take_selected_upload_paths(&self, paths: &[PathBuf]) -> bool {
        self.selected_upload_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
            .as_deref()
            == Some(paths)
    }

    pub(crate) fn approve_drop_paths(&self, paths: &[PathBuf]) {
        let mut approved = self
            .dropped_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        approved.clear();
        approved.extend(paths.iter().cloned());
    }

    fn take_drop_paths(&self, paths: &[PathBuf]) -> bool {
        let mut approved = self
            .dropped_paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let requested = paths.iter().cloned().collect::<HashSet<_>>();
        if paths.is_empty() || requested.len() != paths.len() || *approved != requested {
            return false;
        }
        approved.clear();
        true
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UploadDto {
    session_id: String,
    local_path: String,
    remote_path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DownloadDto {
    session_id: String,
    remote_path: String,
    local_path: String,
    #[serde(default)]
    is_directory: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DroppedUploadDto {
    session_id: String,
    local_paths: Vec<String>,
    remote_directory: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SelectedUploadDto {
    session_id: String,
    local_paths: Vec<String>,
    remote_directory: String,
}

#[tauri::command]
pub async fn transfer_select_download_directory(
    name: String,
    app: AppHandle,
    state: State<'_, TransferState>,
) -> Result<Option<String>, IpcError> {
    if !safe_file_name(&name) {
        return Err(invalid_remote_path(
            crate::domain::transfer::TransferValidationError,
        ));
    }
    let selected = native_dialog::pick_folder(app.dialog().file().set_title("选择文件夹保存位置"))
        .await
        .and_then(|folder| folder.into_path().ok())
        .map(|folder| folder.join(name));
    state.approve_download(selected.clone());
    Ok(selected.and_then(|path| path.to_str().map(str::to_owned)))
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TransferEventDto {
    Started {
        total_bytes: u64,
    },
    Progress {
        transferred_bytes: u64,
        total_bytes: u64,
    },
    Completed,
    Cancelled,
    Failed {
        message: &'static str,
    },
}

#[tauri::command]
pub async fn transfer_select_upload_file(
    app: AppHandle,
    state: State<'_, TransferState>,
) -> Result<Option<String>, IpcError> {
    let selected = native_dialog::pick_file(app.dialog().file().set_title("选择要上传的文件"))
        .await
        .and_then(|file| file.into_path().ok());
    TransferState::remember(&state.upload_path, selected.clone());
    Ok(selected.and_then(|path| path.to_str().map(str::to_owned)))
}

#[tauri::command]
pub async fn transfer_select_upload_files(
    app: AppHandle,
    state: State<'_, TransferState>,
) -> Result<Vec<String>, IpcError> {
    state.clear_selected_upload_paths();
    let selected =
        native_dialog::pick_files(app.dialog().file().set_title("选择要上传的文件（可多选）"))
            .await
            .unwrap_or_default();
    let paths = selected
        .into_iter()
        .map(|file| file.into_path().map_err(|_| invalid_local_path()))
        .collect::<Result<Vec<_>, _>>()?;
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    validate_upload_root_paths(&paths)?;
    let serialized = serialize_local_paths(&paths)?;
    state.approve_selected_upload_paths(paths);
    Ok(serialized)
}

#[tauri::command]
pub async fn transfer_select_upload_folder(
    app: AppHandle,
    state: State<'_, TransferState>,
) -> Result<Option<String>, IpcError> {
    state.clear_selected_upload_paths();
    let selected =
        native_dialog::pick_folder(app.dialog().file().set_title("选择要上传的文件夹")).await;
    let Some(folder) = selected else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|_| invalid_local_path())?;
    validate_upload_root_paths(std::slice::from_ref(&path))?;
    let serialized = path
        .to_str()
        .map(str::to_owned)
        .ok_or_else(invalid_local_path)?;
    state.approve_selected_upload_paths(vec![path]);
    Ok(Some(serialized))
}

#[tauri::command]
pub async fn transfer_select_download_path(
    name: Option<String>,
    app: AppHandle,
    state: State<'_, TransferState>,
) -> Result<Option<String>, IpcError> {
    if name.as_deref().is_some_and(|value| !safe_file_name(value)) {
        return Err(invalid_remote_path(
            crate::domain::transfer::TransferValidationError,
        ));
    }
    let mut dialog = app.dialog().file().set_title("保存远程文件");
    if let Some(name) = name {
        dialog = dialog.set_file_name(name);
    }
    let selected = native_dialog::save_file(dialog)
        .await
        .and_then(|file| file.into_path().ok());
    state.approve_download(selected.clone());
    Ok(selected.and_then(|path| path.to_str().map(str::to_owned)))
}

#[tauri::command]
pub fn transfer_upload(
    input: UploadDto,
    on_event: Channel<TransferEventDto>,
    transfer_state: State<'_, TransferState>,
    session_state: State<'_, SessionState>,
) -> Result<String, IpcError> {
    let local_path = PathBuf::from(input.local_path);
    ensure_selected(&transfer_state.upload_path, &local_path)?;
    let remote_path = RemotePath::new(input.remote_path).map_err(invalid_remote_path)?;
    start_transfer(
        &session_state,
        &input.session_id,
        TransferRequest::Upload {
            local_path,
            remote_path,
        },
        on_event,
    )
}

#[tauri::command]
pub fn transfer_upload_dropped(
    input: DroppedUploadDto,
    on_event: Channel<TransferEventDto>,
    transfer_state: State<'_, TransferState>,
    session_state: State<'_, SessionState>,
) -> Result<String, IpcError> {
    if input.local_paths.len() > 256 {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidTransferPath,
            "一次最多上传 256 个文件或文件夹",
            false,
        )));
    }
    let local_paths = input
        .local_paths
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if !transfer_state.take_drop_paths(&local_paths) {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::TransferPathNotSelected,
            "本地路径必须来自当前系统拖放操作",
            false,
        )));
    }
    let remote_directory = RemotePath::new(input.remote_directory).map_err(invalid_remote_path)?;
    start_transfer(
        &session_state,
        &input.session_id,
        TransferRequest::UploadEntries {
            local_paths,
            remote_directory,
        },
        on_event,
    )
}

#[tauri::command]
pub fn transfer_upload_selected(
    input: SelectedUploadDto,
    on_event: Channel<TransferEventDto>,
    transfer_state: State<'_, TransferState>,
    session_state: State<'_, SessionState>,
) -> Result<String, IpcError> {
    let local_paths = input
        .local_paths
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    validate_upload_root_paths(&local_paths)?;
    if !transfer_state.take_selected_upload_paths(&local_paths) {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::TransferPathNotSelected,
            "本地路径必须来自当前系统文件选择操作",
            false,
        )));
    }
    let remote_directory = RemotePath::new(input.remote_directory).map_err(invalid_remote_path)?;
    start_transfer(
        &session_state,
        &input.session_id,
        TransferRequest::UploadEntries {
            local_paths,
            remote_directory,
        },
        on_event,
    )
}

#[tauri::command]
pub fn transfer_download(
    input: DownloadDto,
    on_event: Channel<TransferEventDto>,
    transfer_state: State<'_, TransferState>,
    session_state: State<'_, SessionState>,
) -> Result<String, IpcError> {
    let local_path = PathBuf::from(input.local_path);
    if !transfer_state.take_download(&local_path) {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::TransferPathNotSelected,
            "本地文件路径必须来自当前系统文件选择操作",
            false,
        )));
    }
    let remote_path = RemotePath::new(input.remote_path).map_err(invalid_remote_path)?;
    let request = if input.is_directory {
        TransferRequest::DownloadDirectory {
            remote_path,
            local_path,
        }
    } else {
        TransferRequest::Download {
            remote_path,
            local_path,
        }
    };
    start_transfer(&session_state, &input.session_id, request, on_event)
}

fn safe_file_name(name: &str) -> bool {
    let path = Path::new(name);
    !name.trim().is_empty()
        && name != "."
        && name != ".."
        && path.components().count() == 1
        && path.file_name().and_then(|value| value.to_str()) == Some(name)
}

fn validate_upload_root_paths(paths: &[PathBuf]) -> Result<(), IpcError> {
    let unique = paths.iter().collect::<HashSet<_>>();
    if paths.is_empty() || paths.len() > 256 || unique.len() != paths.len() {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidTransferPath,
            "请选择 1 至 256 个不同的文件或文件夹",
            false,
        )));
    }
    Ok(())
}

fn serialize_local_paths(paths: &[PathBuf]) -> Result<Vec<String>, IpcError> {
    paths
        .iter()
        .map(|path| {
            path.to_str()
                .map(str::to_owned)
                .ok_or_else(invalid_local_path)
        })
        .collect()
}

fn invalid_local_path() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::InvalidTransferPath,
        "本地文件路径无效",
        false,
    ))
}

#[tauri::command]
pub fn transfer_cancel(
    session_id: String,
    transfer_id: String,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    state
        .manager()
        .cancel_transfer(&session_id, &transfer_id)
        .map_err(transfer_control_error)
}

fn start_transfer(
    state: &SessionState,
    session_id: &str,
    request: TransferRequest,
    channel: Channel<TransferEventDto>,
) -> Result<String, IpcError> {
    let sink = Arc::new(move |event| {
        let _ = channel.send(TransferEventDto::from(event));
    });
    state
        .manager()
        .start_transfer(session_id, request, sink)
        .map_err(transfer_control_error)
}

fn ensure_selected(slot: &Mutex<Option<PathBuf>>, path: &Path) -> Result<(), IpcError> {
    if TransferState::matches(slot, path) {
        Ok(())
    } else {
        Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::TransferPathNotSelected,
            "本地文件路径必须来自当前系统文件选择操作",
            false,
        )))
    }
}

fn invalid_remote_path(_: crate::domain::transfer::TransferValidationError) -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::InvalidTransferPath,
        "远程文件路径无效",
        false,
    ))
}

fn transfer_control_error(error: SessionControlError) -> IpcError {
    let application_error = match error {
        SessionControlError::SessionNotFound => ApplicationError::new(
            ApplicationErrorCode::SessionNotFound,
            "SSH 会话不存在",
            false,
        ),
        SessionControlError::SessionNotConnected => ApplicationError::new(
            ApplicationErrorCode::SessionNotConnected,
            "SSH 会话尚未连接",
            true,
        ),
        SessionControlError::TransferNotFound => ApplicationError::new(
            ApplicationErrorCode::TransferNotFound,
            "文件传输任务不存在或已经结束",
            false,
        ),
        SessionControlError::DirectoryUnavailable => ApplicationError::new(
            ApplicationErrorCode::DirectoryUnavailable,
            "无法读取远程文件夹",
            true,
        ),
        SessionControlError::FileUnavailable
        | SessionControlError::FileTooLarge
        | SessionControlError::FileConflict => ApplicationError::new(
            ApplicationErrorCode::TerminalBusy,
            "SSH 会话暂时无法处理文件传输请求",
            true,
        ),
        _ => ApplicationError::new(
            ApplicationErrorCode::TerminalBusy,
            "SSH 会话暂时无法处理文件传输请求",
            true,
        ),
    };
    IpcError::from(application_error)
}

impl From<TransferEvent> for TransferEventDto {
    fn from(event: TransferEvent) -> Self {
        match event {
            TransferEvent::Started { total_bytes } => Self::Started { total_bytes },
            TransferEvent::Progress {
                transferred_bytes,
                total_bytes,
            } => Self::Progress {
                transferred_bytes,
                total_bytes,
            },
            TransferEvent::Completed => Self::Completed,
            TransferEvent::Cancelled => Self::Cancelled,
            TransferEvent::Failed => Self::Failed {
                message: "文件传输失败",
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{TransferState, safe_file_name, validate_upload_root_paths};

    #[test]
    fn transfer_paths_must_match_the_latest_system_selection() {
        let state = TransferState::new();
        TransferState::remember(&state.upload_path, Some("/tmp/source.txt".into()));
        assert!(TransferState::matches(
            &state.upload_path,
            Path::new("/tmp/source.txt")
        ));
        assert!(!TransferState::matches(
            &state.upload_path,
            Path::new("/tmp/other.txt")
        ));
    }

    #[test]
    fn directory_download_names_cannot_escape_the_selected_parent() {
        assert!(safe_file_name("release"));
        assert!(!safe_file_name("../release"));
        assert!(!safe_file_name("a/b"));
        assert!(!safe_file_name(".."));
    }

    #[test]
    fn independent_download_selections_are_one_time_authorizations() {
        let state = TransferState::new();
        state.approve_download(Some("/tmp/a".into()));
        state.approve_download(Some("/tmp/b".into()));
        assert!(state.take_download(Path::new("/tmp/a")));
        assert!(state.take_download(Path::new("/tmp/b")));
        assert!(!state.take_download(Path::new("/tmp/a")));
    }

    #[test]
    fn dropped_paths_are_authorized_as_one_consumable_set() {
        let state = TransferState::new();
        let paths = vec![
            Path::new("/tmp/a").to_path_buf(),
            Path::new("/tmp/b").to_path_buf(),
        ];
        state.approve_drop_paths(&paths);
        assert!(!state.take_drop_paths(&[paths[0].clone()]));
        assert!(state.take_drop_paths(&paths));
        assert!(!state.take_drop_paths(&paths));

        state.approve_drop_paths(&paths);
        assert!(!state.take_drop_paths(&[Path::new("/tmp/other").to_path_buf()]));
    }

    #[test]
    fn selected_upload_paths_require_an_exact_one_time_match() {
        let state = TransferState::new();
        let paths = vec![PathBuf::from("/tmp/a"), PathBuf::from("/tmp/b")];
        state.approve_selected_upload_paths(paths.clone());
        assert!(state.take_selected_upload_paths(&paths));
        assert!(!state.take_selected_upload_paths(&paths));

        state.approve_selected_upload_paths(paths.clone());
        assert!(!state.take_selected_upload_paths(&[PathBuf::from("/tmp/other")]));
        assert!(!state.take_selected_upload_paths(&paths));
    }

    #[test]
    fn later_picker_results_replace_earlier_selected_upload_authorization() {
        let state = TransferState::new();
        let first = vec![PathBuf::from("/tmp/first")];
        let second = vec![PathBuf::from("/tmp/second")];
        state.approve_selected_upload_paths(first.clone());
        state.approve_selected_upload_paths(second.clone());
        assert!(!state.take_selected_upload_paths(&first));

        state.approve_selected_upload_paths(second.clone());
        assert!(state.take_selected_upload_paths(&second));
    }

    #[test]
    fn selected_upload_roots_reject_empty_duplicate_and_over_limit_sets() {
        assert!(validate_upload_root_paths(&[]).is_err());
        assert!(
            validate_upload_root_paths(&[PathBuf::from("/tmp/a"), PathBuf::from("/tmp/a")])
                .is_err()
        );
        let allowed = (0..256)
            .map(|index| PathBuf::from(format!("/tmp/{index}")))
            .collect::<Vec<_>>();
        assert!(validate_upload_root_paths(&allowed).is_ok());
        let over_limit = (0..257)
            .map(|index| PathBuf::from(format!("/tmp/{index}")))
            .collect::<Vec<_>>();
        assert!(validate_upload_root_paths(&over_limit).is_err());
    }
}
