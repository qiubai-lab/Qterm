use super::{
    Environment, Guest, WebHost, label,
    profile_gateway::{ProfileGateway, Route},
    profile_storage,
};
use crate::infrastructure::ssh::client::SshSessionManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

impl WebHost {
    pub async fn open(
        &self,
        app: &AppHandle,
        sessions: &Arc<SshSessionManager>,
        id: &str,
        session: &str,
        profile: &str,
        address: &str,
    ) -> Result<(), String> {
        let label = label(id)?;
        let url: tauri::Url = address.parse().map_err(|_| "网页地址无效")?;
        if !crate::domain::web::allowed_web_url(url.as_str()) {
            return Err("仅支持不含用户名或密码的 HTTP/HTTPS 地址".into());
        }
        if !cfg!(windows) {
            return Err("Web Block 目前仅支持 Windows".into());
        }
        let identity = sessions
            .web_browser_identity(session, profile)
            .map_err(|_| "连接身份不匹配或已断开")?;
        let key = serde_json::to_string(&identity).map_err(|_| "浏览连接身份无效")?;
        // All lifecycle/clearing paths acquire guests before environments.
        let mut guests = self.guests.lock().await;
        if guests.contains_key(&label) {
            return Err("网页已打开".into());
        }
        if guests.len() >= 16 {
            return Err("最多同时打开 16 个网页，请先关闭部分网页".into());
        }
        let mut environments = self.environments.lock().await;
        if !environments.contains_key(&key) {
            let root = self.root.clone();
            let directory =
                tokio::task::spawn_blocking(move || profile_storage::resolve(&root, &identity))
                    .await
                    .map_err(|_| "浏览环境初始化失败")??;
            let manager = sessions.clone();
            let gateway =
                ProfileGateway::new(Arc::new(move |id| manager.web_session_connected(id))).await?;
            environments.insert(key.clone(), Environment { directory, gateway });
        }
        let environment = environments.get(&key).ok_or("浏览环境不存在")?;
        let port = sessions
            .start_web_proxy(session, profile, &proxy_owner(session))
            .await
            .map_err(|_| "无法启动网页代理，请重新连接")?;
        environment
            .gateway
            .add(
                label.clone(),
                Route {
                    session: session.into(),
                    port,
                },
            )
            .await;
        #[cfg(windows)]
        let result = super::windows::create_persistent(
            app,
            &label,
            environment.gateway.port,
            url,
            &environment.directory,
        );
        #[cfg(not(windows))]
        let result: Result<(), String> = {
            let _ = (app, url, &environment.directory, environment.gateway.port);
            Err("Web Block 目前仅支持 Windows".into())
        };
        match result {
            Ok(()) => {
                guests.insert(
                    label,
                    Guest {
                        session: session.into(),
                        environment: key,
                        geometry: None,
                        visible: false,
                    },
                );
                Ok(())
            }
            Err(error) => {
                environment.gateway.remove(&label).await;
                if !guests.values().any(|guest| guest.session == session) {
                    let _ = sessions
                        .stop_network_rule(session, proxy_owner(session))
                        .await;
                }
                Err(error)
            }
        }
    }

    pub async fn close(
        &self,
        app: &AppHandle,
        sessions: &SshSessionManager,
        id: &str,
    ) -> Result<(), String> {
        let label = label(id)?;
        let mut guests = self.guests.lock().await;
        if let Some(view) = app.get_webview(&label) {
            view.close().map_err(|_| "无法关闭网页")?;
        }
        if let Some(guest) = guests.remove(&label) {
            if let Some(environment) = self.environments.lock().await.get(&guest.environment) {
                environment.gateway.remove(&label).await;
            }
            // A shared browser connection may carry requests from another tab.
            // Retire its SSH listener only after the session's final page closes.
            if !guests.values().any(|page| page.session == guest.session) {
                let _ = sessions
                    .stop_network_rule(&guest.session, proxy_owner(&guest.session))
                    .await;
            }
        }
        Ok(())
    }
}

fn proxy_owner(session: &str) -> String {
    format!("web-profile-{session}")
}
