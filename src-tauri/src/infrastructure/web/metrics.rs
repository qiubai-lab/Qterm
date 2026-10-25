//! Read only aggregate telemetry via a fixed script; the guest cannot invoke host commands.
use super::WebHost;
use crate::infrastructure::ssh::client::SshSessionManager;
#[cfg(not(target_os = "macos"))]
use tauri::Manager;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebMetrics {
    url: String,
    document_id: f64,
    resources: u32,
    load_ms: u64,
}

fn parse(value: &str) -> Option<WebMetrics> {
    if value.len() > 16384 {
        return None;
    }
    let metrics: WebMetrics = serde_json::from_str(value).ok()?;
    (metrics.url.len() <= 8192
        && crate::domain::web::allowed_web_url(&metrics.url)
        && metrics.document_id.is_finite()
        && metrics.document_id > 0.0
        && metrics.resources <= 1_000_000
        && metrics.load_ms <= 86_400_000)
        .then_some(metrics)
}

#[cfg(not(target_os = "macos"))]
pub(super) async fn sample(view: &tauri::Webview) -> Result<Option<WebMetrics>, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let send = std::sync::Mutex::new(Some(send));
    view.eval_with_callback("window.__qtermPageMetrics?.() ?? null", move |value| {
        if let Ok(mut sender) = send.lock()
            && let Some(sender) = sender.take()
        {
            let _ = sender.send(parse(&value));
        }
    })
    .map_err(|_| "无法读取网页统计")?;
    tokio::time::timeout(std::time::Duration::from_secs(2), receive)
        .await
        .map_err(|_| "网页统计超时".to_owned())?
        .map_err(|_| "网页已关闭".to_owned())
}

impl WebHost {
    pub async fn metrics(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<Option<WebMetrics>, String> {
        #[cfg(not(target_os = "macos"))]
        let view = self.metrics_view(app, sessions, id).await?;
        #[cfg(not(target_os = "macos"))]
        return sample(&view).await;
        #[cfg(target_os = "macos")]
        {
            let label = super::label(id)?;
            let guests = self.guests.lock().await;
            let guest = guests.get(&label).ok_or("网页已关闭")?;
            if !guest.target.connected(sessions) {
                return Err("SSH 已断开".into());
            }
            let value =
                super::macos::eval(app, &label, "window.__qtermPageMetrics?.() ?? null").await?;
            Ok(parse(&value.to_string()))
        }
    }
    #[cfg(not(target_os = "macos"))]
    async fn metrics_view(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<tauri::Webview, String> {
        let label = super::label(id)?;
        let view = {
            let guests = self.guests.lock().await;
            let guest = guests.get(&label).ok_or("网页已关闭")?;
            if !guest.target.connected(sessions) {
                return Err("SSH 已断开".into());
            }
            app.get_webview(&label).ok_or("网页已关闭")?
        };
        Ok(view)
    }
}

#[cfg(test)]
mod tests {
    use super::parse;
    #[test]
    fn rejects_missing_malformed_or_unbounded_guest_metrics() {
        let valid =
            r#"{"url":"https://example.com/","documentId":1000,"resources":3,"loadMs":120}"#;
        assert_eq!(parse(valid).unwrap().resources, 3);
        for invalid in [
            "null".to_owned(),
            "{}".into(),
            valid.replace(":3,", ":-1,"),
            valid.replace(":3,", ":1000001,"),
            valid.replace("https://example.com/", "file:///secret"),
            valid.replace(":1000,", ":0,"),
        ] {
            assert!(parse(&invalid).is_none());
        }
    }
}
