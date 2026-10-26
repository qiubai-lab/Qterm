//! Isolated native menu regression: cargo run --example macos_block_close
//! No user configuration, sessions, plugins or remote pages are loaded.
#[cfg(target_os = "macos")]
#[path = "../src/infrastructure/macos_menu.rs"]
mod macos_menu;

#[cfg(not(target_os = "macos"))]
fn main() {}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn main() {
    use objc2::{class, msg_send, runtime::AnyObject};
    use objc2_foundation::{NSPoint, NSString};
    use std::{
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        time::{Duration, Instant},
    };
    use tauri::{Listener, Manager};

    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let mut app = tauri::Builder::default()
        .menu(macos_menu::build)
        .on_menu_event(macos_menu::handle)
        .build(context)
        .unwrap();
    let count = Arc::new(AtomicUsize::new(0));
    let received = count.clone();
    app.listen_any("qterm-close-block", move |_| {
        received.fetch_add(1, Ordering::SeqCst);
    });
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "main",
        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .title("Qterm isolated Command+W regression")
    .inner_size(640.0, 400.0)
    .build()
    .unwrap();
    window.set_focus().unwrap();
    let pump = |app: &mut tauri::App, duration: Duration| {
        let start = Instant::now();
        while start.elapsed() < duration {
            app.run_iteration(|_, _| {});
            std::thread::sleep(Duration::from_millis(5));
        }
    };
    pump(&mut app, Duration::from_millis(700));
    // SAFETY: This example runs on the AppKit main thread, uses only live native
    // handles and posts autoreleased NSEvents to the application event queue.
    unsafe {
        let native: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![native, activateIgnoringOtherApps: true];
        let menu: *mut AnyObject = msg_send![native, mainMenu];
        let (close_count, quit_count) = inspect_menu(menu);
        assert_eq!(close_count, 1, "exactly one Cmd+W menu owner");
        assert_eq!(quit_count, 1, "preserve Cmd+Q");
    }
    pump(&mut app, Duration::from_millis(300));
    assert!(window.is_focused().unwrap());
    let send = |repeat: bool, key_up: bool| unsafe {
        let native: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let ns_window = window.ns_window().unwrap() as *mut AnyObject;
        let number: isize = msg_send![ns_window, windowNumber];
        let chars = NSString::from_str("w");
        let event: *mut AnyObject = msg_send![class!(NSEvent),
            keyEventWithType: if key_up { 11usize } else { 10usize }, location: NSPoint::new(0.0, 0.0),
            modifierFlags: 1usize << 20, timestamp: 0.0f64,
            windowNumber: number, context: std::ptr::null::<AnyObject>(),
            characters: &*chars, charactersIgnoringModifiers: &*chars,
            isARepeat: repeat, keyCode: 13u16];
        let _: () = msg_send![native, postEvent: event, atStart: false];
    };
    send(false, false);
    pump(&mut app, Duration::from_millis(500));
    assert_eq!(count.load(Ordering::SeqCst), 1, "Cmd+W routes once");
    assert!(
        app.get_webview_window("main").is_some(),
        "window survives Cmd+W"
    );
    send(true, false);
    pump(&mut app, Duration::from_millis(300));
    assert_eq!(
        count.load(Ordering::SeqCst),
        1,
        "repeat does not close another block"
    );
    send(false, true);
    pump(&mut app, Duration::from_millis(100));
    send(false, false);
    pump(&mut app, Duration::from_millis(300));
    assert_eq!(
        count.load(Ordering::SeqCst),
        2,
        "next distinct press still works"
    );
    window.close().unwrap();
    pump(&mut app, Duration::from_millis(300));
    assert!(
        app.get_webview_window("main").is_none(),
        "ordinary window close still works"
    );
    println!(
        "PASS: native Cmd+W dispatch, repeat protection, window survival, Cmd+Q menu and ordinary close"
    );
}

#[cfg(target_os = "macos")]
unsafe fn inspect_menu(menu: *mut objc2::runtime::AnyObject) -> (usize, usize) {
    use objc2::{
        msg_send,
        runtime::{AnyObject, Sel},
    };
    use objc2_foundation::NSString;
    let mut result = (0, 0);
    // SAFETY: Recursive traversal of live NSMenu items on the main thread.
    unsafe {
        let length: isize = msg_send![menu, numberOfItems];
        for index in 0..length {
            let item: *mut AnyObject = msg_send![menu, itemAtIndex: index];
            let submenu: *mut AnyObject = msg_send![item, submenu];
            if !submenu.is_null() {
                let nested = inspect_menu(submenu);
                result.0 += nested.0;
                result.1 += nested.1;
            }
            let key: *const NSString = msg_send![item, keyEquivalent];
            let flags: usize = msg_send![item, keyEquivalentModifierMask];
            if !key.is_null() && flags == 1 << 20 {
                match (&*key).to_string().as_str() {
                    "w" => {
                        let action: Option<Sel> = msg_send![item, action];
                        assert_ne!(action, Some(objc2::sel!(performClose:)));
                        result.0 += 1;
                    }
                    "q" => result.1 += 1,
                    _ => {}
                }
            }
        }
    }
    result
}
