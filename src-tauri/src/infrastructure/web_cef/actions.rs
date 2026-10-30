use super::{WebHost, label, page};
use crate::infrastructure::ssh::client::SshSessionManager;
use tauri_runtime_cef::cef::*;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebMetrics {
    url: String,
    document_id: f64,
    resources: u32,
    load_ms: u64,
}
#[derive(serde::Serialize, serde::Deserialize)]
pub struct WebSnapshot {
    url: String,
    png: String,
}
impl WebHost {
    pub async fn action(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
        action: &str,
        address: Option<&str>,
    ) -> Result<(), String> {
        let label = label(id)?;
        let state = self.state.lock().await;
        let guest = state.guests.get(&label).ok_or("网页已关闭")?;
        if !guest.target.connected(sessions) {
            return Err("SSH 已断开，请重新连接".into());
        }
        let view = guest.view(app, &label)?;
        if action == "navigate" {
            let url: tauri::Url = address
                .ok_or("请输入地址")?
                .parse()
                .map_err(|_| "网页地址无效")?;
            if !page::allowed(app, &url) {
                return Err("仅支持外部 HTTP/HTTPS 地址".into());
            }
            return view.navigate(url).await;
        }
        if action == "stop" {
            guest.navigation.stop();
        }
        let action = action.to_owned();
        view.with(move |browser| {
            match action.as_str() {
                "reload" => browser.reload(),
                "stop" => browser.stop_load(),
                "back" => browser.go_back(),
                "forward" => browser.go_forward(),
                _ => return Err("未知网页操作".into()),
            }
            Ok(())
        })
        .await
    }
    pub async fn metrics(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<Option<WebMetrics>, String> {
        let label = label(id)?;
        let state = self.state.lock().await;
        let guest = state.guests.get(&label).ok_or("网页已关闭")?;
        if !guest.target.connected(sessions) {
            return Err("SSH 已断开".into());
        }
        let view = guest.view(app, &label)?;
        let value = guest.protocol.call_view(&view, "Runtime.evaluate", serde_json::json!({"expression":"window.__qtermPageMetrics?.() ?? null", "returnByValue":true})).await?;
        let metrics: Option<WebMetrics> =
            serde_json::from_value(value["result"]["value"].clone()).map_err(|_| "网页统计无效")?;
        Ok(metrics.filter(|m| {
            crate::domain::web::allowed_web_url(&m.url)
                && m.document_id.is_finite()
                && m.document_id > 0.0
                && m.resources <= 1_000_000
                && m.load_ms <= 86_400_000
        }))
    }
    pub async fn snapshot(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<WebSnapshot, String> {
        let label = label(id)?;
        let state = self.state.lock().await;
        let guest = state.guests.get(&label).ok_or("网页已关闭")?;
        if !guest.visible || !guest.target.connected(sessions) {
            return Err("网页不可预览".into());
        }
        let view = guest.view(app, &label)?;
        let url = view.url().await?.to_string();
        let result = guest
            .protocol
            .call_view(
                &view,
                "Page.captureScreenshot",
                serde_json::json!({"format":"png","captureBeyondViewport":false}),
            )
            .await?;
        let png = result["data"]
            .as_str()
            .filter(|p| p.len() < 16 * 1024 * 1024)
            .ok_or("网页预览无效")?
            .to_owned();
        if view.url().await?.as_str() != url {
            return Err("网页已跳转".into());
        }
        Ok(WebSnapshot { url, png })
    }
}
