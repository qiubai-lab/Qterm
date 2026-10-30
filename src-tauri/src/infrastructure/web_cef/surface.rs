use super::{WebBounds, WebHost, label};
use crate::infrastructure::ssh::client::SshSessionManager;
use tauri::{Emitter, Manager};
impl WebHost {
    pub async fn sync(
        &self,
        app: &tauri::AppHandle,
        sessions: &SshSessionManager,
        id: &str,
        bounds: WebBounds,
    ) -> Result<(), String> {
        if !bounds.valid() {
            return Err("网页区域无效".into());
        }
        let label = label(id)?;
        let mut state = self.state.lock().await;
        let guest = state.guests.get_mut(&label).ok_or("网页已关闭")?;
        let view = app.get_webview(&label).ok_or("网页已关闭")?;
        view.set_bounds(tauri::Rect {
            position: tauri::LogicalPosition::new(bounds.x, bounds.y).into(),
            size: tauri::LogicalSize::new(bounds.width, bounds.height).into(),
        })
        .map_err(|e| e.to_string())?;
        view.eval(super::scrollbars::script(bounds.scrollbar.as_ref()))
            .map_err(|e| e.to_string())?;
        apply(&view, &bounds).await?;
        let visible = bounds.visible && !bounds.covered && guest.target.connected(sessions);
        if visible { view.show() } else { view.hide() }.map_err(|e| e.to_string())?;
        guest.visible = visible;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
async fn apply(view: &tauri::Webview, bounds: &WebBounds) -> Result<(), String> {
    use tauri_runtime_cef::cef::*;
    static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
    unsafe extern "C" fn focus(label: *const std::ffi::c_char) {
        if !label.is_null()
            && let Some(app) = APP.get()
        {
            let label = unsafe { std::ffi::CStr::from_ptr(label) }.to_string_lossy();
            let _ = app.emit_to("main", "web-guest-focused", label.as_ref());
        }
    }
    unsafe extern "C" {
        fn qterm_cef_surface(
            view: *mut std::ffi::c_void,
            json: *const std::ffi::c_char,
            label: *const std::ffi::c_char,
            focus: unsafe extern "C" fn(*const std::ffi::c_char),
        );
    }
    APP.get_or_init(|| view.app_handle().clone());
    let json = std::ffi::CString::new(serde_json::to_string(bounds).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let label = std::ffi::CString::new(view.label()).map_err(|e| e.to_string())?;
    super::native::with(view, move |native| {
        let host = native.browser().host().ok_or("网页已关闭")?;
        unsafe {
            qterm_cef_surface(
                host.window_handle().cast(),
                json.as_ptr(),
                label.as_ptr(),
                focus,
            );
        }
        Ok(())
    })
    .await
}
#[cfg(not(target_os = "macos"))]
async fn apply(_view: &tauri::Webview, _bounds: &WebBounds) -> Result<(), String> {
    Err("当前 CEF 分支尚未验证此平台的原生遮挡适配".into())
}
