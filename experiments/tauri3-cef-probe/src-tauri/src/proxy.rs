use tauri_runtime_cef::{
    WebviewCefExt,
    cef::{self, *},
};

pub fn configure(window: &tauri::WebviewWindow, port: u16) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .with_cef_webview(move |view| {
            let _ = sender.send(apply(view, port));
        })
        .map_err(|e| e.to_string())?;
    receiver
        .recv_timeout(std::time::Duration::from_secs(15))
        .map_err(|e| format!("proxy initialization timeout: {e}"))?
}

fn apply(view: &tauri_runtime_cef::Webview, port: u16) -> Result<(), String> {
    let context = view
        .browser()
        .host()
        .ok_or("missing browser host")?
        .request_context()
        .ok_or("missing request context")?;
    let mut dictionary = cef::dictionary_value_create().ok_or("allocate dictionary")?;
    for (key, text) in [
        ("mode", "fixed_servers".to_string()),
        ("server", format!("socks5://127.0.0.1:{port}")),
        // Subtract Chromium's implicit localhost bypass.
        ("bypass_list", "<-loopback>".to_string()),
    ] {
        let mut value = cef::value_create().ok_or("allocate preference value")?;
        if value.set_string(Some(&CefString::from(text.as_str()))) != 1
            || dictionary.set_value(Some(&CefString::from(key)), Some(&mut value)) != 1
        {
            return Err("construct proxy preference failed".into());
        }
    }
    let mut value = cef::value_create().ok_or("allocate proxy preference")?;
    if value.set_dictionary(Some(&mut dictionary)) != 1 {
        return Err("construct proxy dictionary failed".into());
    }
    let name = CefString::from("proxy");
    let mut error = CefString::from("");
    if context.can_set_preference(Some(&name)) != 1
        || context.set_preference(Some(&name), Some(&mut value), Some(&mut error)) != 1
    {
        return Err(format!("CEF refused proxy preference: {error}"));
    }
    Ok(())
}
