//! Win32 child surfaces. CEF owns HWND creation/destruction; all calls run on its UI thread.
mod input;
mod region;
mod stacking;
#[cfg(test)]
mod tests;

use super::WebBounds;
use tauri::Manager;
use tauri_runtime_cef::cef::*;
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Input::KeyboardAndMouse::{EnableWindow, GetFocus},
        WindowsAndMessaging::{
            GetParent, IsChild, IsWindow, SW_HIDE, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOZORDER,
            SetWindowPos, ShowWindow,
        },
    },
};

pub(super) fn handle(browser: &Browser) -> Result<HWND, String> {
    if currently_on(ThreadId::UI) == 0 || browser.is_valid() == 0 {
        return Err("网页原生窗口不可用".into());
    }
    let hwnd = HWND(browser.host().ok_or("网页已关闭")?.window_handle().0.cast());
    if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return Err("网页原生窗口已关闭".into());
    }
    Ok(hwnd)
}

fn surface(app: &tauri::AppHandle, browser: &Browser) -> Result<(HWND, f64), String> {
    let window = app.get_window("main").ok_or("主窗口不存在")?;
    let main = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    let hwnd = handle(browser)?;
    // Never apply clipping or input state to the application window itself.
    if hwnd == main || unsafe { GetParent(hwnd) }.ok() != Some(main) {
        return Err("网页必须是主窗口的独立子窗口".into());
    }
    Ok((hwnd, window.scale_factor().map_err(|e| e.to_string())?))
}

pub(super) fn set_bounds(
    app: &tauri::AppHandle,
    browser: &Browser,
    bounds: &WebBounds,
) -> Result<(), String> {
    let (hwnd, scale) = surface(app, browser)?;
    let (x, y) = (
        (bounds.x * scale).round() as i32,
        (bounds.y * scale).round() as i32,
    );
    let (width, height) = (
        (bounds.width * scale).round().max(1.0) as i32,
        (bounds.height * scale).round().max(1.0) as i32,
    );
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    }
    .map_err(|e| e.to_string())?;
    if let Some(host) = browser.host() {
        host.notify_move_or_resize_started();
        host.was_resized();
    }
    Ok(())
}

pub(super) fn set_visible(
    app: &tauri::AppHandle,
    browser: &Browser,
    visible: bool,
) -> Result<(), String> {
    let (hwnd, _) = surface(app, browser)?;
    if visible && browser.is_popup() != 0 {
        stacking::raise_and_pin(hwnd)?;
    }
    if !visible {
        return_focus(app, browser, hwnd)?;
    }
    unsafe {
        let _ = ShowWindow(hwnd, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
    }
    if let Some(host) = browser.host() {
        host.was_hidden(i32::from(!visible));
    }
    Ok(())
}

pub(super) fn apply(
    app: &tauri::AppHandle,
    label: &str,
    browser: &Browser,
    bounds: &WebBounds,
) -> Result<(), String> {
    let (hwnd, scale) = surface(app, browser)?;
    input::install(hwnd, app.clone(), label.to_owned())?;
    let blocked = bounds.input_blocked || bounds.covered || !bounds.visible;
    if blocked {
        return_focus(app, browser, hwnd)?;
    }
    unsafe {
        let _ = EnableWindow(hwnd, !blocked);
    }
    if let Err(error) = region::apply(hwnd, bounds, scale)
        .and_then(|()| super::windows_frame::sync(hwnd, bounds, scale))
    {
        // Fail closed if clipping/composition cannot protect application overlays.
        unsafe {
            let _ = EnableWindow(hwnd, false);
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        return Err(error.into());
    }
    Ok(())
}

fn return_focus(app: &tauri::AppHandle, browser: &Browser, hwnd: HWND) -> Result<(), String> {
    let focused = unsafe { GetFocus() };
    if focused == hwnd || unsafe { IsChild(hwnd, focused) }.as_bool() {
        if let Some(host) = browser.host() {
            host.set_focus(0);
        }
        if let Some(main) = app.get_webview("main") {
            main.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(feature = "cef-integration-test")]
pub(super) fn same_window(left: &Browser, right: &Browser) -> Result<bool, String> {
    use windows::Win32::UI::WindowsAndMessaging::{GA_ROOT, GetAncestor};
    let (left, right) = (handle(left)?, handle(right)?);
    Ok(unsafe { GetAncestor(left, GA_ROOT) == GetAncestor(right, GA_ROOT) })
}
