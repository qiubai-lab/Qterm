//! Operations shared by Tauri roots and adopted native popup tabs.
use super::{Guest, native};
use tauri::Manager;
use tauri_runtime_cef::cef::*;
#[derive(Clone)]
pub(super) struct View {
    pub app: tauri::AppHandle,
    pub label: String,
    root: Option<tauri::Webview>,
    popup: Option<Browser>,
}
impl Guest {
    pub fn view(&self, app: &tauri::AppHandle, label: &str) -> Result<View, String> {
        let root = if self.popup.is_none() {
            Some(app.get_webview(label).ok_or("网页已关闭")?)
        } else {
            None
        };
        Ok(View {
            app: app.clone(),
            label: label.into(),
            root,
            popup: self.popup.clone(),
        })
    }
}
impl View {
    pub async fn with<T: Send + 'static>(
        &self,
        work: impl FnOnce(Browser) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        if let Some(browser) = &self.popup {
            let browser = browser.clone();
            native::on_ui(&self.app, move || {
                if browser.is_valid() == 0 {
                    return Err("网页已关闭".into());
                }
                work(browser)
            })
            .await
        } else {
            native::with(self.root.as_ref().ok_or("网页已关闭")?, move |view| {
                work(view.browser())
            })
            .await
        }
    }
    pub async fn url(&self) -> Result<tauri::Url, String> {
        self.with(|browser| {
            CefString::from(&browser.main_frame().ok_or("网页已关闭")?.url())
                .to_string()
                .parse()
                .map_err(|_| "网页地址无效".into())
        })
        .await
    }
    pub async fn navigate(&self, url: tauri::Url) -> Result<(), String> {
        self.with(move |browser| {
            browser
                .main_frame()
                .ok_or("网页已关闭")?
                .load_url(Some(&CefString::from(url.as_str())));
            Ok(())
        })
        .await
    }
    pub async fn eval(&self, script: String) -> Result<(), String> {
        self.with(move |browser| {
            browser
                .main_frame()
                .ok_or("网页已关闭")?
                .execute_java_script(Some(&CefString::from(script.as_str())), None, 0);
            Ok(())
        })
        .await
    }
    pub async fn set_bounds(&self, bounds: &super::WebBounds) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let (x, y, width, height) = (bounds.x, bounds.y, bounds.width, bounds.height);
            self.with(move |browser| {
                unsafe extern "C" {
                    fn qterm_cef_bounds(
                        view: *mut std::ffi::c_void,
                        x: f64,
                        y: f64,
                        width: f64,
                        height: f64,
                    );
                }
                let host = browser.host().ok_or("网页已关闭")?;
                unsafe {
                    qterm_cef_bounds(host.window_handle().cast(), x, y, width, height);
                }
                Ok(())
            })
            .await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = bounds;
            Err("平台尚不支持嵌入弹窗".into())
        }
    }
    pub async fn set_visible(&self, visible: bool) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            self.with(move |browser| {
                unsafe extern "C" {
                    fn qterm_cef_visible(view: *mut std::ffi::c_void, visible: bool);
                }
                let host = browser.host().ok_or("网页已关闭")?;
                unsafe {
                    qterm_cef_visible(host.window_handle().cast(), visible);
                }
                Ok(())
            })
            .await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = visible;
            Err("平台尚不支持嵌入弹窗".into())
        }
    }
    pub async fn begin_close(&self) -> Result<Vec<Browser>, String> {
        if let Some(root) = &self.root {
            return native::begin_close(root).await;
        }
        let browser = self.popup.clone().ok_or("网页已关闭")?;
        native::on_ui(&self.app, move || {
            if browser.is_valid() != 0
                && let Some(host) = browser.host()
            {
                host.close_browser(1);
            }
            Ok(vec![browser])
        })
        .await
    }
}
