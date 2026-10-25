use crate::domain::web_storage::ClearBrowserData;
use webview2_com::{ClearBrowsingDataCompletedHandler, Microsoft::Web::WebView2::Win32::*};
use windows::core::Interface;

pub(super) async fn clear(
    view: &tauri::Webview,
    selection: ClearBrowserData,
) -> Result<(), String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_webview(move |native| {
        let send = std::sync::Arc::new(std::sync::Mutex::new(Some(send)));
        let callback = send.clone();
        let result = (|| unsafe {
            let profile = native
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_13>()?
                .Profile()?
                .cast::<ICoreWebView2Profile2>()?;
            let mut kinds = COREWEBVIEW2_BROWSING_DATA_KINDS(0);
            if selection.cache {
                kinds |= COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE;
            }
            if selection.cookies {
                kinds |= COREWEBVIEW2_BROWSING_DATA_KINDS_COOKIES;
            }
            if selection.storage {
                kinds |= COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_DOM_STORAGE;
            }
            profile.ClearBrowsingData(
                kinds,
                &ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
                    if let Some(send) = callback.lock().unwrap_or_else(|p| p.into_inner()).take() {
                        let _ = send.send(result.map_err(|_| "浏览数据清理失败".to_owned()));
                    }
                    Ok(())
                })),
            )
        })();
        if result.is_err()
            && let Some(send) = send.lock().unwrap_or_else(|p| p.into_inner()).take()
        {
            let _ = send.send(Err("浏览数据清理不可用".to_owned()));
        }
    })
    .map_err(|_| "无法访问浏览环境")?;
    receive.await.map_err(|_| "浏览数据清理已取消".to_owned())?
}
