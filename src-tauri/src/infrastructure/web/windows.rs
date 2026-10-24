use tauri::{Manager, WebviewBuilder, WebviewUrl, webview::NewWindowResponse};

pub(super) fn create(
    app: &tauri::AppHandle,
    label: &str,
    port: u16,
    url: tauri::Url,
) -> Result<tempfile::TempDir, String> {
    let directory = tempfile::Builder::new()
        .prefix("qterm-web-")
        .tempdir()
        .map_err(|_| "无法创建独立浏览会话")?;
    let window = app.get_window("main").ok_or("主窗口不存在")?;
    let app_origin = app
        .get_webview("main")
        .and_then(|view| view.url().ok())
        .map(|url| url.origin());
    if app_origin
        .as_ref()
        .is_some_and(|origin| *origin == url.origin())
    {
        return Err("不能在网页 Block 中打开应用内部地址".into());
    }
    let builder = WebviewBuilder::new(label, WebviewUrl::External("about:blank".parse().unwrap()))
        .data_directory(directory.path().to_path_buf())
        .incognito(true)
        .additional_browser_args(&browser_arguments(port))
        .disable_drag_drop_handler()
        .on_navigation(move |url| {
            crate::domain::web::allowed_web_url(url.as_str())
                && app_origin
                    .as_ref()
                    .is_none_or(|origin| *origin != url.origin())
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false);
    let view = window
        .add_child(
            builder,
            tauri::LogicalPosition::new(-10000.0, -10000.0),
            tauri::LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "无法创建网页，请检查 WebView2 Runtime")?;
    if view.hide().is_err() {
        let _ = view.close();
        return Err("无法隐藏网页".into());
    }
    if let Err(error) = super::windows_surface::install_focus(&view) {
        let _ = view.close();
        return Err(error);
    }
    if let Err(error) = super::windows_navigation::install(&view)
        .and_then(|_| view.navigate(url).map_err(|_| "无法打开网页".to_owned()))
    {
        let _ = view.close();
        return Err(error);
    }
    Ok(directory)
}

// Wry 0.55 uses additional_browser_args instead of its generated proxy args.
// Keep the proxy in this same argument string so hardening cannot disable it.
fn browser_arguments(port: u16) -> String {
    format!(
        r#"--proxy-server=socks5://127.0.0.1:{port} --proxy-bypass-list=<-loopback> --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1" --disable-quic --force-webrtc-ip-handling-policy=disable_non_proxied_udp --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"#
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn proxy_and_dns_policy_are_in_the_same_argument_string() {
        let arguments = super::browser_arguments(1080);
        assert!(arguments.contains("--proxy-server=socks5://127.0.0.1:1080"));
        assert!(arguments.contains("--proxy-bypass-list=<-loopback>"));
        assert!(
            arguments.contains(r#"--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1""#)
        );
    }
}
