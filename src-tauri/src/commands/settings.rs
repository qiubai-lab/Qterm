use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::settings_service::{SettingsService, SettingsSnapshot, SettingsWarning},
    commands::{error::IpcError, native_dialog},
    domain::settings::{
        AppTheme, AppearanceSettings, ConfigurationDirectory, SecuritySettings, TerminalSettings,
        UpdateSettings,
    },
    infrastructure::persistence::json_appearance_settings_repository::JsonAppearanceSettingsRepository,
    infrastructure::persistence::json_settings_repository::{
        JsonConfigurationDirectoryRepository, JsonSettingsRepository,
    },
    infrastructure::persistence::json_terminal_settings_repository::JsonTerminalSettingsRepository,
    infrastructure::persistence::json_update_settings_repository::JsonUpdateSettingsRepository,
};

pub struct SettingsState {
    service: SettingsService<
        JsonSettingsRepository,
        JsonConfigurationDirectoryRepository,
        JsonAppearanceSettingsRepository,
        JsonUpdateSettingsRepository,
        JsonTerminalSettingsRepository,
    >,
}

impl SettingsState {
    pub fn new(
        security_repository: JsonSettingsRepository,
        configuration_repository: JsonConfigurationDirectoryRepository,
        default_configuration_directory: ConfigurationDirectory,
        active_configuration_directory: ConfigurationDirectory,
        appearance_repository: JsonAppearanceSettingsRepository,
        update_repository: JsonUpdateSettingsRepository,
        terminal_repository: JsonTerminalSettingsRepository,
    ) -> Self {
        Self {
            service: SettingsService::new(
                security_repository,
                configuration_repository,
                default_configuration_directory,
                active_configuration_directory,
                appearance_repository,
                update_repository,
                terminal_repository,
            ),
        }
    }

    pub(crate) fn security(&self) -> SecuritySettings {
        self.service.snapshot().security
    }

