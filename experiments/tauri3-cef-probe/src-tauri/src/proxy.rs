use tauri_runtime_cef::{
    WebviewCefExt,
    cef::{self, *},
};

pub fn configure(
    window: &tauri::WebviewWindow,
    port: u16,
    expected: Option<RequestContext>,
    others: Vec<RequestContext>,
) -> Result<RequestContext, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .with_cef_webview(move |view| {
            let _ = sender.send(bind(view, port, expected, others));
        })
        .map_err(|e| e.to_string())?;
    receiver
        .recv_timeout(std::time::Duration::from_secs(15))
        .map_err(|e| format!("proxy initialization timeout: {e}"))?
}

fn bind(
    view: &tauri_runtime_cef::Webview,
    port: u16,
    expected: Option<RequestContext>,
    others: Vec<RequestContext>,
) -> Result<RequestContext, String> {
    let context = view
        .browser()
        .host()
        .ok_or("missing browser host")?
        .request_context()
        .ok_or("missing request context")?;
    for mut other in others {
        if context.is_same(Some(&mut other)) != 0 || context.is_sharing_with(Some(&mut other)) != 0
        {
            return Err("independent SSH connections share a native context or storage".into());
        }
    }
    if let Some(mut expected) = expected {
        if context.is_same(Some(&mut expected)) != 1 {
            return Err("same connection did not reuse its native RequestContext".into());
        }
        verify(&context, port)?;
    } else {
        apply(&context, port)?;
        verify(&context, port)?;
    }
    Ok(context)
}

fn verify(context: &RequestContext, port: u16) -> Result<(), String> {
    let preference = context
        .preference(Some(&CefString::from("proxy")))
        .ok_or("missing proxy preference")?;
    let dictionary = preference.dictionary().ok_or("proxy is not a dictionary")?;
    for (key, expected) in [
        ("mode", "fixed_servers".to_string()),
        ("server", format!("socks5://127.0.0.1:{port}")),
        ("bypass_list", "<-loopback>".to_string()),
    ] {
        if CefString::from(&dictionary.string(Some(&CefString::from(key)))).to_string() != expected
        {
            return Err(format!("connection proxy preference changed: {key}"));
        }
    }
    Ok(())
}

fn apply(context: &RequestContext, port: u16) -> Result<(), String> {
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
