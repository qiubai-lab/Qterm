//! Selective browser-context clearing, after quiescing every page in that environment.
use super::{WebHost, label};
use crate::{
    domain::web_storage::ClearBrowserData, infrastructure::ssh::client::SshSessionManager,
};
use serde_json::json;
use tauri::Manager;

impl WebHost {
    pub async fn clear_data(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
        selection: ClearBrowserData,
    ) -> Result<(), String> {
        selection.validate()?;
        // CDP only clears named origins. Treating open origins as the entire
        // profile would silently retain data from closed tabs and workers.
        if selection.storage {
            return Err("当前 CEF alpha 暂不支持完整清理站点存储；本次未修改数据。可单独清理 Cookie 或 HTTP 缓存。".into());
        }
        let label = label(id)?;
        let state = self.state.lock().await;
        let guest = state.guests.get(&label).ok_or("请先打开网页再清理数据")?;
        if !guest.target.connected(sessions) {
            return Err("SSH 已断开".into());
        }
        let pages: Vec<_> = state
            .guests
            .iter()
            .filter(|(_, g)| g.environment == guest.environment)
            .map(|(label, g)| {
                app.get_webview(label).ok_or("网页已关闭").and_then(|view| {
                    view.url()
                        .map(|url| (view, g.protocol.clone(), url))
                        .map_err(|_| "网页已关闭")
                })
            })
            .collect::<Result<_, _>>()?;
        let (view, protocol, _) = pages.first().ok_or("网页已关闭")?;
        let result: Result<(), String> = async {
            for (view, protocol, _) in &pages {
                protocol
                    .call(view, "Page.navigate", json!({"url":"about:blank"}))
                    .await?;
                let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
                loop {
                    let reply = protocol
                        .call(
                            view,
                            "Runtime.evaluate",
                            json!({"expression":"location.href","returnByValue":true}),
                        )
                        .await?;
                    if reply["result"]["value"] == "about:blank" {
                        break;
                    }
                    if tokio::time::Instant::now() >= deadline {
                        return Err("页面暂停超时，未清理数据".into());
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                }
            }
            if selection.cookies {
                protocol
                    .call(view, "Network.clearBrowserCookies", json!({}))
                    .await?;
            }
            if selection.cache {
                protocol
                    .call(view, "Network.clearBrowserCache", json!({}))
                    .await?;
            }
            Ok(())
        }
        .await;
        let mut restore_error = None;
        for (view, _, url) in pages {
            if let Err(error) = view.navigate(url) {
                restore_error = Some(error.to_string());
            }
        }
        result?;
        restore_error.map_or(Ok(()), |error| {
            Err(format!("数据已清理，但页面恢复失败：{error}"))
        })
    }
}
