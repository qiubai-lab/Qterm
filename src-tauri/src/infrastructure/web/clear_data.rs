use super::WebHost;
use crate::{
    domain::web_storage::ClearBrowserData, infrastructure::ssh::client::SshSessionManager,
};
#[cfg(not(target_os = "macos"))]
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
        let label = super::label(id)?;
        let guests = self.guests.lock().await;
        let guest = guests.get(&label).ok_or("请先打开网页再清理此连接数据")?;
        if !guest.target.connected(sessions) {
            return Err("SSH 已断开".into());
        }
        #[cfg(target_os = "macos")]
        return super::macos::request(
            app,
            serde_json::json!({"op":"clear","id":label,"selection":selection}),
        )
        .await
        .map(|_| ());
        #[cfg(not(target_os = "macos"))]
        {
            let views: Vec<_> = guests
                .iter()
                .filter(|(_, g)| g.environment == guest.environment)
                .filter_map(|(label, _)| app.get_webview(label))
                .collect();
            clear_views(&views, selection).await
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub(super) async fn clear_views(
    views: &[tauri::Webview],
    selection: ClearBrowserData,
) -> Result<(), String> {
    selection.validate()?;
    let view = views.first().ok_or("网页已关闭")?;
    let originals: Vec<_> = views
        .iter()
        .map(|page| page.url().map_err(|_| "无法保存网页地址".to_owned()))
        .collect::<Result<_, _>>()?;
    let result = async {
        for page in views {
            #[cfg(windows)]
            super::windows_navigation::stop(page).await?;
            page.eval("location.replace('about:blank')")
                .map_err(|_| "无法暂停网页，请重试")?;
            wait_blank(page).await?;
        }
        #[cfg(windows)]
        return super::windows_data::clear(view, selection).await;
        #[cfg(not(windows))]
        {
            let _ = (view, selection);
            Err("当前平台不支持浏览数据清理".into())
        }
    }
    .await;
    let mut restore_failed = false;
    for (page, url) in views.iter().zip(originals) {
        let address = serde_json::to_string(url.as_str()).map_err(|_| "无法恢复网页")?;
        restore_failed |= page.eval(format!("location.replace({address})")).is_err();
    }
    if result.is_ok() && restore_failed {
        return Err("数据已清理，部分页面需要手动刷新".into());
    }
    result
}

#[cfg(not(target_os = "macos"))]
async fn wait_blank(page: &tauri::Webview) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    for _ in 0..30 {
        let (send, receive) = tokio::sync::oneshot::channel();
        let sender = std::sync::Mutex::new(Some(send));
        page.eval_with_callback("location.href === 'about:blank'", move |result| {
            if let Some(send) = sender.lock().unwrap_or_else(|p| p.into_inner()).take() {
                let _ = send.send(result == "true");
            }
        })
        .map_err(|_| "无法暂停网页")?;
        if tokio::time::timeout_at(deadline, receive)
            .await
            .map_err(|_| "网页暂停超时，尚未清理数据")?
            .ok()
            == Some(true)
        {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("网页暂停超时，尚未清理数据".into())
}
