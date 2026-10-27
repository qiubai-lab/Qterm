//! xterm owns a virtual selection; WebKit's native selectAll only sees its empty textarea.
use objc2::{class, msg_send, rc::Retained, runtime::AnyObject, sel};
use objc2_foundation::NSString;
use tauri::{AppHandle, Manager, Runtime};

pub(super) fn dispatch<R: Runtime>(app: &AppHandle<R>) {
    let Some(webview) = app.get_webview("main") else {
        return;
    };
    let _ = webview.with_webview(|native| {
        // SAFETY: Tauri invokes this on the AppKit main thread. Retain the host
        // and window until WebKit's asynchronous reply, which is also on main.
        unsafe {
            let host = native.inner().cast::<AnyObject>();
            let window: *mut AnyObject = msg_send![host, window];
            let application: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let key_window: *mut AnyObject = msg_send![application, keyWindow];
            if window.is_null() || window != key_window {
                native_select_all();
                return;
            }
            let responder: *mut AnyObject = msg_send![window, firstResponder];
            if responder != host {
                native_select_all();
                return;
            }
            let host = Retained::retain(host).unwrap();
            let window = Retained::retain(window).unwrap();
            let callback_host = host.clone();
            let callback = block2::RcBlock::new(move |handled: *mut AnyObject, error: *mut AnyObject| {
                let responder: *mut AnyObject = msg_send![&*window, firstResponder];
                let key_window: bool = msg_send![&*window, isKeyWindow];
                if !key_window || responder != Retained::as_ptr(&callback_host).cast_mut() {
                    return;
                }
                let handled = error.is_null() && !handled.is_null() && msg_send![handled, boolValue];
                if !handled {
                    native_select_all();
                }
            });
            // Only a focused terminal cancels this event. Inputs, editors and
            // other content retain AppKit's normal first-responder action.
            let script = NSString::from_str(
                "!!document.activeElement && !document.activeElement.dispatchEvent(new CustomEvent('qterm-terminal-select-all',{bubbles:true,cancelable:true}))",
            );
            let _: () = msg_send![&*host, evaluateJavaScript: &*script, completionHandler: &*callback];
        }
    });
}

unsafe fn native_select_all() {
    // SAFETY: Called on main. A nil target preserves AppKit's responder-chain
    // lookup, including native controls whose action lives on an ancestor.
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let _: bool = msg_send![app, sendAction: sel!(selectAll:), to: std::ptr::null::<AnyObject>(), from: std::ptr::null::<AnyObject>()];
    }
}
