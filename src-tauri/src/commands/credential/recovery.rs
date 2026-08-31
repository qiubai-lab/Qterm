use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use zeroize::Zeroizing;

use crate::domain::credential::{CredentialError, RecoveryKeyFile};

const MAX_RECOVERY_FILE_BYTES: u64 = 4 * 1024;

pub(super) async fn wait_for_dialog_result<T, F>(show: F) -> Result<T, CredentialError>
where
    T: Send + 'static,
    F: FnOnce(Box<dyn FnOnce(T) + Send>),
{
    let (sender, receiver) = oneshot::channel();
    show(Box::new(move |result| {
        let _ = sender.send(result);
    }));
    receiver
        .await
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)
}

pub(super) async fn pick_recovery_save_path(
    app: &AppHandle,
    title: &str,
) -> Result<Option<PathBuf>, CredentialError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());
    let dialog = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(recovery_file_name(timestamp))
        .add_filter("Qterm 恢复密钥", &["key"]);
    wait_for_dialog_result(move |complete| dialog.save_file(complete))
        .await
        .map(|file| file.and_then(|value| value.into_path().ok()))
}

pub(super) async fn pick_recovery_open_path(
    app: &AppHandle,
) -> Result<Option<PathBuf>, CredentialError> {
    let dialog = app
        .dialog()
        .file()
        .set_title("选择 Qterm 恢复密钥")
        .add_filter("Qterm 恢复密钥", &["key"]);
    wait_for_dialog_result(move |complete| dialog.pick_file(complete))
        .await
        .map(|file| file.and_then(|value| value.into_path().ok()))
}

pub(super) fn recovery_file_name(timestamp: u64) -> String {
    format!("qterm-recovery-{timestamp}.key")
}

fn recovery_file_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

pub(super) fn write_recovery_file(
    path: &Path,
    recovery: &RecoveryKeyFile,
) -> Result<(), CredentialError> {
    let mut file = recovery_file_options()
        .open(path)
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    let result = file
        .write_all(recovery.expose())
        .and_then(|()| file.sync_all())
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable);
    drop(file);
    if result.is_err() {
        remove_uncommitted_recovery_file(path);
    }
    result
}

pub(super) fn read_recovery_file(path: &Path) -> Result<RecoveryKeyFile, CredentialError> {
    let file = File::open(path).map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    let metadata = file
        .metadata()
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_RECOVERY_FILE_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_RECOVERY_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    if bytes.len() as u64 > MAX_RECOVERY_FILE_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    Ok(RecoveryKeyFile::new(bytes.to_vec()))
}

pub(super) fn remove_uncommitted_recovery_file(path: &Path) {
    let _ = fs::remove_file(path);
}
