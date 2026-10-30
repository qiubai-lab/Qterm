//! xterm selection is virtual; other windows and guests retain the native responder chain.
use objc2::{class, msg_send, runtime::AnyObject, sel};
use tauri::{AppHandle, Manager};
use tauri_runtime_cef::{WebviewCefExt, cef::*};

pub(super) fn dispatch(app: &AppHandle) {
    let Some(view) = app.get_webview("main") else {
        return;
    };
    let selection = view.clone();
    let _ = view.with_cef_webview(move |native| {
        if !main_is_focused(native) {
            native_select_all();
            return;
        }
        let reply = selection.clone();
        let _ = selection.eval_with_callback("!!document.activeElement && !document.activeElement.dispatchEvent(new CustomEvent('qterm-terminal-select-all',{bubbles:true,cancelable:true}))", move |handled| {
            let _ = reply.with_cef_webview(move |native| {
                // Do not select a different pane if focus changed during JS evaluation.
                if handled != "true" && main_is_focused(native) { native_select_all(); }
            });
        });
    });
}
fn main_is_focused(native: &tauri_runtime_cef::Webview) -> bool {
    let Some(host) = native.browser().host() else {
        return false;
    };
    // SAFETY: with_cef_webview dispatches to the AppKit/CEF UI thread. Native
    // handles are borrowed only within this callback, never across async work.
    unsafe {
        let view = host.window_handle().cast::<AnyObject>();
        if view.is_null() {
            return false;
        }
        let window: *mut AnyObject = msg_send![view, window];
        if window.is_null() {
            return false;
        }
        let key: bool = msg_send![window, isKeyWindow];
        let responder: *mut AnyObject = msg_send![window, firstResponder];
        let is_view: bool =
            !responder.is_null() && msg_send![responder, isKindOfClass: class!(NSView)];
        key && is_view && msg_send![responder, isDescendantOf: view]
    }
}
fn native_select_all() {
    // SAFETY: Called only on the AppKit main thread, nil preserves responder lookup.
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let _: bool = msg_send![app, sendAction: sel!(selectAll:), to: std::ptr::null::<AnyObject>(), from: std::ptr::null::<AnyObject>()];
    }
}
