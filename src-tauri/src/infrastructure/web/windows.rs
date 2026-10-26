use tauri::{Manager, WebviewBuilder, WebviewUrl};

#[cfg(test)]
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
    create_persistent(app, label, Some(port), url, directory.path())?;
    Ok(directory)
}

pub(super) fn create_persistent(
    app: &tauri::AppHandle,
    label: &str,
    port: Option<u16>,
    url: tauri::Url,
    directory: &std::path::Path,
) -> Result<(), String> {
    if app
        .get_webview("main")
        .and_then(|main| main.url().ok())
        .is_some_and(|main| main.origin() == url.origin())
    {
        return Err("不能在网页 Block 中打开应用内部地址".into());
    }
    let view = mount(app, builder(app, label, port, directory)?)?;
    if let Err(error) = view.navigate(url) {
        let _ = view.close();
        return Err(format!("无法打开网页: {error}"));
    }
    Ok(())
}

pub(super) async fn create_popup(
    app: &tauri::AppHandle,
    label: &str,
    request: &str,
    port: Option<u16>,
    directory: &std::path::Path,
) -> Result<(), String> {
    let (handle, label, request_id, directory) = (
        app.clone(),
        label.to_owned(),
        request.to_owned(),
        directory.to_path_buf(),
    );
    let builder = super::windows_popups::on_ui(app, move || {
        let environment = super::windows_popup_pending::environment(&request_id)?;
        Ok(builder(&handle, &label, port, &directory)?.with_environment(environment))
    })
    .await?;
    let view = mount(app, builder)?;
    let (send, receive) = tokio::sync::oneshot::channel();
    let request = request.to_owned();
    let dispatched = view.with_webview(move |native| {
        let result = (|| {
            let pending = super::windows_popup_pending::take(&request)
                .ok_or("新窗口请求已失效，请重新点击链接")?;
            unsafe {
                let webview = native
                    .controller()
                    .CoreWebView2()
                    .map_err(|_| "无法读取新标签页")?;
                pending
                    .args
                    .SetNewWindow(&webview)
                    .map_err(|_| "无法接管网页新窗口")?;
            }
            drop(pending);
            Ok::<_, String>(())
        })();
        let _ = send.send(result);
    });
    let result = if dispatched.is_err() {
        Err("无法接管网页新窗口".into())
    } else {
        receive.await.unwrap_or_else(|_| Err("网页已关闭".into()))
    };
    if result.is_err() {
        let _ = view.close();
    }
    result
}

fn builder(
    app: &tauri::AppHandle,
    label: &str,
    port: Option<u16>,
    directory: &std::path::Path,
) -> Result<WebviewBuilder<tauri::Wry>, String> {
    let app_origin = app
        .get_webview("main")
        .and_then(|view| view.url().ok())
        .map(|url| url.origin());
    Ok(
        WebviewBuilder::new(label, WebviewUrl::External("about:blank".parse().unwrap()))
            .data_directory(directory.to_path_buf())
            .incognito(false)
            .initialization_script(super::scrollbars::script(None))
            .initialization_script(include_str!("metrics_script.mjs"))
            .initialization_script(super::windows_interaction::SCRIPT)
            .additional_browser_args(&browser_arguments(port))
            .disable_drag_drop_handler()
            .on_navigation(move |url| {
                (url.as_str() == "about:blank" || crate::domain::web::allowed_web_url(url.as_str()))
                    && app_origin
                        .as_ref()
                        .is_none_or(|origin| *origin != url.origin())
            })
            // Wry's default handler denies native popups. Our COM handler supplies a managed child.
            .on_download(|_, _| false),
    )
}

fn mount(
    app: &tauri::AppHandle,
    builder: WebviewBuilder<tauri::Wry>,
) -> Result<tauri::Webview, String> {
    let window = app.get_window("main").ok_or("主窗口不存在")?;
    let view = window
        .add_child(
            builder,
            tauri::LogicalPosition::new(-10000.0, -10000.0),
            tauri::LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "无法创建网页，请检查 WebView2 Runtime")?;
    let result = view
        .hide()
        .map_err(|_| "无法隐藏网页".to_owned())
        .and_then(|_| super::windows_surface::install_focus(&view))
        .and_then(|_| super::windows_shortcuts::install(&view))
        .and_then(|_| super::windows_navigation::install(&view))
        .and_then(|_| super::windows_interaction::install(&view))
        .and_then(|_| super::windows_popups::install(&view));
    if let Err(error) = result {
        let _ = view.close();
        return Err(error);
    }
    Ok(view)
}

// Wry 0.55 uses additional_browser_args instead of its generated proxy args.
// Keep the proxy in this same argument string so hardening cannot disable it.
fn browser_arguments(port: Option<u16>) -> String {
    let Some(port) = port else {
        // Local follows the OS network/proxy settings; guest privileges are unchanged.
        return "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".into();
    };
    format!(
        r#"--proxy-server=socks5://127.0.0.1:{port} --proxy-bypass-list=<-loopback> --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1" --disable-quic --force-webrtc-ip-handling-policy=disable_non_proxied_udp --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"#
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn local_does_not_install_remote_proxy_or_dns_rules() {
        let arguments = super::browser_arguments(None);
        assert!(!arguments.contains("proxy-server"));
        assert!(!arguments.contains("host-resolver-rules"));
    }

    #[test]
    fn proxy_and_dns_policy_are_in_the_same_argument_string() {
        let arguments = super::browser_arguments(Some(1080));
        assert!(arguments.contains("--proxy-server=socks5://127.0.0.1:1080"));
        assert!(arguments.contains("--proxy-bypass-list=<-loopback>"));
        assert!(
            arguments.contains(r#"--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1""#)
        );
    }
}
