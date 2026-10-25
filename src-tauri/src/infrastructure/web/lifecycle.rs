use super::{
    Environment, Guest, WebHost, WebTarget, label,
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
        target: &WebTarget,
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
        let identity = match target {
            WebTarget::Local {} => None,
            WebTarget::Remote {
                session_id,
                profile_id,
            } => Some(
                sessions
                    .web_browser_identity(session_id, profile_id)
                    .map_err(|_| "连接身份不匹配或已断开")?,
            ),
        };
        let key = match &identity {
            Some(identity) => serde_json::to_string(identity).map_err(|_| "浏览连接身份无效")?,
            None => "local".into(),
        };
        // All lifecycle/clearing paths acquire guests before environments.
        let mut guests = self.guests.lock().await;
        if guests.contains_key(&label) {
            return Err("网页已打开".into());
        }
        crate::domain::web::ensure_web_page_capacity(guests.len())?;
        let mut environments = self.environments.lock().await;
        if !environments.contains_key(&key) {
            let root = self.root.clone();
            let remote = identity.is_some();
            let directory = tokio::task::spawn_blocking(move || match identity {
                Some(identity) => profile_storage::resolve(&root, &identity),
                None => super::local_storage::resolve(&root),
            })
            .await
            .map_err(|_| "浏览环境初始化失败")??;
            let gateway = if remote {
                let manager = sessions.clone();
                Some(
                    ProfileGateway::new(Arc::new(move |id| manager.web_session_connected(id)))
                        .await?,
                )
            } else {
                None
            };
            environments.insert(key.clone(), Environment { directory, gateway });
        }
        let environment = environments.get(&key).ok_or("浏览环境不存在")?;
        if let WebTarget::Remote {
            session_id,
            profile_id,
        } = target
        {
            let port = sessions
                .start_web_proxy(session_id, profile_id, &proxy_owner(session_id))
                .await
                .map_err(|_| "无法启动网页代理，请重新连接")?;
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
        let proxy_port = environment.gateway.as_ref().map(|gateway| gateway.port);
        #[cfg(windows)]
        let result =
            super::windows::create_persistent(app, &label, proxy_port, url, &environment.directory);
        #[cfg(not(windows))]
        let result: Result<(), String> = {
            let _ = (app, url, &environment.directory, proxy_port);
            Err("Web Block 目前仅支持 Windows".into())
        };
        match result {
            Ok(()) => {
                guests.insert(
                    label,
                    Guest {
                        target: target.clone(),
                        environment: key,
                        geometry: None,
                        visible: false,
                    },
                );
                Ok(())
            }
            Err(error) => {
                if let Some(gateway) = &environment.gateway {
                    gateway.remove(&label).await;
                }
                if let Some(session) = target.session()
                    && !guests
                        .values()
                        .any(|guest| guest.target.session() == Some(session))
                {
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
            #[cfg(windows)]
            super::windows_popups::cancel_source(app, &label).await?;
            view.close().map_err(|_| "无法关闭网页")?;
        }
        if let Some(guest) = guests.remove(&label) {
            if let Some(environment) = self.environments.lock().await.get(&guest.environment)
                && let Some(gateway) = &environment.gateway
            {
                gateway.remove(&label).await;
            }
            // A shared browser connection may carry requests from another tab.
            // Retire its SSH listener only after the session's final page closes.
            if let Some(session) = guest.target.session()
                && !guests
                    .values()
                    .any(|page| page.target.session() == Some(session))
            {
                let _ = sessions
                    .stop_network_rule(session, proxy_owner(session))
                    .await;
            }
        }
        Ok(())
    }
}

pub(super) fn proxy_owner(session: &str) -> String {
    format!("web-profile-{session}")
}
