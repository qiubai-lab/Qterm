use super::error::IpcError;
use crate::ports::notification::{NotificationDeliveryError, NotificationMessage};
use crate::{
    application::notification_service::NotificationService,
    infrastructure::{
        notifications::DesktopNotifications,
        persistence::json_notification_settings_repository::JsonNotificationSettingsRepository,
    },
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

pub struct NotificationState(Arc<Mutex<NotificationService<JsonNotificationSettingsRepository>>>);
impl NotificationState {
    pub fn new(path: PathBuf) -> Self {
        Self(Arc::new(Mutex::new(NotificationService::new(
            JsonNotificationSettingsRepository::new(path.clone()),
            JsonNotificationSettingsRepository::with_default(
                path.with_file_name("notification-content.json"),
                false,
            ),
        ))))
    }
}
#[tauri::command]
pub async fn notification_settings_get(
    state: tauri::State<'_, NotificationState>,
) -> Result<bool, IpcError> {
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|_| unavailable())?
            .enabled()
            .map_err(Into::into)
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub async fn notification_settings_update(
    enabled: bool,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), IpcError> {
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|_| unavailable())?
            .update(enabled)
            .map_err(Into::into)
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub async fn terminal_notification_send(
    app: tauri::AppHandle,
    source: String,
    body: String,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), IpcError> {
    let state = state.0.clone();
    // Native callbacks must never block the UI thread. Serialize with disabling.
    tauri::async_runtime::spawn_blocking(move || state.lock().map_err(|_| unavailable())?.send(&DesktopNotifications::new(app), Instant::now(), &NotificationMessage { title: source, body }).map_err(|error| match error {
        NotificationDeliveryError::PermissionDenied => IpcError::new("notificationPermissionDenied", "系统通知未获授权，请在 macOS 系统设置 → 通知中允许 Qterm（开发版为 Qterm Dev）发送通知", true),
        NotificationDeliveryError::Unavailable => unavailable(),
                NotificationDeliveryError::Native { domain, code } => {
            eprintln!("Native notification error: {domain} ({code})");
            IpcError::new("notificationNativeError", "系统拒绝了通知请求，请检查应用签名与系统通知授权", true)
        },
    })).await.map_err(|_| unavailable())?
}
fn unavailable() -> IpcError {
    IpcError::new(
        "notificationUnavailable",
        "系统通知发送失败，请检查通知权限后重试",
        true,
    )
}

#[tauri::command]
pub async fn notification_body_settings_get(
    state: tauri::State<'_, NotificationState>,
) -> Result<bool, IpcError> {
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|_| unavailable())?
            .body_enabled()
            .map_err(Into::into)
    })
    .await
    .map_err(|_| unavailable())?
}
#[tauri::command]
pub async fn notification_body_settings_update(
    enabled: bool,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), IpcError> {
    let state = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|_| unavailable())?
            .update_body(enabled)
            .map_err(Into::into)
    })
    .await
    .map_err(|_| unavailable())?
}
