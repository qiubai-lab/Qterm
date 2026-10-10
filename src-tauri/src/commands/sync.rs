use crate::{
    application::sync_service::{SyncService, SyncStatus},
    infrastructure::{
        persistence::json_profile_repository::JsonProfileRepository,
        sync::{device::DeviceStore, http::HttpSync},
    },
    ports::sync::{SyncDeviceStore, SyncSettings},
};
use qterm_sync_core::Resolution;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

type Service = SyncService<JsonProfileRepository, DeviceStore, HttpSync>;
pub struct SyncState(Mutex<Service>);

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SettingsInput {
    enabled: bool,
    server_url: String,
    allow_insecure_http: bool,
    token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncView {
    enabled: bool,
    server_url: String,
    allow_insecure_http: bool,
    has_token: bool,
    status: SyncStatus,
}

impl SyncState {
    pub fn install(
        app: &tauri::App,
        repository: JsonProfileRepository,
        device: std::path::PathBuf,
    ) {
        app.manage(Self(Mutex::new(SyncService::new(
            repository,
            DeviceStore::new(device),
            HttpSync,
        ))));
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            let mut delay = 5;
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                let state = handle.state::<SyncState>();
                let Ok(mut service) = state.0.try_lock() else {
                    continue;
                };
                if !service.status.conflicts.is_empty() {
                    continue;
                }
                match service.run(None).await {
                    Ok(_) => {
                        delay = 30;
                    }
                    Err(_) => {
                        delay = (delay * 2).clamp(30, 300);
                    }
                }
                if service.take_local_change() {
                    let _ = handle.emit("sync-profiles-changed", ());
                }
            }
        });
    }
}

fn view(service: &Service) -> Result<SyncView, String> {
    let settings = service.device.settings()?;
    Ok(SyncView {
        enabled: settings.enabled,
        server_url: settings.server_url,
        allow_insecure_http: settings.allow_insecure_http,
        has_token: !settings.token_id.is_empty(),
        status: service.status.clone(),
    })
}

#[tauri::command]
pub async fn sync_get(state: State<'_, SyncState>) -> Result<SyncView, String> {
    view(&*state.0.lock().await)
}

#[tauri::command]
pub async fn sync_configure(
    input: SettingsInput,
    state: State<'_, SyncState>,
) -> Result<SyncView, String> {
    let token = input.token.map(zeroize::Zeroizing::new);
    let mut service = state.0.lock().await;
    service.configure(
        SyncSettings {
            enabled: input.enabled,
            server_url: input.server_url,
            allow_insecure_http: input.allow_insecure_http,
            token_id: String::new(),
        },
        token.as_ref().map(|v| v.as_str()),
    )?;
    view(&service)
}

#[tauri::command]
pub async fn sync_run(
    conflict_token: Option<String>,
    resolution: Option<Resolution>,
    app: tauri::AppHandle,
    state: State<'_, SyncState>,
) -> Result<SyncView, String> {
    let choice = match (conflict_token, resolution) {
        (Some(token), Some(choice)) => Some((token, choice)),
        (None, None) => None,
        _ => return Err("冲突处理参数无效".into()),
    };
    let mut service = state.0.lock().await;
    // Return the status also on synchronization failure, so conflict details remain visible.
    let _ = service.run(choice).await;
    if service.take_local_change() {
        let _ = app.emit("sync-profiles-changed", ());
    }
    view(&service)
}
