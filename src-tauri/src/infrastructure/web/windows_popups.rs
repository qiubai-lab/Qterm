//! Webpage new-window events are host capabilities, never guest IPC commands.
use super::windows_popup_pending::{self as pending, Pending};
use tauri::{Emitter, Manager};
use webview2_com::{
    NavigationStartingEventHandler, NewWindowRequestedEventHandler,
    WindowCloseRequestedEventHandler, take_pwstr,
};
use windows::core::{BOOL, PWSTR};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PopupEvent {
    pub label: String,
    pub request_id: Option<String>,
    pub url: String,
    pub message: Option<String>,
}
pub(super) fn report(app: &tauri::AppHandle, label: &str, message: &str) {
    let _ = app.emit_to(
        "main",
        "web-popup",
        PopupEvent {
            label: label.into(),
            request_id: None,
            url: String::new(),
            message: Some(message.into()),
        },
    );
}
pub(super) async fn on_ui<T: Send + 'static>(
    app: &tauri::AppHandle,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = send.send(work());
    })
    .map_err(|_| "无法处理新窗口请求")?;
    receive.await.map_err(|_| "网页已关闭".to_owned())?
}
pub(super) async fn source(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let id = id.to_owned();
    on_ui(app, move || pending::source(&id)).await
}
pub(super) async fn reject(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let id = id.to_owned();
    on_ui(app, move || {
        drop(pending::take(&id));
        Ok(())
    })
    .await
}
pub(super) async fn cancel_source(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let label = label.to_owned();
    on_ui(app, move || {
        pending::cancel_source(&label);
        Ok(())
    })
    .await
}

pub(super) fn install(view: &tauri::Webview) -> Result<(), String> {
    let app = view.app_handle().clone();
    let label = view.label().to_owned();
    let origin = app
        .get_webview("main")
        .and_then(|main| main.url().ok())
        .map(|url| url.origin());
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let webview = native.controller().CoreWebView2()?;
            let environment = native.environment();
            let mut token = 0;
            let (nav_label, close_label, close_app) = (label.clone(), label.clone(), app.clone());
            webview.add_NavigationStarting(
                &NavigationStartingEventHandler::create(Box::new(move |_, _| {
                    pending::cancel_source(&nav_label);
                    Ok(())
                })),
                &mut token,
            )?;
            webview.add_WindowCloseRequested(
                &WindowCloseRequestedEventHandler::create(Box::new(move |_, _| {
                    let _ = close_app.emit_to("main", "web-window-close", &close_label);
                    Ok(())
                })),
                &mut token,
            )?;
            webview.add_NewWindowRequested(
                &NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    args.SetHandled(true)?;
                    let mut initiated = BOOL::default();
                    args.IsUserInitiated(&mut initiated)?;
                    let mut uri = PWSTR::null();
                    args.Uri(&mut uri)?;
                    let url = take_pwstr(uri);
                    let forbidden_origin = tauri::Url::parse(&url).ok().is_some_and(|url| {
                        origin
                            .as_ref()
                            .is_some_and(|origin| *origin == url.origin())
                    });
                    if let Err(reason) =
                        crate::domain::web::allow_popup(&url, initiated.as_bool(), forbidden_origin)
                    {
                        report(&app, &label, reason);
                        return Ok(());
                    }
                    let request = Pending {
                        source: label.clone(),
                        environment: environment.clone(),
                        deferral: args.GetDeferral()?,
                        args,
                    };
                    match pending::insert(request) {
                        Ok(id) => {
                            if app
                                .emit_to(
                                    "main",
                                    "web-popup",
                                    PopupEvent {
                                        label: label.clone(),
                                        request_id: Some(id.clone()),
                                        url,
                                        message: None,
                                    },
                                )
                                .is_err()
                            {
                                drop(pending::take(&id));
                                return Ok(());
                            }
                            let (app, label) = (app.clone(), label.clone());
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                                let dispatcher = app.clone();
                                let _ = on_ui(&dispatcher, move || {
                                    if let Some(request) = pending::take(&id) {
                                        drop(request);
                                        report(&app, &label, "新窗口请求已超时，请重新点击链接");
                                    }
                                    Ok(())
                                })
                                .await;
                            });
                        }
                        Err(reason) => report(&app, &label, &reason),
                    }
                    Ok(())
                })),
                &mut token,
            )?;
            Ok::<_, windows::core::Error>(())
        })();
        let _ = send.send(result.map_err(|_| "无法监听网页新窗口".to_owned()));
    })
    .map_err(|_| "无法监听网页新窗口")?;
    receive
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "新窗口监听初始化超时".to_owned())?
}
