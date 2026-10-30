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
        // The pinned runtime admits only native user gestures before invoking this handler.
        if crate::domain::web::allow_popup(
            url.as_str(),
            true,
            origin.as_ref().is_some_and(|o| *o == url.origin()),
        )
        .is_ok()
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
        app: &tauri::AppHandle,
        sessions: &Arc<SshSessionManager>,
        id: &str,
        request: &str,
    ) -> Result<WebTarget, String> {
        use tauri_runtime_cef::cef::*;
        let label = super::label(id)?;
        let mut state = self.state.lock().await;
        if state.guests.contains_key(&label) {
            return Err("网页标识已存在".into());
        }
        let pending = state
            .pending_popups
            .remove(request)
            .ok_or("弹窗请求已失效")?;
        let result = async {
            crate::domain::web::ensure_web_page_capacity(state.guests.len())?;
            let source = state.guests.get(&pending.source).ok_or("来源网页已关闭")?;
            if source.closing.is_some() || !source.target.connected(sessions) {
                return Err("来源连接已关闭".into());
            }
            let target = source.target.clone();
            let environment = source.environment.clone();
            let context = state
                .environments
                .get(&environment)
                .filter(|e| !e.retiring)
                .and_then(|e| e.context.clone())
                .ok_or("浏览环境已关闭")?;
            let browser = pending.browser.clone();
            super::native::on_ui(app, move || {
                if browser.is_valid() == 0 {
                    return Err("弹窗已关闭".into());
                }
                let actual = browser
                    .host()
                    .and_then(|h| h.request_context())
                    .ok_or("弹窗环境缺失")?;
                let mut expected = context;
                if actual.is_same(Some(&mut expected)) == 0 {
                    return Err("弹窗环境不匹配".into());
                }
                Ok(())
            })
            .await?;
            let protocol =
                super::protocol::Protocol::install_popup(app, pending.browser.clone()).await?;
            let navigation = super::navigation::Navigation::new(app, &label);
            navigation.start(pending.url.clone());
            for event in &pending.events {
                super::popup_events::navigation(&navigation, event);
            }
            let guest = super::Guest {
                popup: Some(pending.browser.clone()),
                target: target.clone(),
                environment,
                visible: false,
                protocol,
                navigation,
                closing: None,
            };
            let view = guest.view(app, &label)?;
            let script = format!(
                "{};{}",
                super::scrollbars::script(None),
                include_str!("../web/metrics_script.mjs")
            );
            guest
                .protocol
                .call_view(
                    &view,
                    "Page.addScriptToEvaluateOnNewDocument",
                    serde_json::json!({"source":script}),
                )
                .await?;
            view.eval(script).await?;
            state.guests.insert(label, guest);
            Ok(target)
        }
        .await;
        if result.is_err() {
            drop(state);
            super::popup_events::close(app, pending.browser).await?;
        }
        result
    }
}
pub async fn reject_popup(app: &tauri::AppHandle, request: &str) -> Result<(), String> {
    let pending = app
        .state::<WebHost>()
        .state
        .lock()
        .await
        .pending_popups
        .remove(request);
    if let Some(pending) = pending {
        super::popup_events::close(app, pending.browser).await?;
    }
    Ok(())
}
