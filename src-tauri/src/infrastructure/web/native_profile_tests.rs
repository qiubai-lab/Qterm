//! Integrated into native_webview_smoke; never reads or clears user profiles.
use super::{native_surface_tests::pump, windows, windows_data};
use crate::domain::web_storage::ClearBrowserData;
use tauri::Manager;

fn eval(app: &mut tauri::App, view: &tauri::Webview, script: &str) -> String {
    let (send, receive) = std::sync::mpsc::channel();
    view.eval_with_callback(script, move |value| {
        let _ = send.send(value);
    })
    .unwrap();
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap()
}
fn clear(app: &mut tauri::App, view: &tauri::Webview, selection: ClearBrowserData) {
    let page = view.clone();
    let (send, receive) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let _ = send.send(windows_data::clear(&page, selection).await);
    });
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap().unwrap();
}
fn open(app: &mut tauri::App, path: &std::path::Path, port: u16, label: &str) -> tauri::Webview {
    let app_handle = app.handle().clone();
    let path = path.to_owned();
    let name = label.to_owned();
    let (send, receive) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = send.send(windows::create_persistent(
            &app_handle,
            &name,
            Some(port),
            "http://internal.invalid:8765/".parse().unwrap(),
            &path,
        ));
    });
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap().unwrap();
    let view = app.get_webview(label).unwrap();
    for _ in 0..30 {
        if eval(
            app,
            &view,
            "location.hostname === 'internal.invalid' && document.readyState === 'complete'",
        ) == "true"
        {
            return view;
        }
        let until = std::time::Instant::now() + std::time::Duration::from_millis(100);
        pump(app, || std::time::Instant::now() >= until);
    }
    panic!("shared profile did not load")
}

pub(super) fn verify(
    app: &mut tauri::App,
    a: &tauri::Webview,
    b: &tauri::Webview,
    path: &std::path::Path,
    port: u16,
) {
    eval(
        app,
        a,
        "document.cookie='persistentProof=shared; Max-Age=3600; SameSite=Lax'; localStorage.setItem('profile-proof','shared'); true",
    );
    let shared = open(app, path, port, "web-shared-proof");
    assert_eq!(
        eval(
            app,
            &shared,
            "document.cookie.includes('persistentProof=shared') && localStorage.getItem('profile-proof')==='shared'"
        ),
        "true"
    );
    assert_eq!(
        eval(
            app,
            b,
            "!document.cookie.includes('persistentProof=shared') && localStorage.getItem('profile-proof')===null"
        ),
        "true"
    );
    clear(
        app,
        &shared,
        ClearBrowserData {
            cache: true,
            cookies: false,
            storage: false,
        },
    );
    assert_eq!(
        eval(app, a, "document.cookie.includes('persistentProof=shared')"),
        "true"
    );
    let pages = vec![a.clone(), shared.clone()];
    let (send, receive) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let _ = send.send(
            super::clear_data::clear_views(
                &pages,
                ClearBrowserData {
                    cache: true,
                    cookies: false,
                    storage: false,
                },
            )
            .await,
        );
    });
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap().unwrap();
    let until = std::time::Instant::now() + std::time::Duration::from_millis(500);
    pump(app, || std::time::Instant::now() >= until);
    assert_eq!(
        eval(
            app,
            a,
            "location.hostname === 'internal.invalid' && document.cookie.includes('persistentProof=shared')"
        ),
        "true"
    );
    shared.close().unwrap();
    let reopened = open(app, path, port, "web-shared-reopened");
    assert_eq!(
        eval(
            app,
            &reopened,
            "document.cookie.includes('persistentProof=shared') && localStorage.getItem('profile-proof')==='shared'"
        ),
        "true"
    );
    clear(
        app,
        &reopened,
        ClearBrowserData {
            cache: false,
            cookies: true,
            storage: true,
        },
    );
    assert_eq!(
        eval(
            app,
            a,
            "!document.cookie.includes('persistentProof=shared') && localStorage.getItem('profile-proof')===null"
        ),
        "true"
    );
    assert_eq!(eval(app, b, "document.cookie.includes('route=B')"), "true");
    reopened.close().unwrap();
    let disk = tempfile::tempdir().unwrap();
    let persisted = open(app, disk.path(), port, "web-disk-first");
    eval(
        app,
        &persisted,
        "document.cookie='diskProof=saved; Max-Age=3600; SameSite=Lax'; localStorage.setItem('disk-proof','saved'); true",
    );
    persisted.close().unwrap();
    drop(persisted);
    let until = std::time::Instant::now() + std::time::Duration::from_millis(1500);
    pump(app, || std::time::Instant::now() >= until);
    let restored = open(app, disk.path(), port, "web-disk-second");
    assert_eq!(
        eval(
            app,
            &restored,
            "document.cookie.includes('diskProof=saved') && localStorage.getItem('disk-proof')==='saved'"
        ),
        "true"
    );
    restored.close().unwrap();
    eprintln!(
        "PASS: same-profile sharing/reopen, cross-profile isolation, selective cache/cookie/storage clearing"
    );
}
