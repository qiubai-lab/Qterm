use super::{WebBounds, WebHost, label};
use crate::infrastructure::ssh::client::SshSessionManager;
#[cfg(target_os = "macos")]
use tauri::Emitter;
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
        let view = guest.view(app, &label)?;
        let visible = bounds.visible && !bounds.covered && guest.target.connected(sessions);
        view.set_bounds(&bounds).await?;
        view.eval(super::scrollbars::script(bounds.scrollbar.as_ref()))
            .await?;
        apply(&view, &bounds).await?;
        view.set_visible(visible).await?;
        guest.visible = visible;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
async fn apply(view: &super::guest_view::View, bounds: &WebBounds) -> Result<(), String> {
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
    APP.get_or_init(|| view.app.clone());
    let json = std::ffi::CString::new(serde_json::to_string(bounds).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let label = std::ffi::CString::new(view.label.as_str()).map_err(|e| e.to_string())?;
    view.with(move |browser| {
        let host = browser.host().ok_or("网页已关闭")?;
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
#[cfg(windows)]
async fn apply(view: &super::guest_view::View, bounds: &WebBounds) -> Result<(), String> {
    let app = view.app.clone();
    let label = view.label.clone();
    let bounds = bounds.clone();
    view.with(move |browser| super::windows::apply(&app, &label, &browser, &bounds))
        .await
}
#[cfg(not(any(target_os = "macos", windows)))]
async fn apply(_view: &super::guest_view::View, _bounds: &WebBounds) -> Result<(), String> {
    Err("当前 CEF 分支尚未验证此平台的原生遮挡适配".into())
}
