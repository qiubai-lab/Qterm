use std::{path::PathBuf, process::Command};

use super::{BrowserProxyError, ProxyBrowser};

pub(super) fn browser_installed(browser: ProxyBrowser) -> bool {
    detect_browser(browser).is_some()
}

pub(super) fn launch_browser(
    browser: ProxyBrowser,
    arguments: &[String],
) -> Result<(), BrowserProxyError> {
    let executable = detect_browser(browser).ok_or(BrowserProxyError::BrowserNotInstalled)?;
    Command::new(executable)
        .args(arguments)
        .spawn()
        .map(|_| ())
        .map_err(|_| BrowserProxyError::LaunchFailed)
}

fn detect_browser(browser: ProxyBrowser) -> Option<PathBuf> {
    registry_app_path(executable_name(browser))
        .filter(|path| path.is_file())
        .or_else(|| {
            browser_candidates(browser)
                .into_iter()
                .find(|path| path.is_file())
        })
}

fn executable_name(browser: ProxyBrowser) -> &'static str {
    match browser {
        ProxyBrowser::Chrome => "chrome.exe",
        ProxyBrowser::Edge => "msedge.exe",
    }
}

fn browser_candidates(browser: ProxyBrowser) -> Vec<PathBuf> {
    let relative = match browser {
        ProxyBrowser::Chrome => ["Google", "Chrome", "Application", "chrome.exe"],
        ProxyBrowser::Edge => ["Microsoft", "Edge", "Application", "msedge.exe"],
    };
    ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .map(|root| relative.iter().fold(root, |path, part| path.join(part)))
        .collect()
}

fn registry_app_path(executable_name: &str) -> Option<PathBuf> {
    use windows::{
        Win32::{
            Foundation::ERROR_SUCCESS,
            System::Registry::{
                HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, RegCloseKey, RegOpenKeyExW,
            },
        },
        core::PCWSTR,
    };

    let subkey =
        format!("Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{executable_name}\0");
    let wide: Vec<u16> = subkey.encode_utf16().collect();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let mut key = HKEY::default();
        // SAFETY: `wide` is NUL-terminated and `key` remains valid until it is closed below.
        let opened =
            unsafe { RegOpenKeyExW(root, PCWSTR(wide.as_ptr()), None, KEY_READ, &mut key) };
        if opened != ERROR_SUCCESS {
            continue;
        }
        let value = read_default_registry_string(key);
        // SAFETY: `key` was returned by RegOpenKeyExW and is closed exactly once here.
        let _ = unsafe { RegCloseKey(key) };
        if value.is_some() {
            return value;
        }
    }
    None
}

fn read_default_registry_string(key: windows::Win32::System::Registry::HKEY) -> Option<PathBuf> {
    use windows::{
        Win32::Foundation::ERROR_SUCCESS, Win32::System::Registry::RegQueryValueExW, core::PCWSTR,
    };

    let mut byte_count = 0_u32;
    // SAFETY: this first call requests only the required byte count for the default value.
    let sized =
        unsafe { RegQueryValueExW(key, PCWSTR::null(), None, None, None, Some(&mut byte_count)) };
    if sized != ERROR_SUCCESS || byte_count < 2 {
        return None;
    }
    let mut buffer = vec![0_u16; byte_count as usize / 2];
    // SAFETY: `buffer` is sized from the preceding registry query and byte_count describes it.
    let read = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR::null(),
            None,
            None,
            Some(buffer.as_mut_ptr().cast()),
            Some(&mut byte_count),
        )
    };
    if read != ERROR_SUCCESS {
        return None;
    }
    let end = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    let value = String::from_utf16_lossy(&buffer[..end]);
    let path = PathBuf::from(value.trim().trim_matches('"'));
    (!path.as_os_str().is_empty()).then_some(path)
}
