use crate::domain::settings::SettingsError;

pub trait NotificationSettingsRepository: Send + Sync {
    fn load(&self) -> Result<bool, SettingsError>;
    fn save(&self, enabled: bool) -> Result<(), SettingsError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotificationDeliveryError {
    // Only the macOS adapter constructs these errors; keep the shared IPC contract on all targets.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    PermissionDenied,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Native {
        domain: String,
        code: isize,
    },
    Unavailable,
}

#[derive(Default, Debug, Clone)]
pub struct NotificationMessage {
    pub title: String,
    pub body: String,
}

pub trait NativeNotifications {
    fn is_foreground(&self) -> bool;
    fn send_attention(
        &self,
        message: &NotificationMessage,
    ) -> Result<(), NotificationDeliveryError>;
}
