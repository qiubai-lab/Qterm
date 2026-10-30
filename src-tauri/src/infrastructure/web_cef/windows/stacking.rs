//! Adopted popups bypass Tauri's AppWebview insertion and its native z-order pin.
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SetWindowPos,
            WINDOWPOS, WM_NCDESTROY, WM_WINDOWPOSCHANGING,
        },
    },
};

const SUBCLASS: usize = 0x5154435a;

/// Match the runtime's root-view behavior without activating the window or changing bounds.
pub(super) fn raise_and_pin(hwnd: HWND) -> Result<(), String> {
    unsafe {
        // Installing an existing subclass updates its state; briefly permit our own raise.
        if !SetWindowSubclass(hwnd, Some(pin), SUBCLASS, 0).as_bool() {
            return Err("无法固定弹窗层级".into());
        }
        let raised = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        if !SetWindowSubclass(hwnd, Some(pin), SUBCLASS, 1).as_bool() {
            return Err("无法固定弹窗层级".into());
        }
        raised.map_err(|e| e.to_string())
    }
}

unsafe extern "system" fn pin(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _: usize,
    pinned: usize,
) -> LRESULT {
    unsafe {
        if message == WM_WINDOWPOSCHANGING && pinned != 0 && lparam.0 != 0 {
            // Chromium may reposition a child when focus/visibility changes. Allow size,
            // position and visibility updates, but keep it above the full-window main UI.
            (*(lparam.0 as *mut WINDOWPOS)).flags |= SWP_NOZORDER;
        }
        if message == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(pin), SUBCLASS);
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }
}
