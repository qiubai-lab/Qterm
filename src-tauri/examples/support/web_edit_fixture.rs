//! Main-thread fixture for the production Swift guest and Tauri Edit menu.
#![allow(deprecated)]
use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};
use objc2_foundation::{NSPoint, NSString};
use serde_json::{Value, json};
use std::{
    ffi::{CStr, CString, c_char, c_void},
    sync::mpsc,
    time::{Duration, Instant},
};

#[link(name = "QtermWeb", kind = "static")]
unsafe extern "C" {
    fn qterm_web_command(
        text: *const c_char,
        window: *mut c_void,
        context: *mut c_void,
        reply: unsafe extern "C" fn(*mut c_void, *const c_char),
        event: unsafe extern "C" fn(*const c_char, *const c_char),
    );
}
unsafe extern "C" fn reply(context: *mut c_void, text: *const c_char) {
    // Swift consumes each callback once; the fixture pumps until it returns.
    let sender = unsafe { Box::from_raw(context.cast::<mpsc::Sender<Value>>()) };
    let value = serde_json::from_slice(unsafe { CStr::from_ptr(text) }.to_bytes()).unwrap();
    let _ = sender.send(value);
}
static TAB_CLOSES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
unsafe extern "C" fn event(name: *const c_char, _: *const c_char) {
    if unsafe { CStr::from_ptr(name) }.to_bytes() == b"qterm-close-web-tab" {
        TAB_CLOSES.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
}
pub fn tab_closes() -> usize {
    TAB_CLOSES.load(std::sync::atomic::Ordering::SeqCst)
}

pub const CMD: usize = 1 << 20;
pub const SHIFT: usize = 1 << 17;
pub const CTRL: usize = 1 << 18;

pub struct Fixture {
    pub app: tauri::App,
    pub main: tauri::WebviewWindow,
    window: *mut AnyObject,
    guest: *mut AnyObject,
}
impl Fixture {
    pub fn new() -> Self {
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        let app = tauri::Builder::default()
            .menu(super::macos_menu::build)
            .on_menu_event(super::macos_menu::handle)
            .build(context)
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .title("Qterm isolated web editing regression")
        .inner_size(850.0, 650.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .build()
        .unwrap();
        let window = main.ns_window().unwrap().cast();
        let mut result = Self {
            app,
            main,
            window,
            guest: std::ptr::null_mut(),
        };
        result
            .app
            .set_activation_policy(tauri::ActivationPolicy::Regular);
        result.pump(700);
        result.command(json!({"op":"open","id":"editing","store":uuid::Uuid::new_v4().to_string(),"url":"about:blank","appOrigin":"tauri://localhost"}));
        result.command(json!({"op":"sync","id":"editing","bounds":{"x":10,"y":100,"width":800,"height":500,"visible":true}}));
        result.pump(300);
        // SAFETY: This fixture creates exactly one surface after Tauri's host view.
        unsafe {
            let content: *mut AnyObject = msg_send![window, contentView];
            let children: *mut AnyObject = msg_send![content, subviews];
            let surface: *mut AnyObject = msg_send![children, lastObject];
            let children: *mut AnyObject = msg_send![surface, subviews];
            result.guest = msg_send![children, firstObject];
            let native: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![native, activateIgnoringOtherApps: true];
        }
        let focus_deadline = Instant::now() + Duration::from_secs(3);
        while !result.main.is_focused().unwrap() && Instant::now() < focus_deadline {
            unsafe {
                let native: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
                let _: () = msg_send![native, activateIgnoringOtherApps: true];
                let _: () = msg_send![window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
            }
            result.pump(200);
        }
        result.focus_guest();
        assert!(
            result.main.is_focused().unwrap(),
            "fixture window must have keyboard focus"
        );
        result
    }
    pub fn pump(&mut self, millis: u64) {
        let end = Instant::now() + Duration::from_millis(millis);
        while Instant::now() < end {
            self.app.run_iteration(|_, _| {});
            std::thread::sleep(Duration::from_millis(5));
        }
    }
    pub fn command(&mut self, value: Value) -> Value {
        let (sender, receiver) = mpsc::channel::<Value>();
        let text = CString::new(value.to_string()).unwrap();
        // SAFETY: Main thread; the boxed sender is owned by the one-shot reply.
        unsafe {
            qterm_web_command(
                text.as_ptr(),
                self.window.cast(),
                Box::into_raw(Box::new(sender)).cast(),
                reply,
                event,
            );
        }
        self.receive(receiver)
    }
    fn receive(&mut self, receiver: mpsc::Receiver<Value>) -> Value {
        let end = Instant::now() + Duration::from_secs(5);
        loop {
            if let Ok(value) = receiver.try_recv() {
                assert!(value.get("error").is_none(), "{value}");
                return value["ok"].clone();
            }
            assert!(Instant::now() < end, "native response timeout");
            self.pump(5);
        }
    }
    pub fn eval(&mut self, script: &str) -> Value {
        self.command(json!({"op":"eval","id":"editing","script":script}))
    }
    pub fn host_eval(&mut self, script: &str) -> Value {
        let (send, receive) = mpsc::channel();
        let script = NSString::from_str(&format!(
            "JSON.stringify(eval({}))",
            serde_json::to_string(script).unwrap()
        ));
        let completion =
            block2::RcBlock::new(move |value: *mut AnyObject, error: *mut AnyObject| {
                let result = if !error.is_null() || value.is_null() {
                    json!({"error":"host evaluation failed"})
                } else {
                    // JSON.stringify guarantees an NSString result for these fixture expressions.
                    let text = unsafe { &*value.cast::<NSString>() }.to_string();
                    json!({"ok": serde_json::from_str::<Value>(&text).unwrap()})
                };
                let _ = send.send(result);
            });
        // The external about:blank host has no Tauri callback IPC; evaluate on
        // its WKWebView directly, without adding privileges to the guest.
        unsafe {
            let content: *mut AnyObject = msg_send![self.window, contentView];
            let children: *mut AnyObject = msg_send![content, subviews];
            let host: *mut AnyObject = msg_send![children, firstObject];
            let _: () =
                msg_send![host, evaluateJavaScript: &*script, completionHandler: &*completion];
        }
        self.receive(receive)
    }
    pub fn focus_guest(&mut self) {
        // SAFETY: The guest remains attached until fixture teardown.
        unsafe {
            let accepted: bool = msg_send![self.window, makeFirstResponder: self.guest];
            assert!(accepted);
        }
        self.pump(100);
    }
    pub fn assert_js(&mut self, script: &str, expected: Value, message: &str) {
        let end = Instant::now() + Duration::from_secs(3);
        loop {
            let actual = self.eval(script);
            if actual == expected {
                return;
            }
            if Instant::now() >= end {
                assert_eq!(actual, expected, "{message}");
            }
            self.pump(20);
        }
    }
    pub fn assert_clipboard(&mut self, clipboard: &Clipboard, expected: &str, message: &str) {
        let end = Instant::now() + Duration::from_secs(3);
        while clipboard.text() != expected && Instant::now() < end {
            self.pump(20);
        }
        assert_eq!(clipboard.text(), expected, "{message}");
    }
    pub fn key(&mut self, key: &str, code: u16, modifiers: usize) {
        // Interactive desktop focus can change between assertions. Preserve the
        // fixture's first responder while activating its window, then dispatch
        // synchronously so another application cannot receive a queued chord.
        self.pump(150);
        let responder: *mut AnyObject = unsafe { msg_send![self.window, firstResponder] };
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            unsafe {
                let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
                let _: () = msg_send![app, activateIgnoringOtherApps: true];
                let _: () =
                    msg_send![self.window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
            }
            self.pump(50);
            if self.main.is_focused().unwrap() {
                break;
            }
            assert!(Instant::now() < deadline, "fixture lost keyboard focus");
        }
        unsafe {
            let _: bool = msg_send![self.window, makeFirstResponder: responder];
        }
        // Use the real application path, including local monitors, WebKit
        // equivalents and native menu dispatch; never execute edit actions directly.
        unsafe {
            let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let number: isize = msg_send![self.window, windowNumber];
            let chars = NSString::from_str(key);
            for kind in [10usize, 11usize] {
                let event: *mut AnyObject = msg_send![class!(NSEvent), keyEventWithType: kind, location: NSPoint::new(0.0, 0.0),
                    modifierFlags: modifiers, timestamp: 0.0f64, windowNumber: number, context: std::ptr::null::<AnyObject>(),
                    characters: &*chars, charactersIgnoringModifiers: &*chars, isARepeat: false, keyCode: code];
                let _: () = msg_send![app, sendEvent: event];
            }
        }
        self.pump(250);
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.command(json!({"op":"close","id":"editing"}));
        self.main.close().unwrap();
        self.pump(100);
    }
}

/// Preserve every pasteboard item/type, not just text, while testing native edits.
pub struct Clipboard {
    board: *mut AnyObject,
    saved: Retained<AnyObject>,
}
impl Clipboard {
    pub fn save() -> Self {
        // SAFETY: All objects are accessed on the AppKit main thread. Snapshot
        // into new items because NSPasteboardItem cannot be written twice.
        unsafe {
            let board: *mut AnyObject = msg_send![class!(NSPasteboard), generalPasteboard];
            let saved: Retained<AnyObject> = msg_send![class!(NSMutableArray), new];
            let items: *mut AnyObject = msg_send![board, pasteboardItems];
            if !items.is_null() {
                let count: usize = msg_send![items, count];
                for index in 0..count {
                    let item: *mut AnyObject = msg_send![items, objectAtIndex: index];
                    let copy: Retained<AnyObject> = msg_send![class!(NSPasteboardItem), new];
                    let types: *mut AnyObject = msg_send![item, types];
                    let count: usize = msg_send![types, count];
                    for index in 0..count {
                        let kind: *mut AnyObject = msg_send![types, objectAtIndex: index];
                        let data: *mut AnyObject = msg_send![item, dataForType: kind];
                        if !data.is_null() {
                            let _: bool = msg_send![&*copy, setData: data, forType: kind];
                        }
                    }
                    let _: () = msg_send![&*saved, addObject: &*copy];
                }
            }
            Self { board, saved }
        }
    }
    pub fn text(&self) -> String {
        unsafe {
            let kind = NSString::from_str("public.utf8-plain-text");
            let value: *const NSString = msg_send![self.board, stringForType: &*kind];
            if value.is_null() {
                String::new()
            } else {
                (&*value).to_string()
            }
        }
    }
    pub fn set_text(&self, text: &str) {
        unsafe {
            let _: isize = msg_send![self.board, clearContents];
            let text = NSString::from_str(text);
            let kind = NSString::from_str("public.utf8-plain-text");
            let _: bool = msg_send![self.board, setString: &*text, forType: &*kind];
        }
    }
    pub fn set_png(&self) {
        // A real one-pixel PNG, so WebKit must dispatch an image paste with no text.
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==").unwrap();
        unsafe {
            let _: isize = msg_send![self.board, clearContents];
            let data: *mut AnyObject = msg_send![class!(NSData), dataWithBytes: bytes.as_ptr().cast::<c_void>(), length: bytes.len()];
            let kind = NSString::from_str("public.png");
            let _: bool = msg_send![self.board, setData: data, forType: &*kind];
        }
    }
}
impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            let _: isize = msg_send![self.board, clearContents];
            let _: bool = msg_send![self.board, writeObjects: &*self.saved];
        }
    }
}
