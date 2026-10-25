//! Adopt native popup requests through the same guest/environment ownership as normal pages.
use super::{WebHost, WebTarget};
use crate::infrastructure::ssh::client::SshSessionManager;
use std::sync::Arc;

impl WebHost {
    pub async fn accept_popup(
        &self,
        app: &tauri::AppHandle,
        sessions: &Arc<SshSessionManager>,
        id: &str,
        request: &str,
    ) -> Result<WebTarget, String> {
        #[cfg(any(windows, target_os = "macos"))]
        {
            let result = self.adopt_popup(app, sessions, id, request).await;
            if result.is_err() {
                let _ = reject_popup(app, request).await;
            }
            result
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = (app, sessions, id, request);
            Err("内部浏览器需要 Windows 或 macOS 14 及以上版本".into())
        }
    }

    #[cfg(any(windows, target_os = "macos"))]
    async fn adopt_popup(
        &self,
        app: &tauri::AppHandle,
        sessions: &Arc<SshSessionManager>,
        id: &str,
        request: &str,
    ) -> Result<WebTarget, String> {
        use super::{Guest, label, profile_gateway::Route};
        use tauri::Manager;
        let label = label(id)?;
        #[cfg(windows)]
        let source = super::windows_popups::source(app, request).await?;
        #[cfg(target_os = "macos")]
        let source = super::macos::request(
            app,
            serde_json::json!({"op":"popupSource","request":request}),
        )
        .await?
        .as_str()
        .ok_or("新窗口请求已失效")?
        .to_owned();
        let mut guests = self.guests.lock().await;
        let source = guests.get(&source).ok_or("来源网页已关闭")?;
        if !source.target.connected(sessions) {
            return Err("SSH 已断开，请重新连接".into());
        }
        if guests.contains_key(&label) {
            return Err("网页已打开".into());
        }
        crate::domain::web::ensure_web_page_capacity(guests.len())?;
        let (target, key) = (source.target.clone(), source.environment.clone());
        let environments = self.environments.lock().await;
        let environment = environments.get(&key).ok_or("来源浏览环境已关闭")?;
        if let WebTarget::Remote {
            session_id,
            profile_id,
        } = &target
        {
            let port = sessions
                .start_web_proxy(
                    session_id,
                    profile_id,
                    &super::lifecycle::proxy_owner(session_id),
                )
                .await
                .map_err(|_| "来源连接已断开")?;
            environment
                .gateway
                .as_ref()
                .ok_or("远程浏览环境无效")?
                .add(
                    label.clone(),
                    Route {
                        session: session_id.clone(),
                        port,
                    },
                )
                .await;
        }
        #[cfg(windows)]
        let result = super::windows::create_popup(
            app,
            &label,
            request,
            environment.gateway.as_ref().map(|gateway| gateway.port),
            &environment.directory,
        )
        .await;
        #[cfg(target_os = "macos")]
        let result = super::macos::request(
            app,
            serde_json::json!({"op":"adopt","id":label,"request":request}),
        )
        .await
        .map(|_| ());
        if let Err(error) = result {
            if let Some(gateway) = &environment.gateway {
                gateway.remove(&label).await;
            }
            if let Some(view) = app.get_webview(&label) {
                let _ = view.close();
            }
            return Err(error);
        }
        guests.insert(
            label,
            Guest {
                target: target.clone(),
                environment: key,
                #[cfg(not(target_os = "macos"))]
                geometry: None,
                visible: false,
            },
        );
        Ok(target)
    }
}

pub async fn reject_popup(app: &tauri::AppHandle, request: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return super::macos::request(app, serde_json::json!({"op":"reject","request":request}))
        .await
        .map(|_| ());
    #[cfg(windows)]
    {
        super::windows_popups::reject(app, request).await
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (app, request);
        Ok(())
    }
}
