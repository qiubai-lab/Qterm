use crate::{
    commands::session::SessionState,
    infrastructure::web::{WebBounds, WebHost, WebMetrics},
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
    session_id: String,
    profile_id: String,
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
            &input.session_id,
            &input.profile_id,
            &input.url,
        )
        .await?;
    let manager = sessions.manager().clone();
    tauri::async_runtime::spawn(async move {
        while app.get_webview(&format!("web-{}", input.id)).is_some() {
            if !manager.web_session_connected(&input.session_id) {
                let _ = app
                    .state::<WebHost>()
                    .close(&app, &manager, &input.id)
                    .await;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    });
    Ok(())
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
