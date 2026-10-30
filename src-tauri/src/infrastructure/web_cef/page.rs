//! Create blank, bind the connection context, then admit external navigation.
use super::{native, protocol::Protocol};
use std::{path::Path, sync::Mutex};
use tauri::{Manager, WebviewBuilder, WebviewUrl, webview::PageLoadEvent};
use tauri_runtime_cef::{FrameEventKind, WebviewBuilderCefExt, cef::RequestContext};

pub(super) struct Page {
    pub view: tauri::Webview,
    pub protocol: Protocol,
    pub context: RequestContext,
    pub reused: bool,
    pub navigation: super::navigation::Navigation,
}
pub(super) fn allowed(app: &tauri::AppHandle, url: &tauri::Url) -> bool {
    crate::domain::web::allowed_web_url(url.as_str())
        && app
            .get_webview("main")
            .and_then(|main| main.url().ok())
            .is_none_or(|main| main.origin() != url.origin())
}
pub(super) async fn create(
    app: &tauri::AppHandle,
    label: &str,
    directory: &Path,
    port: Option<u16>,
    expected: Option<RequestContext>,
    others: Vec<RequestContext>,
) -> Result<Page, String> {
    let origin = app
        .get_webview("main")
        .and_then(|v| v.url().ok())
        .map(|u| u.origin());
    let (send, receive) = tokio::sync::oneshot::channel();
    let blank = Mutex::new(Some(send));
    let navigation = super::navigation::Navigation::new(app, label);
    let frames = navigation.clone();
    let titles = navigation.clone();
    let loads = navigation.clone();
    #[cfg(feature = "cef-integration-test")]
    let event_label = label.to_string();
    let builder = WebviewBuilder::new(label, WebviewUrl::External("about:blank".parse().unwrap()))
        .data_directory(directory.to_path_buf())
        .position(tauri::LogicalPosition::new(-10000.0, -10000.0))
        .size(tauri::LogicalSize::new(800.0, 560.0))
        .initialization_script(super::scrollbars::script(None))
        .initialization_script(include_str!("../web/metrics_script.mjs"))
        .disable_drag_drop_handler()
        .on_navigation(move |url| {
            (url.as_str() == "about:blank" || crate::domain::web::allowed_web_url(url.as_str()))
                && origin.as_ref().is_none_or(|o| *o != url.origin())
        })
        .on_new_window(super::popups::handler(app, label))
        .on_download(|_, _| false)
        .on_frame_event(move |event| {
            if !event.is_main {
                return;
            }
            match event.kind {
                FrameEventKind::NavigationStarted { url } => frames.start(url.to_string()),
                FrameEventKind::DocumentCommitted { url } => frames.source(url.to_string(), true),
                FrameEventKind::AddressChanged { url } => frames.source(url.to_string(), false),
                FrameEventKind::NavigationFailed { url } => frames.failed(url.as_str()),
                _ => {}
            }
        })
        .on_document_title_changed(move |_, title| titles.title(title))
        .on_page_load(move |_, payload| {
            let finished = matches!(payload.event(), PageLoadEvent::Finished);
            if payload.url().as_str() == "about:blank" {
                if finished
                    && let Some(send) = blank.lock().unwrap_or_else(|e| e.into_inner()).take()
                {
                    let _ = send.send(());
                }
                return;
            }
            if finished {
                loads.complete(payload.url().to_string());
            }
            #[cfg(feature = "cef-integration-test")]
            if finished && crate::domain::web::allowed_web_url(payload.url().as_str()) {
                super::test_control::emit(
                    serde_json::json!({"event":"loaded","id":event_label,"url":payload.url()}),
                );
            }
        });
    let view = app
        .get_window("main")
        .ok_or("主窗口不存在")?
        .add_child(builder)
        .map_err(|e| e.to_string())?;
    view.hide().map_err(|e| e.to_string())?;
    let result = async {
        tokio::time::timeout(std::time::Duration::from_secs(15), receive)
            .await
            .map_err(|_| "空白页面初始化超时")?
            .map_err(|_| "页面初始化已取消")?;
        let reused = expected.is_some();
        let directory = directory.to_path_buf();
        let context = native::with(&view, move |view| {
            let context = super::contexts::bind(view, port, expected, others)?;
            tauri_runtime_cef::set_request_context_network_enabled(&directory, true)?;
            Ok(context)
        })
        .await?;
        let protocol = Protocol::install(&view)?;
        Ok(Page {
            view: view.clone(),
            protocol,
            context,
            reused,
            navigation,
        })
    }
    .await;
    if result.is_err() {
        let _ = native::close(&view).await;
    }
    result
}
