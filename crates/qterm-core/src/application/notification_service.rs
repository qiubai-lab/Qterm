use crate::{
    domain::settings::SettingsError,
    ports::notification::{
        NativeNotifications, NotificationDeliveryError, NotificationMessage,
        NotificationSettingsRepository,
    },
};
use std::time::{Duration, Instant};

pub struct NotificationService<R> {
    repository: R,
    body_repository: R,
    last_sent: Option<Instant>,
}
impl<R: NotificationSettingsRepository> NotificationService<R> {
    pub fn new(repository: R, body_repository: R) -> Self {
        Self {
            repository,
            body_repository,
            last_sent: None,
        }
    }
    pub fn body_enabled(&self) -> Result<bool, SettingsError> {
        self.body_repository.load()
    }
    pub fn update_body(&mut self, enabled: bool) -> Result<(), SettingsError> {
        self.body_repository.save(enabled)
    }
    pub fn enabled(&self) -> Result<bool, SettingsError> {
        self.repository.load()
    }
    pub fn update(&mut self, enabled: bool) -> Result<(), SettingsError> {
        self.repository.save(enabled)?;
        self.last_sent = None;
        Ok(())
    }
    pub fn send(
        &mut self,
        native: &impl NativeNotifications,
        now: Instant,
        message: &NotificationMessage,
    ) -> Result<(), NotificationDeliveryError> {
        if !self.enabled().unwrap_or(false) || native.is_foreground() {
            return Ok(());
        }
        if self
            .last_sent
            .is_some_and(|last| now.saturating_duration_since(last) < Duration::from_secs(2))
        {
            return Ok(());
        }
        self.last_sent = Some(now);
        let title = clean(&message.title, 128);
        let body = if self.body_enabled().unwrap_or(false) {
            clean(&message.body, 1024)
        } else {
            String::new()
        };
        native.send_attention(&NotificationMessage {
            title: if title.is_empty() {
                "Qterm".into()
            } else {
                title
            },
            body: if body.is_empty() {
                "终端程序需要你关注".into()
            } else {
                body
            },
        })
    }
}

fn clean(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(*c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
        .take(limit)
        .collect::<String>()
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    struct Repository(AtomicBool);
    impl NotificationSettingsRepository for Repository {
        fn load(&self) -> Result<bool, SettingsError> {
            Ok(self.0.load(Ordering::Relaxed))
        }
        fn save(&self, value: bool) -> Result<(), SettingsError> {
            self.0.store(value, Ordering::Relaxed);
            Ok(())
        }
    }
    struct Native {
        foreground: bool,
        count: AtomicUsize,
    }
    impl NativeNotifications for Native {
        fn is_foreground(&self) -> bool {
            self.foreground
        }
        fn send_attention(
            &self,
            _message: &NotificationMessage,
        ) -> Result<(), NotificationDeliveryError> {
            self.count.fetch_add(1, Ordering::Relaxed);
            Ok(())
        }
    }
    #[test]
    fn disabled_foreground_and_burst_requests_do_not_send() {
        let mut service = NotificationService::new(
            Repository(AtomicBool::new(false)),
            Repository(AtomicBool::new(false)),
        );
        let mut native = Native {
            foreground: false,
            count: AtomicUsize::new(0),
        };
        let now = Instant::now();
        service
            .send(&native, now, &NotificationMessage::default())
            .unwrap();
        assert_eq!(native.count.load(Ordering::Relaxed), 0);
        service.update(true).unwrap();
        native.foreground = true;
        service
            .send(&native, now, &NotificationMessage::default())
            .unwrap();
        assert_eq!(native.count.load(Ordering::Relaxed), 0);
        native.foreground = false;
        service
            .send(&native, now, &NotificationMessage::default())
            .unwrap();
        service
            .send(&native, now, &NotificationMessage::default())
            .unwrap();
        assert_eq!(native.count.load(Ordering::Relaxed), 1);
        service.update(false).unwrap();
        service
            .send(
                &native,
                now + Duration::from_secs(3),
                &NotificationMessage::default(),
            )
            .unwrap();
        assert_eq!(native.count.load(Ordering::Relaxed), 1);
    }
    #[test]
    fn propagates_native_permission_failure() {
        struct Denied;
        impl NativeNotifications for Denied {
            fn is_foreground(&self) -> bool {
                false
            }
            fn send_attention(
                &self,
                _message: &NotificationMessage,
            ) -> Result<(), NotificationDeliveryError> {
                Err(NotificationDeliveryError::PermissionDenied)
            }
        }
        let mut service = NotificationService::new(
            Repository(AtomicBool::new(true)),
            Repository(AtomicBool::new(false)),
        );
        assert_eq!(
            service.send(&Denied, Instant::now(), &NotificationMessage::default()),
            Err(NotificationDeliveryError::PermissionDenied)
        );
    }
    #[test]
    fn hides_body_until_enabled_and_sanitizes_native_content() {
        struct Capture(std::sync::Mutex<Option<NotificationMessage>>);
        impl NativeNotifications for Capture {
            fn is_foreground(&self) -> bool {
                false
            }
            fn send_attention(
                &self,
                message: &NotificationMessage,
            ) -> Result<(), NotificationDeliveryError> {
                *self.0.lock().unwrap() = Some(message.clone());
                Ok(())
            }
        }
        let mut service = NotificationService::new(
            Repository(AtomicBool::new(true)),
            Repository(AtomicBool::new(false)),
        );
        let native = Capture(std::sync::Mutex::new(None));
        let now = Instant::now();
        let message = NotificationMessage {
            title: "home-220 · Workspace 2".into(),
            body: "done\u{7}\u{202e}".into(),
        };
        service.send(&native, now, &message).unwrap();
        {
            let sent = native.0.lock().unwrap();
            let sent = sent.as_ref().unwrap();
            assert_eq!(sent.title, message.title);
            assert_eq!(sent.body, "终端程序需要你关注");
        }
        service.update_body(true).unwrap();
        service
            .send(&native, now + Duration::from_secs(3), &message)
            .unwrap();
        assert_eq!(native.0.lock().unwrap().as_ref().unwrap().body, "done");
        service.update_body(false).unwrap();
        service
            .send(&native, now + Duration::from_secs(6), &message)
            .unwrap();
        assert_eq!(
            native.0.lock().unwrap().as_ref().unwrap().body,
            "终端程序需要你关注"
        );
        assert_eq!(clean(&"字".repeat(2000), 1024).chars().count(), 1024);
    }
}
