//! Native guest browser lifetime. No credentials or terminal handles enter a guest.
use crate::infrastructure::ssh::client::SshSessionManager;
use std::{collections::HashMap, sync::Arc};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

pub fn trusted_handler(
    handler: impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static,
) -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    move |invoke| {
        if !crate::domain::web::trusted_ui_label(invoke.message.webview_ref().label()) {
            invoke
                .resolver
                .reject("Guest webpages cannot invoke application commands");
            true
        } else {
            handler(invoke)
        }
    }
}

mod frame_raster;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
mod windows_frame;
#[cfg(target_os = "windows")]
mod windows_surface;

#[cfg(all(test, target_os = "windows"))]
mod native_surface_tests;
#[cfg(all(test, target_os = "windows"))]
mod native_tests;

pub struct WebHost {
    guests: Mutex<HashMap<String, Guest>>,
}

struct Guest {
    session: String,
    geometry: Option<[f64; 5]>,
    visible: bool,
    // Keep the directory owned until the native view has closed.
    _directory: tempfile::TempDir,
}

impl Default for WebHost {
    fn default() -> Self {
        Self {
            guests: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub visible: bool,
    #[serde(default)]
    pub occlusions: Vec<WebClipRect>,
    #[serde(default)]
    pub frame: Option<frame_raster::WebFrame>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebClipRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl WebBounds {
    pub fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.0 && *n <= 32768.0)
            && self.width >= 1.0
            && self.height >= 1.0
            && self
                .frame
                .as_ref()
                .is_none_or(frame_raster::WebFrame::valid)
            && self.occlusions.len() <= 64
            && self.occlusions.iter().all(|rect| {
                [rect.x, rect.y, rect.width, rect.height]
                    .iter()
                    .all(|n| n.is_finite() && *n >= 0.0)
                    && rect.width > 0.0
                    && rect.height > 0.0
                    && rect.x + rect.width <= self.width + 1e-6
                    && rect.y + rect.height <= self.height + 1e-6
            })
    }
}

pub fn label(id: &str) -> Result<String, String> {
    uuid::Uuid::parse_str(id)
        .map(|id| format!("web-{id}"))
        .map_err(|_| "网页标识无效".into())
}

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
        if !cfg!(target_os = "windows") {
            return Err("Web Block 目前仅支持 Windows".into());
        }
        let mut guests = self.guests.lock().await;
        if guests.contains_key(&label) {
            return Err("网页已打开".into());
        }
        if guests.len() >= 16 {
            return Err("最多同时打开 16 个网页，请先关闭部分网页".into());
        }
        let port = sessions
            .start_web_proxy(session, profile, &label)
            .await
            .map_err(|_| "无法启动网页代理，请重新连接")?;
        let result = self.create(app, &label, port, url);
        match result {
            Ok(directory) => {
                guests.insert(
                    label,
                    Guest {
                        session: session.to_owned(),
                        geometry: None,
                        visible: false,
                        _directory: directory,
                    },
                );
                Ok(())
            }
            Err(error) => {
                let _ = sessions.stop_network_rule(session, label).await;
                Err(error)
            }
        }
    }

    fn create(
        &self,
        app: &AppHandle,
        label: &str,
        port: u16,
        url: tauri::Url,
    ) -> Result<tempfile::TempDir, String> {
        #[cfg(target_os = "windows")]
        {
            windows::create(app, label, port, url)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (app, label, port, url);
            Err("Web Block 目前仅支持 Windows".into())
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
            let _ = sessions.stop_network_rule(&guest.session, label).await;
        }
        Ok(())
    }

    pub async fn sync(
        &self,
        app: &AppHandle,
        sessions: &SshSessionManager,
        id: &str,
        bounds: WebBounds,
    ) -> Result<(), String> {
        if !bounds.valid() {
            return Err("网页区域无效".into());
        }
        let label = label(id)?;
        let mut guests = self.guests.lock().await;
        let guest = guests.get_mut(&label).ok_or("网页已关闭")?;
        let view = app.get_webview(&label).ok_or("网页已关闭")?;
        if !bounds.visible || !sessions.web_session_connected(&guest.session) {
            if guest.visible {
                view.hide().map_err(|_| "无法隐藏网页")?;
            }
            guest.visible = false;
            return Ok(());
        }
        let geometry = [
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            view.window()
                .scale_factor()
                .map_err(|_| "无法读取网页缩放")?,
        ];
        if guest.geometry != Some(geometry) {
            view.set_bounds(tauri::Rect {
                position: tauri::LogicalPosition::new(bounds.x, bounds.y).into(),
                size: tauri::LogicalSize::new(bounds.width, bounds.height).into(),
            })
            .map_err(|_| "无法调整网页区域")?;
            guest.geometry = Some(geometry);
        }
        #[cfg(target_os = "windows")]
        windows_surface::sync(&view, &bounds).await?;
        if !guest.visible {
            view.show().map_err(|_| "无法显示网页")?;
        }
        guest.visible = true;
        Ok(())
    }

    pub async fn action(
        &self,
        app: &AppHandle,
        sessions: &SshSessionManager,
        id: &str,
        action: &str,
        address: Option<&str>,
    ) -> Result<(), String> {
        let label = label(id)?;
        let guests = self.guests.lock().await;
        let guest = guests.get(&label).ok_or("网页已关闭")?;
        if !sessions.web_session_connected(&guest.session) {
            return Err("SSH 已断开，请重新连接".into());
        }
        let view = app.get_webview(&label).ok_or("网页已关闭")?;
        let result = match action {
            "navigate" => {
                let url: tauri::Url = address
                    .ok_or("请输入网页地址")?
                    .parse()
                    .map_err(|_| "网页地址无效")?;
                if !crate::domain::web::allowed_web_url(url.as_str()) {
                    return Err("仅支持不含用户名或密码的 HTTP/HTTPS 地址".into());
                }
                view.navigate(url)
            }
            "reload" => view.reload(),
            "back" => view.eval("history.back()"),
            "forward" => view.eval("history.forward()"),
            _ => return Err("未知网页操作".into()),
        };
        result.map_err(|_| "网页操作失败".into())
    }
}
