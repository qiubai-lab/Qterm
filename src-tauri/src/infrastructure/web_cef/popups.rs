use super::{WebHost, WebTarget};
use crate::infrastructure::ssh::client::SshSessionManager;
use std::sync::Arc;
use tauri::Manager;
pub(super) fn handler(
    app: &tauri::AppHandle,
    label: &str,
) -> impl Fn(
    tauri::Url,
    tauri::webview::NewWindowFeatures<tauri::EventLoopMessage, tauri::DynRuntime>,
) -> tauri::webview::NewWindowResponse<tauri::DynRuntime>
+ Send
+ Sync
+ 'static {
    let origin = app
        .get_webview("main")
        .and_then(|v| v.url().ok())
        .map(|u| u.origin());
    let _ = label;
    move |url, _| {
        if (url.as_str() == "about:blank" || crate::domain::web::allowed_web_url(url.as_str()))
            && origin.as_ref().is_none_or(|o| *o != url.origin())
        {
            tauri::webview::NewWindowResponse::Allow
        } else {
            tauri::webview::NewWindowResponse::Deny
        }
    }
}
impl WebHost {
    pub async fn accept_popup(
        &self,
        _app: &tauri::AppHandle,
        _sessions: &Arc<SshSessionManager>,
        _id: &str,
        _request: &str,
    ) -> Result<WebTarget, String> {
        Err("CEF 原生弹窗不能接管为标签".into())
    }
}
pub async fn reject_popup(_app: &tauri::AppHandle, _request: &str) -> Result<(), String> {
    Ok(())
}
