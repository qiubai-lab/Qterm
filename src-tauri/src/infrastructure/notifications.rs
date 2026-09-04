use crate::ports::notification::{
    NativeNotifications, NotificationDeliveryError, NotificationMessage,
};
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
use tauri::Manager;
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

pub struct DesktopNotifications {
    #[cfg(not(target_os = "macos"))]
    app: tauri::AppHandle,
}
impl DesktopNotifications {
    pub fn new(app: tauri::AppHandle) -> Self {
        #[cfg(target_os = "macos")]
        let _ = app;
        Self {
            #[cfg(not(target_os = "macos"))]
            app,
        }
    }
}
impl NativeNotifications for DesktopNotifications {
    fn is_foreground(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            objc2_app_kit::NSRunningApplication::currentApplication().isActive()
        }
        #[cfg(not(target_os = "macos"))]
        {
            self.app
                .get_webview_window("main")
                .is_none_or(|window| window.is_focused().unwrap_or(true))
        }
    }
    fn send_attention(
        &self,
        message: &NotificationMessage,
    ) -> Result<(), NotificationDeliveryError> {
        #[cfg(target_os = "macos")]
        {
            macos::send_attention(message)
        }
        #[cfg(not(target_os = "macos"))]
        {
            // The application service has already applied the saved content preference and bounds.
            self.app
                .notification()
                .builder()
                .title(&message.title)
                .body(&message.body)
                .show()
                .map_err(|_| NotificationDeliveryError::Unavailable)
        }
    }
}