    pub(crate) fn terminal(&self) -> TerminalSettings {
        self.service.snapshot().terminal
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SecuritySettingsDto {
    credential_auto_lock_after_seconds: Option<u32>,
    terminal_auto_lock_after_seconds: Option<u32>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AppearanceSettingsDto {
    theme: AppThemeDto,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UpdateSettingsDto {
    auto_check_on_startup: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerminalSettingsDto {
    remote_shell_integration_enabled: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum AppThemeDto {
    Dark,
    Light,
    Cyberpunk,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ConfigurationDirectorySettingsDto {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshotDto {
    general: GeneralSettingsOutputDto,
    security: SecuritySettingsOutputDto,
    appearance: AppearanceSettingsOutputDto,
    updates: UpdateSettingsOutputDto,
    terminal: TerminalSettingsOutputDto,
    warning: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneralSettingsOutputDto {
    root_directory: String,
    active_root_directory: String,
    data_directory: String,
    device_directory: String,
    cache_directory: String,
    restart_required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecuritySettingsOutputDto {
    credential_auto_lock_after_seconds: Option<u32>,
    terminal_auto_lock_after_seconds: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppearanceSettingsOutputDto {
    theme: AppThemeDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsOutputDto {
    auto_check_on_startup: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalSettingsOutputDto {
    remote_shell_integration_enabled: bool,
}

#[tauri::command]
pub fn settings_get(state: State<'_, SettingsState>) -> SettingsSnapshotDto {
    SettingsSnapshotDto::new(state.service.snapshot())
}

#[tauri::command]
pub async fn settings_select_configuration_directory(
    initial_path: Option<String>,
    app: AppHandle,
) -> Option<String> {
    let mut picker = app.dialog().file().set_title("选择 Qterm 配置目录");
    if let Some(path) = initial_path
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
    {
        picker = picker.set_directory(path);
    }
    native_dialog::pick_folder(picker)
        .await
        .and_then(|selection| selection.into_path().ok())
        .map(|path| display_path(&path))
}

#[tauri::command]
pub fn settings_update_configuration_directory(
    input: ConfigurationDirectorySettingsDto,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| crate::domain::settings::SettingsError::StorageUnavailable)?;
    let directory = ConfigurationDirectory::from_input(&input.path, &home)?;
    let snapshot = state.service.update_configuration_directory(directory)?;
    Ok(SettingsSnapshotDto::new(snapshot))
}

#[tauri::command]
pub fn settings_update_security(
    input: SecuritySettingsDto,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let settings = SecuritySettings::new(
        input.credential_auto_lock_after_seconds,
        input.terminal_auto_lock_after_seconds,
    )?;
    let snapshot = state
        .service
        .update_security(settings)
        .map_err(IpcError::from)?;
    crate::commands::credential::CredentialState::reschedule(&app, snapshot.security);
    Ok(SettingsSnapshotDto::new(snapshot))
}

#[tauri::command]
pub fn settings_update_appearance(
    input: AppearanceSettingsDto,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let snapshot = state
        .service
        .update_appearance(AppearanceSettings {
            theme: input.theme.into(),
        })
        .map_err(IpcError::from)?;
    Ok(SettingsSnapshotDto::new(snapshot))
}

#[tauri::command]
pub fn settings_update_updates(
    input: UpdateSettingsDto,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let snapshot = state
        .service
        .update_updates(UpdateSettings {
            auto_check_on_startup: input.auto_check_on_startup,
        })
        .map_err(IpcError::from)?;
    Ok(SettingsSnapshotDto::new(snapshot))
}

#[tauri::command]
pub fn settings_update_terminal(
    input: TerminalSettingsDto,
    state: State<'_, SettingsState>,
) -> Result<SettingsSnapshotDto, IpcError> {
    let snapshot = state
        .service
        .update_terminal(TerminalSettings {
            remote_shell_integration_enabled: input.remote_shell_integration_enabled,
        })
        .map_err(IpcError::from)?;
    Ok(SettingsSnapshotDto::new(snapshot))
}

impl SettingsSnapshotDto {
    fn new(value: SettingsSnapshot) -> Self {
        let root = value.configuration_directory.path();
        Self {
            general: GeneralSettingsOutputDto {
                root_directory: display_path(root),
                active_root_directory: display_path(value.active_configuration_directory.path()),
                data_directory: display_path(&root.join("data")),
                device_directory: display_path(&root.join("device")),
                cache_directory: display_path(&root.join("cache")),
                restart_required: value.configuration_directory
                    != value.active_configuration_directory,
            },
            security: SecuritySettingsOutputDto {
                credential_auto_lock_after_seconds: value
                    .security
                    .credential_auto_lock_after_seconds,
                terminal_auto_lock_after_seconds: value.security.terminal_auto_lock_after_seconds,
            },
            appearance: AppearanceSettingsOutputDto {
                theme: value.appearance.theme.into(),
            },
            updates: UpdateSettingsOutputDto {
                auto_check_on_startup: value.updates.auto_check_on_startup,
            },
            terminal: TerminalSettingsOutputDto {
                remote_shell_integration_enabled: value.terminal.remote_shell_integration_enabled,
            },
            warning: value.warning.map(|warning| match warning {
                SettingsWarning::Corrupt => "corrupt",
                SettingsWarning::UnsupportedVersion => "unsupportedVersion",
                SettingsWarning::StorageUnavailable => "storageUnavailable",
            }),
        }
    }
}

impl From<AppThemeDto> for AppTheme {
    fn from(value: AppThemeDto) -> Self {
        match value {
            AppThemeDto::Dark => Self::Dark,
            AppThemeDto::Light => Self::Light,
            AppThemeDto::Cyberpunk => Self::Cyberpunk,
        }
    }
}

impl From<AppTheme> for AppThemeDto {
    fn from(value: AppTheme) -> Self {
        match value {
            AppTheme::Dark => Self::Dark,
            AppTheme::Light => Self::Light,
            AppTheme::Cyberpunk => Self::Cyberpunk,
        }
    }
}

fn display_path(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        AppearanceSettingsDto, ConfigurationDirectorySettingsDto, SecuritySettingsDto,
        SettingsSnapshotDto, TerminalSettingsDto, UpdateSettingsDto,
    };
    use crate::{
        application::settings_service::SettingsService,
        domain::settings::ConfigurationDirectory,
        infrastructure::persistence::json_appearance_settings_repository::JsonAppearanceSettingsRepository,
        infrastructure::persistence::json_settings_repository::{
            JsonConfigurationDirectoryRepository, JsonSettingsRepository,
        },
        infrastructure::persistence::json_terminal_settings_repository::JsonTerminalSettingsRepository,
        infrastructure::persistence::json_update_settings_repository::JsonUpdateSettingsRepository,
    };
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn settings_input_rejects_unknown_and_sensitive_fields() {
        assert!(
            serde_json::from_value::<AppearanceSettingsDto>(json!({ "theme": "dark" })).is_ok()
        );
        assert!(
            serde_json::from_value::<UpdateSettingsDto>(json!({
                "autoCheckOnStartup": true
            }))
            .is_ok()
        );
        assert!(
            serde_json::from_value::<TerminalSettingsDto>(json!({
                "remoteShellIntegrationEnabled": true
            }))
            .is_ok()
        );
        assert!(
            serde_json::from_value::<TerminalSettingsDto>(json!({
                "remoteShellIntegrationEnabled": true,
                "command": "forbidden"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<UpdateSettingsDto>(json!({
                "autoCheckOnStartup": true,
                "channel": "beta"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<AppearanceSettingsDto>(json!({ "theme": "cyberpunk" }))
                .is_ok()
        );
        assert!(
            serde_json::from_value::<AppearanceSettingsDto>(json!({ "theme": "system" })).is_err()
        );
        assert!(
            serde_json::from_value::<AppearanceSettingsDto>(
                json!({ "theme": "light", "accent": "custom" })
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<SecuritySettingsDto>(json!({
                "credentialAutoLockAfterSeconds": 3600,
                "terminalAutoLockAfterSeconds": 900,
                "masterPassword": "forbidden"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<ConfigurationDirectorySettingsDto>(json!({
                "path": "C:\\Qterm Core",
                "deviceDirectory": "C:\\Forbidden"
            }))
            .is_err()
        );
    }

    #[test]
    fn settings_output_distinguishes_configured_root_from_active_and_derives_partitions() {
        let directory = tempdir().expect("directory");
        let root = directory.path().join(".qterm");
        let default_root = ConfigurationDirectory::from_absolute_path(root.clone()).expect("root");
        let active_root = default_root.clone();
        let service = SettingsService::new(
            JsonSettingsRepository::new(root.join("device/settings.json")),
            JsonConfigurationDirectoryRepository::new(
                directory.path().join(".qterm-location.json"),
            ),
            default_root,
            active_root,
            JsonAppearanceSettingsRepository::new(root.join("device/appearance.json")),
            JsonUpdateSettingsRepository::new(root.join("device/updates.json")),
            JsonTerminalSettingsRepository::new(root.join("device/terminal.json")),
        );

        let value = serde_json::to_value(SettingsSnapshotDto::new(service.snapshot()))
            .expect("serialize snapshot");

        assert_eq!(value["general"]["rootDirectory"], json!(display(&root)));
        assert_eq!(
            value["general"]["dataDirectory"],
            json!(display(&root.join("data")))
        );
        assert_eq!(
            value["general"]["activeRootDirectory"],
            json!(display(&root))
        );
        assert_eq!(
            value["general"]["deviceDirectory"],
            json!(display(&root.join("device")))
        );
        assert_eq!(
            value["general"]["cacheDirectory"],
            json!(display(&root.join("cache")))
        );
        assert_eq!(value["general"]["restartRequired"], false);

        let custom_root =
            ConfigurationDirectory::from_absolute_path(directory.path().join("custom-qterm"))
                .expect("custom root");
        let updated = service
            .update_configuration_directory(custom_root.clone())
            .expect("update configuration directory");
        let updated = serde_json::to_value(SettingsSnapshotDto::new(updated))
            .expect("serialize updated snapshot");
        assert_eq!(
            updated["general"]["rootDirectory"],
            json!(display(custom_root.path()))
        );
        assert_eq!(
            updated["general"]["activeRootDirectory"],
            json!(display(&root))
        );
        assert_eq!(
            updated["general"]["deviceDirectory"],
            json!(display(&custom_root.path().join("device")))
        );
        assert_eq!(updated["general"]["restartRequired"], true);
        assert_eq!(updated["appearance"]["theme"], "dark");
        assert_eq!(updated["updates"]["autoCheckOnStartup"], false);
        assert_eq!(updated["terminal"]["remoteShellIntegrationEnabled"], true);
    }

    fn display(path: &std::path::Path) -> String {
        path.to_string_lossy().into_owned()
    }
}
