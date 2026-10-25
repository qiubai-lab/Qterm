//! Bounded, memory-only previews for host-owned modal covers. Guest authority is unchanged.
use super::WebHost;
use crate::infrastructure::ssh::client::SshSessionManager;
#[cfg(windows)]
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct WebSnapshot {
    url: String,
    png: String,
}

impl WebHost {
    pub async fn snapshot(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<WebSnapshot, String> {
        #[cfg(not(windows))]
        {
            let _ = (app, sessions, id);
            Err("当前系统不支持网页预览".into())
        }
        #[cfg(windows)]
        {
            let label = super::label(id)?;
            let view = {
                let guests = self.guests.lock().await;
                let guest = guests.get(&label).ok_or("网页已关闭")?;
                if !guest.visible || !sessions.web_session_connected(&guest.session) {
                    return Err("网页不可预览".into());
                }
                app.get_webview(&label).ok_or("网页已关闭")?
            };
            let url = view.url().map_err(|_| "无法读取网页地址")?.to_string();
            let png = super::windows_snapshot::capture(&view).await?;
            if view.url().map_err(|_| "网页已关闭")?.as_str() != url {
                return Err("网页已跳转".into());
            }
            Ok(WebSnapshot { url, png })
        }
    }
}
