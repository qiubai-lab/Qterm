//! Native source changes include History API and fragment navigation without guest privileges.
use super::navigation_state::{NavigationState, PageState};
use std::{cell::RefCell, rc::Rc};
use tauri::{Emitter, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED;
use webview2_com::{
    DocumentTitleChangedEventHandler, NavigationCompletedEventHandler,
    NavigationStartingEventHandler, SourceChangedEventHandler, take_pwstr,
};
use windows::core::{BOOL, PWSTR};

fn emit(app: &tauri::AppHandle, state: PageState) {
    if crate::domain::web::allowed_web_url(&state.url) {
        let _ = app.emit_to("main", "web-page-state", state);
    }
}

/// Installed on the initially blank guest before its first external navigation.
pub(super) fn install(view: &tauri::Webview) -> Result<(), String> {
    let app = view.app_handle().clone();
    let label = view.label().to_owned();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let webview = native.controller().CoreWebView2()?;
            let state = Rc::new(RefCell::new(NavigationState::new(label)));
            let mut token = 0;
            let (starting, app_start) = (state.clone(), app.clone());
            webview.add_NavigationStarting(
                &NavigationStartingEventHandler::create(Box::new(move |_, args| {
                    if let Some(args) = args {
                        let mut canceled = BOOL::default();
                        args.Cancel(&mut canceled)?;
                        if canceled.as_bool() {
                            return Ok(());
                        }
                        let mut id = 0;
                        args.NavigationId(&mut id)?;
                        let mut uri = PWSTR::null();
                        args.Uri(&mut uri)?;
                        emit(&app_start, starting.borrow_mut().start(id, take_pwstr(uri)));
                    }
                    Ok(())
                })),
                &mut token,
            )?;
            let (changed, app_source) = (state.clone(), app.clone());
            webview.add_SourceChanged(
                &SourceChangedEventHandler::create(Box::new(move |sender, args| {
                    if let (Some(sender), Some(args)) = (sender, args) {
                        let mut new_document = BOOL::default();
                        args.IsNewDocument(&mut new_document)?;
                        let mut uri = PWSTR::null();
                        sender.Source(&mut uri)?;
                        emit(
                            &app_source,
                            changed
                                .borrow_mut()
                                .source(take_pwstr(uri), new_document.as_bool()),
                        );
                    }
                    Ok(())
                })),
                &mut token,
            )?;
            let (titles, app_title) = (state.clone(), app.clone());
            webview.add_DocumentTitleChanged(
                &DocumentTitleChangedEventHandler::create(Box::new(move |sender, _| {
                    if let Some(sender) = sender {
                        let (mut uri, mut title) = (PWSTR::null(), PWSTR::null());
                        sender.Source(&mut uri)?;
                        let url = take_pwstr(uri);
                        sender.DocumentTitle(&mut title)?;
                        if let Some(snapshot) = titles.borrow_mut().title(url, take_pwstr(title)) {
                            emit(&app_title, snapshot);
                        }
                    }
                    Ok(())
                })),
                &mut token,
            )?;
            webview.add_NavigationCompleted(
                &NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
                    if let (Some(sender), Some(args)) = (sender, args) {
                        let (mut id, mut success) = (0, BOOL::default());
                        args.NavigationId(&mut id)?;
                        args.IsSuccess(&mut success)?;
                        let mut uri = PWSTR::null();
                        sender.Source(&mut uri)?;
                        let url = take_pwstr(uri);
                        let mut state = state.borrow_mut();
                        let mut error = Default::default();
                        args.WebErrorStatus(&mut error)?;
                        let snapshot = if !success.as_bool()
                            && error == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED
                        {
                            state.cancel(id, url.clone())
                        } else {
                            state.complete(id, url.clone(), success.as_bool())
                        };
                        if let Some(mut snapshot) = snapshot {
                            let mut title = PWSTR::null();
                            if success.as_bool()
                                && sender.DocumentTitle(&mut title).is_ok()
                                && let Some(metadata) = state.title(url, take_pwstr(title))
                            {
                                snapshot.title = metadata.title;
                            }
                            emit(&app, snapshot);
                        }
                    }
                    Ok(())
                })),
                &mut token,
            )?;
            // WebView2 owns the callbacks and drops them together with the guest.
            Ok::<(), windows::core::Error>(())
        })();
        let _ = send.send(result.map_err(|_| "无法监听网页导航".to_owned()));
    })
    .map_err(|_| "无法监听网页导航")?;
    receive
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "网页导航初始化超时")?
}

pub(super) async fn stop(view: &tauri::Webview) -> Result<(), String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_webview(move |native| {
        let result = unsafe {
            native
                .controller()
                .CoreWebView2()
                .and_then(|webview| webview.Stop())
        };
        let _ = send.send(result.map_err(|_| "无法停止网页加载".to_owned()));
    })
    .map_err(|_| "无法停止网页加载")?;
    receive.await.map_err(|_| "网页已关闭".to_owned())?
}
