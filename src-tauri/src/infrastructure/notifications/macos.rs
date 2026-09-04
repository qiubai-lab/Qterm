//! Uses the actual application bundle identity; never impersonates Terminal.
use crate::ports::notification::{NotificationDeliveryError, NotificationMessage};
use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_foundation::{NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
    UNNotificationRequest, UNNotificationSettings, UNUserNotificationCenter,
};
use std::{ptr::NonNull, sync::mpsc, time::Duration};

fn receive<T>(receiver: mpsc::Receiver<T>) -> Result<T, NotificationDeliveryError> {
    receiver
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| NotificationDeliveryError::Unavailable)
}

pub fn send_attention(message: &NotificationMessage) -> Result<(), NotificationDeliveryError> {
    // Called only on a blocking worker. Cocoa invokes completion blocks on its own queue.
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (tx, rx) = mpsc::channel();
    let callback = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // SAFETY: Apple supplies a valid settings object for the duration of this callback.
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let _ = tx.send(status);
    });
    center.getNotificationSettingsWithCompletionHandler(&callback);
    let status = receive(rx)?;
    if status == UNAuthorizationStatus::NotDetermined {
        let (tx, rx) = mpsc::channel();
        let callback = RcBlock::new(move |granted: Bool, error: *mut NSError| {
            let result = if !error.is_null() {
                Err(native_error(error))
            } else if granted.as_bool() {
                Ok(())
            } else {
                Err(NotificationDeliveryError::PermissionDenied)
            };
            let _ = tx.send(result);
        });
        center.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert,
            &callback,
        );
        receive(rx)??;
    } else if status != UNAuthorizationStatus::Authorized
        && status != UNAuthorizationStatus::Provisional
    {
        return Err(NotificationDeliveryError::PermissionDenied);
    }
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(&message.title));
    content.setBody(&NSString::from_str(&message.body));
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&uuid::Uuid::new_v4().to_string()),
        &content,
        None,
    );
    let (tx, rx) = mpsc::channel();
    let callback = RcBlock::new(move |error: *mut NSError| {
        let _ = tx.send(if error.is_null() {
            Ok(())
        } else {
            Err(native_error(error))
        });
    });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&callback));
    receive(rx)?
}

fn native_error(error: *mut NSError) -> NotificationDeliveryError {
    // SAFETY: Only called for a non-null error within Apple's completion callback.
    let error = unsafe { &*error };
    NotificationDeliveryError::Native {
        domain: error.domain().to_string(),
        code: error.code(),
    }
}
