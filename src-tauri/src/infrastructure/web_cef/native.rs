//! Awaitable CEF UI dispatch. Never block the application event loop on native callbacks.
use std::time::Duration;
use tauri::Manager;
use tauri_runtime_cef::{WebviewCefExt, cef::*};

pub(super) async fn with<T: Send + 'static>(
    view: &tauri::Webview,
    work: impl FnOnce(&tauri_runtime_cef::Webview) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_cef_webview(move |view| {
        let _ = send.send(work(view));
    })
    .map_err(|e| e.to_string())?;
    tokio::time::timeout(Duration::from_secs(15), receive)
        .await
        .map_err(|_| "CEF 操作超时".to_owned())?
        .map_err(|_| "CEF 操作已取消".to_owned())?
}
pub(super) async fn on_ui<T: Send + 'static>(
    app: &tauri::AppHandle,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = send.send(work());
    })
    .map_err(|e| e.to_string())?;
    tokio::time::timeout(Duration::from_secs(15), receive)
        .await
        .map_err(|_| "CEF 操作超时".to_owned())?
        .map_err(|_| "CEF 操作已取消".to_owned())?
}
pub(super) async fn begin_close(view: &tauri::Webview) -> Result<Vec<Browser>, String> {
    let browsers = with(view, |native| {
        Ok(std::iter::once(native.browser())
            .chain(native.popups().iter().map(|p| p.browser()))
            .collect::<Vec<_>>())
    })
    .await?;
    view.hide().map_err(|e| e.to_string())?;
    let root = browsers.first().ok_or("missing root browser")?.identifier();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        if on_ui(view.app_handle(), move || {
            tauri_runtime_cef::drain_browser_popups(root)
        })
        .await?
        {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("CEF 弹窗关闭超时；环境暂不可重用".into());
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    view.close().map_err(|e| e.to_string())?;
    Ok(browsers)
}
#[cfg(feature = "cef-integration-test")]
pub(super) static FAIL_CLOSE_ONCE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
pub(super) async fn wait_closed(
    app: &tauri::AppHandle,
    browsers: &[Browser],
) -> Result<(), String> {
    #[cfg(feature = "cef-integration-test")]
    if FAIL_CLOSE_ONCE.swap(false, std::sync::atomic::Ordering::SeqCst) {
        return Err("injected close barrier timeout".into());
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    let mut retry_at = tokio::time::Instant::now() + Duration::from_millis(200);
    loop {
        let captured = browsers.to_vec();
        if on_ui(app, move || {
            Ok(captured.iter().all(|browser| browser.is_valid() == 0))
        })
        .await?
        {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            let captured = browsers.to_vec();
            let remaining = on_ui(app, move || {
                Ok(captured
                    .iter()
                    .map(|b| {
                        (
                            b.identifier(),
                            b.is_popup(),
                            b.is_valid(),
                            b.host().is_some(),
                        )
                    })
                    .collect::<Vec<_>>())
            })
            .await?;
            return Err(format!("CEF 页面关闭超时；环境暂不可重用: {remaining:?}"));
        }
        if tokio::time::Instant::now() >= retry_at {
            // Retry only the captured browser handles. The runtime owns the
            // platform-specific native close handshake and acknowledgement.
            let captured = browsers.to_vec();
            on_ui(app, move || {
                for browser in captured {
                    if browser.is_valid() != 0
                        && let Some(host) = browser.host()
                    {
                        host.close_browser(1);
                    }
                }
                Ok(())
            })
            .await?;
            retry_at = tokio::time::Instant::now() + Duration::from_millis(200);
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
pub(super) async fn close(view: &tauri::Webview) -> Result<(), String> {
    wait_closed(view.app_handle(), &begin_close(view).await?).await
}
wrap_completion_callback! {
    struct Completion { sender: std::sync::Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>> }
    impl CompletionCallback {
        fn on_complete(&self) {
            if let Some(send) = self.sender.lock().unwrap_or_else(|e| e.into_inner()).take() { let _ = send.send(()); }
        }
    }
}
pub(super) fn completion() -> (CompletionCallback, tokio::sync::oneshot::Receiver<()>) {
    let (send, receive) = tokio::sync::oneshot::channel();
    (
        Completion::new(std::sync::Arc::new(std::sync::Mutex::new(Some(send)))),
        receive,
    )
}
pub(super) async fn completed(receive: tokio::sync::oneshot::Receiver<()>) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(15), receive)
        .await
        .map_err(|_| "CEF 资源回收超时；环境暂不可重用".to_owned())?
        .map_err(|_| "CEF 资源回收已取消".into())
}
