//! A fixed interaction notification, never a guest command or content payload.
use tauri::{Emitter, Manager};
use webview2_com::{WebMessageReceivedEventHandler, take_pwstr};
use windows::{
    Win32::{
        Foundation::HWND,
        UI::{
            Input::KeyboardAndMouse::{GetFocus, IsWindowEnabled},
            WindowsAndMessaging::{IsChild, IsWindowVisible},
        },
    },
    core::PWSTR,
};

pub(super) const SCRIPT: &str = r#"addEventListener('pointerdown',event=>{if(event.isTrusted)window.chrome?.webview?.postMessage('qterm-native-pointer')},true);"#;

pub(super) fn install(view: &tauri::Webview) -> Result<(), String> {
    let app = view.app_handle().clone();
    let label = view.label().to_owned();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let controller = native.controller();
            let mut parent = HWND::default();
            controller.ParentWindow(&mut parent)?;
            // Only an HWND value is retained; callbacks are owned by this controller.
            let parent = parent.0 as usize;
            let mut token = 0;
            controller.CoreWebView2()?.add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                    let container = HWND(parent as *mut _);
                    let focus = GetFocus();
                    if !IsWindowEnabled(container).as_bool()
                        || !IsWindowVisible(container).as_bool()
                        || (focus != container && !IsChild(container, focus).as_bool())
                    {
                        return Ok(());
                    }
                    if let Some(args) = args {
                        let mut value = PWSTR::null();
                        if args.TryGetWebMessageAsString(&mut value).is_ok()
                            && take_pwstr(value) == "qterm-native-pointer"
                        {
                            let _ = app.emit_to("main", "web-guest-focused", &label);
                        }
                    }
                    Ok(())
                })),
                &mut token,
            )
        })();
        let _ = send.send(result.map_err(|_| "无法监听网页交互".to_owned()));
    })
    .map_err(|_| "无法监听网页交互")?;
    receive
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "网页交互初始化超时")?
}
