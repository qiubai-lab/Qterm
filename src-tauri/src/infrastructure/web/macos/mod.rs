//! Narrow async bridge to main-thread AppKit/WebKit ownership. Guests receive no Tauri scripts.
mod store;
pub(super) mod tunnel;

use serde_json::{Value, json};
use std::{
    ffi::{CStr, CString, c_char, c_void},
    sync::OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();
type Callback = unsafe extern "C" fn(*mut c_void, *const c_char);
type Event = unsafe extern "C" fn(*const c_char, *const c_char);
unsafe extern "C" {
    fn qterm_web_supported() -> bool;
    fn qterm_web_remote_supported() -> bool;
    fn qterm_web_command(
        request: *const c_char,
        window: *mut c_void,
        context: *mut c_void,
        callback: Callback,
        event: Event,
    );
}

pub(super) fn supported() -> bool {
    unsafe { qterm_web_supported() }
}

pub(super) fn remote_supported() -> bool {
    unsafe { qterm_web_remote_supported() }
}

unsafe extern "C" fn event(name: *const c_char, data: *const c_char) {
    if name.is_null() || data.is_null() {
        return;
    }
    let (name, data) = unsafe { (CStr::from_ptr(name), CStr::from_ptr(data)) };
    let Ok(name) = name.to_str() else {
        return;
    };
    if ![
        "web-page-state",
        "web-guest-focused",
        "web-popup",
        "web-window-close",
    ]
    .contains(&name)
    {
        return;
    }
    if let (Some(app), Ok(value)) = (APP.get(), serde_json::from_slice::<Value>(data.to_bytes())) {
        let _ = app.emit_to("main", name, value);
    }
}

type Sender = tokio::sync::oneshot::Sender<Result<Value, String>>;
unsafe extern "C" fn reply(context: *mut c_void, data: *const c_char) {
    // Swift Reply consumes this callback exactly once, including error/timeout paths.
    let sender = unsafe { Box::from_raw(context.cast::<Sender>()) };
    let result = if data.is_null() {
        Err("原生浏览器响应为空".into())
    } else {
        let bytes = unsafe { CStr::from_ptr(data) }.to_bytes();
        serde_json::from_slice::<Value>(bytes)
            .map_err(|_| "原生浏览器响应无效".to_owned())
            .and_then(|value| {
                if let Some(error) = value.get("error").and_then(Value::as_str) {
                    Err(error.into())
                } else {
                    Ok(value.get("ok").cloned().unwrap_or(Value::Null))
                }
            })
    };
    let _ = sender.send(result);
}

pub(super) async fn request(app: &AppHandle, value: Value) -> Result<Value, String> {
    if !supported() {
        return Err("内部浏览器需要 macOS 14 或更高版本".into());
    }
    APP.get_or_init(|| app.clone());
    let text = CString::new(value.to_string()).map_err(|_| "原生浏览器请求无效")?;
    let (send, receive) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let window = match handle
            .get_window("main")
            .and_then(|window| window.ns_window().ok())
        {
            Some(window) => window,
            None => {
                let _ = send.send(Err("主窗口不存在".into()));
                return;
            }
        };
        let context = Box::into_raw(Box::new(send)).cast();
        unsafe {
            qterm_web_command(text.as_ptr(), window, context, reply, event);
        }
    })
    .map_err(|_| "无法访问原生浏览器")?;
    receive
        .await
        .map_err(|_| "原生浏览器响应已取消".to_owned())?
}

pub(super) async fn create(
    app: &AppHandle,
    label: &str,
    port: Option<u16>,
    url: &tauri::Url,
    directory: &std::path::Path,
) -> Result<(), String> {
    let directory = directory.to_path_buf();
    let store = tokio::task::spawn_blocking(move || store::resolve(&directory))
        .await
        .map_err(|_| "无法初始化浏览环境")??;
    let app_origin = app
        .get_webview("main")
        .and_then(|view| view.url().ok())
        .map(|url| url.origin().ascii_serialization());
    request(app, json!({"op":"open", "id":label, "store":store, "port":port, "url":url,
        "appOrigin":app_origin, "tunnelScript":include_str!("tunnel_script.mjs"), "scripts":[super::scrollbars::script(None), include_str!("../metrics_script.mjs")]})).await.map(|_| ())
}

pub(super) async fn sync(
    app: &AppHandle,
    label: &str,
    bounds: &super::WebBounds,
) -> Result<(), String> {
    request(
        app,
        json!({"op":"sync","id":label,"bounds":bounds,
        "scrollbarScript":super::scrollbars::script(bounds.scrollbar.as_ref())}),
    )
    .await?;
    Ok(())
}

pub(super) async fn eval(app: &AppHandle, label: &str, script: &str) -> Result<Value, String> {
    request(app, json!({"op":"eval", "id":label, "script":script})).await
}

pub(super) async fn close(app: &AppHandle, label: &str) -> Result<(), String> {
    request(app, json!({"op":"close", "id":label}))
        .await
        .map(|_| ())
}
