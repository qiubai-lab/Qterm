//! Native guest browser lifetime. No credentials or terminal handles enter a guest.
use crate::infrastructure::ssh::client::SshSessionManager;
use std::collections::HashMap;
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

#[cfg(test)]
mod bounds_tests;
mod clear_data;
mod frame_raster;
mod lifecycle;
mod local_storage;
mod popup_lifecycle;
pub use popup_lifecycle::reject_popup;
mod target;
pub use target::WebTarget;
mod metrics;
#[cfg(all(test, windows))]
mod native_local_tests;
#[cfg(all(test, windows))]
mod native_popup_click_tests;
#[cfg(all(test, windows))]
mod native_popup_tests;
#[cfg(all(test, windows))]
mod native_profile_tests;
#[cfg(all(test, windows))]
mod native_scrollbar_drag_tests;
#[cfg(all(test, windows))]
mod native_scrollbar_tests;
mod profile_gateway;
#[cfg(test)]
mod profile_gateway_tests;
mod profile_storage;
#[cfg(windows)]
mod windows_data;
pub use metrics::WebMetrics;
#[cfg(any(target_os = "windows", test))]
mod navigation_state;
#[cfg(any(target_os = "windows", test))]
mod scrollbars;
mod snapshot;
mod surface_raster;
pub use snapshot::WebSnapshot;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
mod windows_frame;
#[cfg(windows)]
mod windows_interaction;
#[cfg(target_os = "windows")]
mod windows_navigation;
#[cfg(windows)]
mod windows_popup_pending;
#[cfg(windows)]
mod windows_popups;
#[cfg(windows)]
mod windows_snapshot;
#[cfg(target_os = "windows")]
mod windows_surface;

#[cfg(all(test, target_os = "windows"))]
mod native_metrics_tests;
#[cfg(all(test, target_os = "windows"))]
mod native_modal_tests;
#[cfg(all(test, target_os = "windows"))]
mod native_navigation_tests;
#[cfg(all(test, target_os = "windows"))]
mod native_surface_tests;
#[cfg(all(test, target_os = "windows"))]
mod native_tests;

pub struct WebHost {
    guests: Mutex<HashMap<String, Guest>>,
    environments: Mutex<HashMap<String, Environment>>,
    root: std::path::PathBuf,
}

struct Guest {
    target: WebTarget,
    geometry: Option<[f64; 5]>,
    visible: bool,
    environment: String,
}

struct Environment {
    directory: std::path::PathBuf,
    gateway: Option<profile_gateway::ProfileGateway>,
}

impl WebHost {
    pub fn new(root: std::path::PathBuf) -> Self {
        Self {
            guests: Mutex::new(HashMap::new()),
            environments: Mutex::new(HashMap::new()),
            root,
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
    #[serde(default, rename = "inputBlocked")]
    pub input_blocked: bool,
    #[serde(default)]
    pub covered: bool,
    #[serde(default)]
    pub occlusions: Vec<WebClipRect>,
    #[serde(default)]
    pub frame: Option<frame_raster::WebFrame>,
    #[serde(default)]
    pub panels: Vec<surface_raster::WebPanel>,
    #[serde(default)]
    pub scrollbar: Option<[[u8; 4]; 3]>,
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
            && (!self.covered || self.input_blocked)
            && self
                .frame
                .as_ref()
                .is_none_or(frame_raster::WebFrame::valid)
            && self.panels.len() <= 8
            && self.panels.iter().all(|panel| panel.edge.valid())
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
        if !bounds.visible || !guest.target.connected(sessions) {
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
        if !guest.target.connected(sessions) {
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
                if app
                    .get_webview("main")
                    .and_then(|main| main.url().ok())
                    .is_some_and(|main| main.origin() == url.origin())
                {
                    return Err("不能在网页 Block 中打开应用内部地址".into());
                }
                view.navigate(url)
            }
            "reload" => view.reload(),
            #[cfg(target_os = "windows")]
            "stop" => return windows_navigation::stop(&view).await,
            "back" => view.eval("history.back()"),
            "forward" => view.eval("history.forward()"),
            _ => return Err("未知网页操作".into()),
        };
        result.map_err(|_| "网页操作失败".into())
    }
}
