use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{Extension, Json, extract::State};
use qterm_core::{
    application::credential_lifecycle::{LockReason, Reschedule},
    domain::settings::{AppTheme, AppearanceSettings, SecuritySettings, TerminalSettings},
    infrastructure::persistence::{
        json_appearance_settings_repository::JsonAppearanceSettingsRepository,
        json_settings_repository::JsonSettingsRepository,
        json_terminal_settings_repository::JsonTerminalSettingsRepository,
    },
    ports::settings_repository::{
        AppearanceSettingsRepository, SettingsRepository, TerminalSettingsRepository,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};

pub struct ServerSettings {
    security: JsonSettingsRepository,
    appearance: JsonAppearanceSettingsRepository,
    terminal: JsonTerminalSettingsRepository,
}
impl ServerSettings {
    pub fn new(root: &Path) -> Self {
        Self {
            security: JsonSettingsRepository::new(root.join("data/settings.json")),
            appearance: JsonAppearanceSettingsRepository::new(root.join("device/appearance.json")),
            terminal: JsonTerminalSettingsRepository::new(root.join("data/terminal-settings.json")),
        }
    }
    pub fn security(&self) -> SecuritySettings {
        self.security.load().ok().flatten().unwrap_or_default()
    }
    pub fn terminal(&self) -> TerminalSettings {
        self.terminal.load().ok().flatten().unwrap_or_default()
    }
    fn snapshot(&self, root: &Path) -> Value {
        let security = self.security();
        let terminal = self.terminal();
        let appearance = self.appearance.load().ok().flatten().unwrap_or_default();
        let warning = self.security.load().is_err()
            || self.appearance.load().is_err()
            || self.terminal.load().is_err();
        json!({"general":{"rootDirectory":root,"defaultRootDirectory":root,"activeRootDirectory":root,"dataDirectory":root.join("data"),"deviceDirectory":root.join("device"),"cacheDirectory":root.join("cache"),"restartRequired":false},"security":{"credentialAutoLockAfterSeconds":security.credential_auto_lock_after_seconds,"terminalAutoLockAfterSeconds":security.terminal_auto_lock_after_seconds},"appearance":{"theme":match appearance.theme{AppTheme::Dark=>"dark",AppTheme::Light=>"light",AppTheme::Cyberpunk=>"cyberpunk"}},"updates":{"autoCheckOnStartup":false},"terminal":{"remoteShellIntegrationEnabled":terminal.remote_shell_integration_enabled,"historyFreeBashEnabled":terminal.history_free_bash_enabled},"warning":if warning{Some("storageUnavailable")}else{None}})
    }
}
pub async fn get(State(state): State<Arc<ServerState>>) -> Json<Value> {
    Json(state.settings.snapshot(&state.config.data))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Security {
    credential_auto_lock_after_seconds: Option<u32>,
    terminal_auto_lock_after_seconds: Option<u32>,
}
pub async fn security(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Security>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let value = SecuritySettings::new(
        input.credential_auto_lock_after_seconds,
        input.terminal_auto_lock_after_seconds,
    )
    .map_err(|_| ApiError::invalid())?;
    state
        .settings
        .security
        .save(value)
        .map_err(|_| ApiError::storage())?;
    match state.vault.reschedule(value) {
        Reschedule::None => {}
        Reschedule::LockNow => {
            state.vault.lock(LockReason::Timeout);
        }
        Reschedule::Schedule(schedule) => crate::vault::schedule_lock(&state, Some(schedule)),
    }
    Ok(Json(state.settings.snapshot(&state.config.data)))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Appearance {
    theme: String,
}
pub async fn appearance(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Appearance>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let theme = match input.theme.as_str() {
        "dark" => AppTheme::Dark,
        "light" => AppTheme::Light,
        "cyberpunk" => AppTheme::Cyberpunk,
        _ => return Err(ApiError::invalid()),
    };
    state
        .settings
        .appearance
        .save(AppearanceSettings { theme })
        .map_err(|_| ApiError::storage())?;
    Ok(Json(state.settings.snapshot(&state.config.data)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Terminal {
    remote_shell_integration_enabled: Option<bool>,
    history_free_bash_enabled: Option<bool>,
}
pub async fn terminal(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Terminal>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let mut value = state.settings.terminal();
    if let Some(enabled) = input.remote_shell_integration_enabled {
        value.remote_shell_integration_enabled = enabled;
    }
    if let Some(enabled) = input.history_free_bash_enabled {
        value.history_free_bash_enabled = enabled;
    }
    state
        .settings
        .terminal
        .save(value)
        .map_err(|_| ApiError::storage())?;
    Ok(Json(state.settings.snapshot(&state.config.data)))
}
