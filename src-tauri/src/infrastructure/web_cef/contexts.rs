//! Native identity and immutable connection proxy binding.
use tauri_runtime_cef::cef::{self, *};
pub(super) fn bind(
    view: &tauri_runtime_cef::Webview,
    port: Option<u16>,
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

fn verify(context: &RequestContext, port: Option<u16>) -> Result<(), String> {
    let preference = context
        .preference(Some(&CefString::from("proxy")))
        .ok_or("missing proxy preference")?;
    let dictionary = preference.dictionary().ok_or("proxy is not a dictionary")?;
    for (key, expected) in [
        (
            "mode",
            if port.is_some() {
                "fixed_servers"
            } else {
                "system"
            }
            .to_string(),
        ),
        (
            "server",
            port.map(|port| format!("socks5://127.0.0.1:{port}"))
                .unwrap_or_default(),
        ),
        (
            "bypass_list",
            if port.is_some() { "<-loopback>" } else { "" }.to_string(),
        ),
    ] {
        if CefString::from(&dictionary.string(Some(&CefString::from(key)))).to_string() != expected
        {
            return Err(format!("connection proxy preference changed: {key}"));
        }
    }
    Ok(())
}

pub(super) fn apply(context: &RequestContext, port: Option<u16>) -> Result<(), String> {
    let mut dictionary = cef::dictionary_value_create().ok_or("allocate dictionary")?;
    for (key, text) in [
        (
            "mode",
            if port.is_some() {
                "fixed_servers"
            } else {
                "system"
            }
            .to_string(),
        ),
        (
            "server",
            port.map(|port| format!("socks5://127.0.0.1:{port}"))
                .unwrap_or_default(),
        ),
        // Subtract Chromium's implicit localhost bypass.
        (
            "bypass_list",
            if port.is_some() { "<-loopback>" } else { "" }.to_string(),
        ),
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

pub(super) async fn retire(
    app: &tauri::AppHandle,
    directory: std::path::PathBuf,
    context: RequestContext,
) -> Result<(), String> {
    let (mut flush, flushed) = super::native::completion();
    let captured = context.clone();
    super::native::on_ui(app, move || {
        let manager = captured
            .cookie_manager(None)
            .ok_or("无法读取 Cookie 存储")?;
        if manager.flush_store(Some(&mut flush)) != 1 {
            return Err("无法保存 Cookie".into());
        }
        Ok(())
    })
    .await?;
    super::native::completed(flushed).await?;
    let (mut close, closed) = super::native::completion();
    let captured = context.clone();
    super::native::on_ui(app, move || {
        captured.close_all_connections(Some(&mut close));
        Ok(())
    })
    .await?;
    super::native::completed(closed).await?;
    // A popup admitted just before close may not have reached OnAfterCreated
    // when we captured the native browser list. The pool tracks those requests.
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        let key = directory.clone();
        match super::native::on_ui(app, move || {
            tauri_runtime_cef::close_request_context_browsers(&key)?;
            tauri_runtime_cef::retire_request_context(&key)
        })
        .await
        {
            Ok(_) => break,
            Err(error)
                if error == "request context still has initializing or live browsers"
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            Err(error) => return Err(error),
        }
    }
    super::native::on_ui(app, move || {
        drop(context);
        Ok(())
    })
    .await
}

/// Stop new worker/page requests before any asynchronous native teardown.
pub(super) fn block(context: &RequestContext) -> Result<(), String> {
    let directory = std::path::PathBuf::from(CefString::from(&context.cache_path()).to_string());
    tauri_runtime_cef::set_request_context_network_enabled(&directory, false)?;
    apply(
        context,
        Some(crate::infrastructure::cef_runtime::rejecting_port()),
    )
}
