use super::{
    Environment, Guest, WebHost, WebTarget,
    gateway::{Gateway, Route},
    label, native, page,
};
use crate::infrastructure::ssh::client::SshSessionManager;
use std::{collections::HashSet, sync::Arc};
use tauri::Manager;

impl WebHost {
    pub async fn open(
        &self,
        app: &tauri::AppHandle,
        sessions: &Arc<SshSessionManager>,
        id: &str,
        target: &WebTarget,
        address: &str,
    ) -> Result<(), String> {
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
        let key = identity
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "local".into());
        let mut state = self.state.lock().await;
        let label = label(id)?;
        let url: tauri::Url = address.parse().map_err(|_| "网页地址无效")?;
        if !page::allowed(app, &url) {
            return Err("仅支持外部 HTTP/HTTPS 地址".into());
        }
        if state.guests.contains_key(&label) {
            return Err("网页已打开".into());
        }
        crate::domain::web::ensure_web_page_capacity(state.guests.len())?;
        if !state.environments.contains_key(&key) {
            let directory = match identity {
                Some(identity) => super::storage::resolve(&self.root, Some(&identity))?,
                None => super::storage::resolve(&self.root, None)?,
            };
            std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            let gateway = if target.session().is_some() {
                let sessions = sessions.clone();
                Some(Gateway::new(Arc::new(move |id| sessions.web_session_connected(id))).await?)
            } else {
                None
            };
            state.environments.insert(
                key.clone(),
                Environment {
                    directory,
                    gateway,
                    context: None,
                    owners: HashSet::new(),
                    retiring: false,
                },
            );
        }
        let mut new_owner = false;
        if let WebTarget::Remote {
            session_id,
            profile_id,
        } = target
        {
            let environment = state.environments.get_mut(&key).ok_or("环境已关闭")?;
            if environment.retiring {
                return Err("浏览环境正在关闭，请稍后重试".into());
            }
            let port = sessions
                .start_web_proxy(session_id, profile_id, &proxy_owner(session_id))
                .await
                .map_err(|_| "无法启动网页代理")?;
            environment
                .gateway
                .as_ref()
                .ok_or("代理不存在")?
                .add(
                    session_id.clone(),
                    Route {
                        session: session_id.clone(),
                        port,
                    },
                )
                .await;
            new_owner = environment.owners.insert(session_id.clone());
        }
        let result = Self::mount(&mut state, app, label, &key, target.clone(), url).await;
        drop(state);
        if new_owner {
            self.start_watch(app, sessions, target);
        }
        result
    }
    pub(super) async fn mount(
        state: &mut super::HostState,
        app: &tauri::AppHandle,
        label: String,
        key: &str,
        target: WebTarget,
        url: tauri::Url,
    ) -> Result<(), String> {
        let others = state
            .environments
            .iter()
            .filter(|(k, _)| k.as_str() != key)
            .filter_map(|(_, e)| e.context.clone())
            .collect();
        let environment = state.environments.get_mut(key).ok_or("环境已关闭")?;
        if environment.retiring {
            return Err("浏览环境正在关闭，请稍后重试".into());
        }
        // Keep ownership even if native creation/close times out. Pool retirement
        // independently refuses to release any browser that is still alive.
        state.guests.insert(
            label.clone(),
            Guest {
                target: target.clone(),
                environment: key.into(),
                visible: false,
                protocol: Default::default(),
                navigation: super::navigation::Navigation::new(app, &label),
                closing: None,
            },
        );
        let created = page::create(
            app,
            &label,
            &environment.directory,
            environment.gateway.as_ref().map(|g| g.port),
            environment.context.clone(),
            others,
        )
        .await;
        let page = match created {
            Ok(page) => page,
            Err(error) => {
                environment.retiring = true;
                let directory = environment.directory.clone();
                environment.context = native::on_ui(app, move || {
                    tauri_runtime_cef::owned_request_context(&directory)
                })
                .await?;
                return Err(error);
            }
        };
        environment.context = Some(page.context);
        #[cfg(feature = "cef-integration-test")]
        super::test_control::emit(
            serde_json::json!({"event":"proxy_ready","id":label,"context_reused":page.reused,"native_identity_verified":true,"other_contexts_isolated":true}),
        );
        let _ = page.reused;
        state.guests.insert(
            label.clone(),
            Guest {
                target,
                environment: key.into(),
                visible: false,
                protocol: page.protocol,
                navigation: page.navigation,
                closing: None,
            },
        );
        if let Err(error) = page.view.navigate(url) {
            if let Some(environment) = state.environments.get_mut(key) {
                environment.retiring = true;
            }
            let _ = Self::close_page(state, app, &label).await;
            return Err(error.to_string());
        }
        Ok(())
    }
    fn start_watch(
        &self,
        app: &tauri::AppHandle,
        sessions: &Arc<SshSessionManager>,
        target: &WebTarget,
    ) {
        let Some(session) = target.session().map(str::to_owned) else {
            return;
        };
        let (app, sessions) = (app.clone(), sessions.clone());
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                let host = app.state::<WebHost>();
                if !host
                    .state
                    .lock()
                    .await
                    .environments
                    .values()
                    .any(|e| e.owners.contains(&session))
                {
                    break;
                }
                if !sessions.web_session_connected(&session) {
                    // Native close/flush completion can arrive after a timeout.
                    // Retry the quarantined generation without admitting a new one.
                    for attempt in 0..3 {
                        match host.disconnect(&app, &sessions, &session).await {
                            Ok(()) => break,
                            Err(error) => eprintln!(
                                "CEF connection cleanup failed (attempt {}): {error}",
                                attempt + 1
                            ),
                        }
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                    break;
                }
            }
        });
    }
    pub async fn close(
        &self,
        app: &tauri::AppHandle,
        _sessions: &SshSessionManager,
        id: &str,
    ) -> Result<(), String> {
        let label = label(id)?;
        let mut state = self.state.lock().await;
        Self::close_page(&mut state, app, &label).await?;
        if state.environments.contains_key("local")
            && !state.guests.values().any(|g| g.environment == "local")
        {
            Self::retire(&mut state, app, "local").await?;
        }
        Ok(())
    }
    pub(super) async fn close_page(
        state: &mut super::HostState,
        app: &tauri::AppHandle,
        label: &str,
    ) -> Result<(), String> {
        let Some(guest) = state.guests.get_mut(label) else {
            return Ok(());
        };
        if guest.closing.is_none()
            && let Some(view) = app.get_webview(label)
        {
            match native::begin_close(&view).await {
                Ok(browsers) => guest.closing = Some(browsers),
                Err(error) => {
                    if let Some(environment) = state.environments.get_mut(&guest.environment) {
                        environment.retiring = true;
                    }
                    return Err(error);
                }
            }
        }
        if let Some(browsers) = &guest.closing
            && let Err(error) = native::wait_closed(app, browsers).await
        {
            if let Some(environment) = state.environments.get_mut(&guest.environment) {
                environment.retiring = true;
            }
            return Err(error);
        }
        state.guests.remove(label);
        Ok(())
    }
    pub async fn disconnect(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        session: &str,
    ) -> Result<(), String> {
        let mut state = self.state.lock().await;
        for environment in state.environments.values_mut() {
            if let Some(gateway) = &environment.gateway {
                gateway.remove_session(session).await;
            }
            environment.owners.remove(session);
            if environment.gateway.is_some() && environment.owners.is_empty() {
                environment.retiring = true;
                if let Some(context) = &environment.context {
                    let context = context.clone();
                    native::on_ui(app, move || super::contexts::block(&context)).await?;
                }
                if let Some(gateway) = &mut environment.gateway {
                    gateway.shutdown().await;
                }
            }
        }
        let labels: Vec<_> = state
            .guests
            .iter()
            .filter(|(_, g)| g.target.session() == Some(session))
            .map(|(id, _)| id.clone())
            .collect();
        for label in labels {
            Self::close_page(&mut state, app, &label).await?;
        }
        let _ = sessions
            .stop_network_rule(session, proxy_owner(session))
            .await;
        let keys: Vec<_> = state
            .environments
            .iter()
            .filter(|(k, e)| k.as_str() != "local" && e.owners.is_empty())
            .map(|(k, _)| k.clone())
            .collect();
        for key in keys {
            Self::retire(&mut state, app, &key).await?;
        }
        Ok(())
    }
    async fn retire(
        state: &mut super::HostState,
        app: &tauri::AppHandle,
        key: &str,
    ) -> Result<(), String> {
        let Some(environment) = state.environments.get_mut(key) else {
            return Ok(());
        };
        environment.retiring = true;
        if let Some(context) = &environment.context {
            let captured = context.clone();
            native::on_ui(app, move || super::contexts::block(&captured)).await?;
        }
        if let Some(gateway) = &mut environment.gateway {
            gateway.shutdown().await;
        }
        if let Some(context) = &environment.context {
            super::contexts::retire(app, environment.directory.clone(), context.clone()).await?;
        }
        state.environments.remove(key);
        Ok(())
    }
    pub async fn shutdown(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let mut state = self.state.lock().await;
        for environment in state.environments.values_mut() {
            environment.retiring = true;
            if let Some(context) = &environment.context {
                let context = context.clone();
                native::on_ui(app, move || super::contexts::block(&context)).await?;
            }
            if let Some(gateway) = &mut environment.gateway {
                gateway.shutdown().await;
            }
        }
        let labels: Vec<_> = state.guests.keys().cloned().collect();
        for label in labels {
            Self::close_page(&mut state, app, &label).await?;
        }
        let keys: Vec<_> = state.environments.keys().cloned().collect();
        for key in keys {
            Self::retire(&mut state, app, &key).await?;
        }
        #[cfg(feature = "cef-integration-test")]
        super::test_control::emit(
            serde_json::json!({"event":"shutdown-complete","guests":state.guests.len(),"environments":state.environments.len(),"pooledContexts":native::on_ui(app, || Ok(tauri_runtime_cef::pooled_request_context_count())).await?}),
        );
        Ok(())
    }
}
fn proxy_owner(session: &str) -> String {
    format!("web-profile-{session}")
}
