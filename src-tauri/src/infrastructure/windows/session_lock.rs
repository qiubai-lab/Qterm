use std::{error::Error, io};

use tauri::{AppHandle, Manager};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::RemoteDesktop::{
        NOTIFY_FOR_THIS_SESSION, WTSRegisterSessionNotification, WTSUnRegisterSessionNotification,
    },
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{WM_NCDESTROY, WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK},
    },
};

use crate::{
    application::credential_lifecycle::LockReason,
    commands::{credential::CredentialState, settings::SettingsState},
    domain::settings::SecuritySettings,
};

const SUBCLASS_ID: usize = 0x5154_4552;

pub fn install(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "main window unavailable"))?;
    let hwnd = window.hwnd()?;
    unsafe { WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION)? };
    let context = Box::into_raw(Box::new(app.clone())) as usize;
    let installed = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, context) };
    if !installed.as_bool() {
        unsafe {
            let _ = WTSUnRegisterSessionNotification(hwnd);
            drop(Box::from_raw(context as *mut AppHandle));
        }
        return Err(io::Error::last_os_error().into());
    }
    Ok(())
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    context: usize,
) -> LRESULT {
    if is_windows_session_lock(message, wparam.0) {
        let app = unsafe { &*(context as *const AppHandle) };
        if should_lock(app.state::<SettingsState>().security(), message, wparam.0) {
            CredentialState::lock(app, LockReason::WindowsSession);
        }
    }

    let result = unsafe { DefSubclassProc(hwnd, message, wparam, lparam) };
    if message == WM_NCDESTROY {
        unsafe {
            let _ = WTSUnRegisterSessionNotification(hwnd);
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
            drop(Box::from_raw(context as *mut AppHandle));
        }
    }
    result
}

fn is_windows_session_lock(message: u32, event: usize) -> bool {
    message == WM_WTSSESSION_CHANGE && event == WTS_SESSION_LOCK as usize
}

fn should_lock(settings: SecuritySettings, message: u32, event: usize) -> bool {
    settings.lock_on_windows_session_lock && is_windows_session_lock(message, event)
}

#[cfg(test)]
mod tests {
    use super::{is_windows_session_lock, should_lock};
    use crate::domain::settings::SecuritySettings;
    use windows::Win32::UI::WindowsAndMessaging::{WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK};

    #[test]
    fn maps_only_the_windows_session_lock_message() {
        assert!(is_windows_session_lock(
            WM_WTSSESSION_CHANGE,
            WTS_SESSION_LOCK as usize
        ));
        assert!(!is_windows_session_lock(WM_WTSSESSION_CHANGE, 8));
        assert!(!is_windows_session_lock(0, WTS_SESSION_LOCK as usize));
        assert!(!should_lock(
            SecuritySettings::new(false, Some(3600)).expect("settings"),
            WM_WTSSESSION_CHANGE,
            WTS_SESSION_LOCK as usize
        ));
    }
}
