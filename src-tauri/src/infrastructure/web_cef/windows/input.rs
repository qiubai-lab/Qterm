//! Trusted Win32 input only. Thread-local hooks exist exactly while registered guest HWNDs live.
use std::{cell::RefCell, collections::HashMap, sync::Arc};
use tauri::{Emitter, EventTarget};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::Threading::{GetCurrentProcessId, GetCurrentThreadId},
    UI::{
        Accessibility::{HWINEVENTHOOK, SetWinEventHook, UnhookWinEvent},
        Input::KeyboardAndMouse::{
            GetFocus, GetKeyState, IsWindowEnabled, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
        },
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            CallNextHookEx, EVENT_OBJECT_FOCUS, GetParent, HHOOK, IsWindowVisible, MSG, PM_REMOVE,
            SetWindowsHookExW, UnhookWindowsHookEx, WH_GETMESSAGE, WINEVENT_OUTOFCONTEXT,
            WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_NCDESTROY, WM_NULL,
            WM_RBUTTONDOWN,
        },
    },
};

const SUBCLASS: usize = 0x51544345;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Notice {
    Focused,
    CloseTab,
}
type Notify = Arc<dyn Fn(Notice) + Send + Sync>;
#[derive(Default)]
struct Registry {
    guests: HashMap<usize, Notify>,
    hooks: Option<Hooks>,
}
struct Hooks {
    messages: HHOOK,
    focus: HWINEVENTHOOK,
}
impl Drop for Hooks {
    fn drop(&mut self) {
        unsafe {
            let _ = UnhookWindowsHookEx(self.messages);
            let _ = UnhookWinEvent(self.focus);
        }
    }
}
thread_local! { static REGISTRY: RefCell<Registry> = RefCell::default(); }

pub(super) fn install(hwnd: HWND, app: tauri::AppHandle, label: String) -> Result<(), String> {
    register(
        hwnd,
        Arc::new(move |notice| {
            let app = app.clone();
            let label = label.clone();
            // Emitting synchronously from a native callback can re-enter the CEF event loop.
            tauri::async_runtime::spawn(async move {
                let event = match notice {
                    Notice::Focused => "web-guest-focused",
                    Notice::CloseTab => "qterm-close-web-tab",
                };
                let _ = app.emit_to(EventTarget::window("main"), event, &label);
            });
        }),
    )
}

pub(super) fn register(hwnd: HWND, notify: Notify) -> Result<(), String> {
    if REGISTRY.with(|r| r.borrow().guests.contains_key(&(hwnd.0 as usize))) {
        return Ok(());
    }
    let new_hooks = if REGISTRY.with(|r| r.borrow().hooks.is_none()) {
        let thread = unsafe { GetCurrentThreadId() };
        let messages =
            unsafe { SetWindowsHookExW(WH_GETMESSAGE, Some(message_hook), None, thread) }
                .map_err(|e| e.to_string())?;
        let focus = unsafe {
            SetWinEventHook(
                EVENT_OBJECT_FOCUS,
                EVENT_OBJECT_FOCUS,
                None,
                Some(focus_hook),
                GetCurrentProcessId(),
                thread,
                WINEVENT_OUTOFCONTEXT,
            )
        };
        if focus.is_invalid() {
            unsafe {
                let _ = UnhookWindowsHookEx(messages);
            }
            return Err("无法监听网页焦点".into());
        }
        Some(Hooks { messages, focus })
    } else {
        None
    };
    if !unsafe { SetWindowSubclass(hwnd, Some(destroy_hook), SUBCLASS, 0) }.as_bool() {
        return Err("无法监听网页窗口销毁".into());
    }
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if let Some(hooks) = new_hooks {
            r.hooks = Some(hooks);
        }
        r.guests.insert(hwnd.0 as usize, notify);
    });
    Ok(())
}

fn recipient(mut hwnd: HWND) -> Option<Notify> {
    while !hwnd.is_invalid() {
        if let Some(notify) = REGISTRY.with(|r| r.borrow().guests.get(&(hwnd.0 as usize)).cloned())
        {
            return (unsafe { IsWindowVisible(hwnd).as_bool() && IsWindowEnabled(hwnd).as_bool() })
                .then_some(notify);
        }
        hwnd = unsafe { GetParent(hwnd) }.ok()?;
    }
    None
}

unsafe extern "system" fn focus_hook(
    _: HWINEVENTHOOK,
    _: u32,
    hwnd: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    if let Some(notify) = recipient(hwnd) {
        notify(Notice::Focused);
    }
}

unsafe extern "system" fn message_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 == PM_REMOVE.0 as usize && lparam.0 != 0 {
        let message = unsafe { &mut *(lparam.0 as *mut MSG) };
        route(message);
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

pub(super) fn route(message: &mut MSG) {
    let Some(notify) = recipient(message.hwnd) else {
        return;
    };
    if matches!(
        message.message,
        WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN
    ) {
        notify(Notice::Focused);
    }
    if !matches!(message.message, WM_KEYDOWN | WM_KEYUP) || message.wParam.0 != b'W' as usize {
        return;
    }
    let down = |key: u16| unsafe { GetKeyState(i32::from(key)) < 0 };
    if !down(VK_CONTROL.0)
        || [VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN]
            .iter()
            .any(|k| down(k.0))
    {
        return;
    }
    // Queued messages for a formerly focused/hidden guest do not control tabs.
    if recipient(unsafe { GetFocus() })
        .as_ref()
        .is_none_or(|focused| !Arc::ptr_eq(focused, &notify))
    {
        return;
    }
    if message.message == WM_KEYDOWN && message.lParam.0 & (1 << 30) == 0 {
        notify(Notice::CloseTab);
    }
    message.message = WM_NULL;
}

unsafe extern "system" fn destroy_hook(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _: usize,
    _: usize,
) -> LRESULT {
    if message == WM_NCDESTROY {
        unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(destroy_hook), SUBCLASS);
        }
        let hooks = REGISTRY.with(|r| {
            let mut r = r.borrow_mut();
            r.guests.remove(&(hwnd.0 as usize));
            if r.guests.is_empty() {
                r.hooks.take()
            } else {
                None
            }
        });
        drop(hooks);
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

#[cfg(test)]
pub(super) fn registered() -> usize {
    REGISTRY.with(|r| r.borrow().guests.len())
}
