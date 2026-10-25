use crate::{
    commands::session::SessionState,
    infrastructure::web::{WebBounds, WebHost, WebMetrics, WebTarget},
};
use tauri::{AppHandle, Manager, State};

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
        .await?;
    watch_connection(app, sessions.manager().clone(), input.id, input.target);
    Ok(())
}

#[tauri::command]
pub async fn web_accept_popup(
    app: AppHandle,
    state: State<'_, WebHost>,
    sessions: State<'_, SessionState>,
    id: String,
    request: String,
) -> Result<(), String> {
    let target = state
        .accept_popup(&app, sessions.manager(), &id, &request)
        .await?;
    watch_connection(app, sessions.manager().clone(), id, target);
    Ok(())
}

#[tauri::command]
pub async fn web_reject_popup(app: AppHandle, request: String) -> Result<(), String> {
    crate::infrastructure::web::reject_popup(&app, &request).await
}

fn watch_connection(
    app: AppHandle,
    manager: std::sync::Arc<crate::infrastructure::ssh::client::SshSessionManager>,
    id: String,
    target: WebTarget,
) {
    let Some(session_id) = target.session().map(str::to_owned) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        while app.state::<WebHost>().contains(&id).await {
            if !manager.web_session_connected(&session_id) {
                let _ = app.state::<WebHost>().close(&app, &manager, &id).await;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    });
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
    serde_json::json!({"local": crate::infrastructure::web::supported(), "remote": crate::infrastructure::web::remote_supported(), "tunnelAddressMapping": cfg!(target_os = "macos")})
}
