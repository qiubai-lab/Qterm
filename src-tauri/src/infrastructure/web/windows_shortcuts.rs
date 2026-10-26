//! Capture trusted Ctrl+W before WebView2 handles it inside a guest.
use tauri::{Emitter, EventTarget, Manager};
use webview2_com::{AcceleratorKeyPressedEventHandler, Microsoft::Web::WebView2::Win32::*};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};

pub(super) fn install(view: &tauri::Webview) -> Result<(), String> {
    let app = view.app_handle().clone();
    let label = view.label().to_owned();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    view.with_webview(move |native| {
        let mut token = 0;
        let result = unsafe {
            native.controller().add_AcceleratorKeyPressed(
                &AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
                    let mut key = 0;
                    args.KeyEventKind(&mut kind)?;
                    args.VirtualKey(&mut key)?;
                    let down = |key: u16| GetKeyState(i32::from(key)) < 0;
                    if key != u32::from(b'W')
                        || !down(VK_CONTROL.0)
                        || [VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN]
                            .iter()
                            .any(|key| down(key.0))
                    {
                        return Ok(());
                    }
                    args.SetHandled(true)?;
                    if kind == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
                        let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                        args.PhysicalKeyStatus(&mut status)?;
                        if !status.WasKeyDown.as_bool() {
                            let _ = app.emit_to(
                                EventTarget::window("main"),
                                "qterm-close-web-tab",
                                &label,
                            );
                        }
                    }
                    Ok(())
                })),
                &mut token,
            )
        };
        // The controller owns and releases this handler with the guest.
        let _ = send.send(result.map_err(|_| "无法监听网页关闭快捷键".to_owned()));
    })
    .map_err(|_| "无法监听网页关闭快捷键")?;
    receive
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "网页关闭快捷键初始化超时".to_owned())?
}
