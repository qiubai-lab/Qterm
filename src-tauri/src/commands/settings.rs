use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::settings_service::{SettingsService, SettingsSnapshot, SettingsWarning},
    commands::error::IpcError,
    domain::settings::{DataDirectory, SecuritySettings, SettingsError},
    infrastructure::persistence::json_settings_repository::{
        JsonDataDirectoryRepository, JsonSettingsRepository,
    },
};

pub struct SettingsState {
    service: SettingsService<JsonSettingsRepository, JsonDataDirectoryRepository>,
}

impl SettingsState {
    pub fn new(
        security_repository: JsonSettingsRepository,
        data_directory_repository: JsonDataDirectoryRepository,
        default_data_directory: DataDirectory,
        active_data_directory: DataDirectory,
    ) -> Self {
        Self {
            service: SettingsService::new(
                security_repository,
                data_directory_repository,
                default_data_directory,
                active_data_directory,
            ),
        }
    }

    pub(crate) fn security(&self) -> SecuritySettings {
        self.service.snapshot().security
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SecuritySettingsDto {
    lock_on_windows_session_lock: bool,
    auto_lock_after_seconds: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DataDirectorySettingsDto {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshotDto {
    general: GeneralSettingsOutputDto,
    security: SecuritySettingsOutputDto,
    warning: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneralSettingsOutputDto {
    data_directory: String,
    active_data_directory: String,
    restart_required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecuritySettingsOutputDto {
    lock_on_windows_session_lock: bool,
    auto_lock_after_seconds: Option<u32>,
}

#[tauri::command]
pub fn settings_get(state: State<'_, SettingsState>) -> SettingsSnapshotDto {
    state.service.snapshot().into()
}

#[tauri::command]
pub fn settings_update_security(
    input: SecuritySettingsDto,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let settings = SecuritySettings::new(
        input.lock_on_windows_session_lock,
        input.auto_lock_after_seconds,
    )?;
    let snapshot = state
        .service
        .update_security(settings)
        .map_err(IpcError::from)?;
    crate::commands::credential::CredentialState::reschedule(&app, snapshot.security);
    Ok(snapshot.into())
}

#[tauri::command]
pub fn settings_update_data_directory(
    input: DataDirectorySettingsDto,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| IpcError::from(SettingsError::StorageUnavailable))?;
    let directory = DataDirectory::from_input(&input.path, &home)?;
    state
        .service
        .update_data_directory(directory)
        .map(Into::into)
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn settings_select_data_directory(
    initial_path: Option<String>,
    app: AppHandle,
) -> Result<Option<String>, IpcError> {
    let mut builder = app.dialog().file().set_title("选择 Qterm 数据存储位置");
    if let Some(path) = initial_path.filter(|value| std::path::Path::new(value).is_absolute()) {
        builder = builder.set_directory(path);
    }
    builder
        .blocking_pick_folder()
        .map(|path| {
            path.into_path()
                .map(|value| value.to_string_lossy().into_owned())
                .map_err(|_| IpcError::from(SettingsError::InvalidDataDirectory))
        })
        .transpose()
}

impl From<SettingsSnapshot> for SettingsSnapshotDto {
    fn from(value: SettingsSnapshot) -> Self {
        Self {
            general: GeneralSettingsOutputDto {
                data_directory: value.data_directory.path().to_string_lossy().into_owned(),
                active_data_directory: value
                    .active_data_directory
                    .path()
                    .to_string_lossy()
                    .into_owned(),
                restart_required: value.data_directory != value.active_data_directory,
            },
            security: SecuritySettingsOutputDto {
                lock_on_windows_session_lock: value.security.lock_on_windows_session_lock,
                auto_lock_after_seconds: value.security.auto_lock_after_seconds,
            },
            warning: value.warning.map(|warning| match warning {
                SettingsWarning::Corrupt => "corrupt",
                SettingsWarning::UnsupportedVersion => "unsupportedVersion",
                SettingsWarning::StorageUnavailable => "storageUnavailable",
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DataDirectorySettingsDto, SecuritySettingsDto};
    use serde_json::json;

    #[test]
    fn settings_input_rejects_unknown_and_sensitive_fields() {
        assert!(
            serde_json::from_value::<SecuritySettingsDto>(json!({
                "lockOnWindowsSessionLock": true,
                "autoLockAfterSeconds": 3600,
                "masterPassword": "forbidden"
            }))
            .is_err()
        );
    }

    #[test]
    fn data_directory_input_rejects_unknown_fields() {
        assert!(
            serde_json::from_value::<DataDirectorySettingsDto>(json!({
                "path": "~/.qterm",
                "migrate": true
            }))
            .is_err()
        );
    }
}
