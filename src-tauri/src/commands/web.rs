use crate::{
    commands::session::SessionState,
    infrastructure::web::{WebBounds, WebHost, WebMetrics, WebTarget},
};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn web_clear_data(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
    selection: crate::domain::web_storage::ClearBrowserData,
) -> Result<(), String> {
    state
        .clear_data(&app, sessions.manager(), &id, selection)
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenWeb {
    id: String,
    target: WebTarget,
    url: String,
}

#[tauri::command]
pub async fn web_open(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    input: OpenWeb,
) -> Result<(), String> {
    state
        .open(
            &app,
            sessions.manager(),
            &input.id,
            &input.target,
            &input.url,
        )
        .await
}

#[tauri::command]
pub async fn web_accept_popup(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
    request: String,
) -> Result<(), String> {
    state
        .accept_popup(&app, sessions.manager(), &id, &request)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn web_reject_popup(app: AppHandle, request: String) -> Result<(), String> {
    crate::infrastructure::web::reject_popup(&app, &request).await
}

#[tauri::command]
pub async fn web_close(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
) -> Result<(), String> {
    state.close(&app, sessions.manager(), &id).await
}

#[tauri::command]
pub async fn web_metrics(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
) -> Result<Option<WebMetrics>, String> {
    state.metrics(&app, sessions.manager(), &id).await
}

#[tauri::command]
pub async fn web_snapshot(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
) -> Result<crate::infrastructure::web::WebSnapshot, String> {
    state.snapshot(&app, sessions.manager(), &id).await
}

#[tauri::command]
pub async fn web_sync(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
    bounds: WebBounds,
) -> Result<(), String> {
    state.sync(&app, sessions.manager(), &id, bounds).await
}

#[tauri::command]
pub async fn web_action(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
    action: String,
    url: Option<String>,
) -> Result<(), String> {
    state
        .action(&app, sessions.manager(), &id, &action, url.as_deref())
        .await
}

#[tauri::command]
pub fn web_supported() -> serde_json::Value {
    serde_json::json!({"local": crate::infrastructure::web::supported(), "remote": crate::infrastructure::web::remote_supported(), "tunnelAddressMapping": false})
}

/// Called by the trusted main UI after persistence flush and before window destruction.
#[tauri::command]
pub async fn web_shutdown(app: AppHandle, state: State<'_, WebHost>) -> Result<(), String> {
    state.shutdown(&app).await
}
