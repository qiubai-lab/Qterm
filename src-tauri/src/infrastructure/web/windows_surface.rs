//! Windowed WebView2 airspace and focus bridge. Guests never receive IPC permission.
use super::WebBounds;
use tauri::{Emitter, Manager};
use webview2_com::FocusChangedEventHandler;
use windows::{
    Win32::{
        Foundation::{HANDLE, HWND},
        Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, RGN_DIFF, SetWindowRgn},
        UI::WindowsAndMessaging::{GetPropW, IsChild, RemovePropW, SetPropW},
    },
    core::w,
};

// Called by creation off the event thread, just like Window::add_child.
pub(super) fn install_focus(view: &tauri::Webview) -> Result<(), String> {
    let app = view.app_handle().clone();
    let label = view.label().to_owned();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    view.with_webview(move |native| {
        let mut token = 0;
        let result = unsafe {
            native.controller().add_GotFocus(
                &FocusChangedEventHandler::create(Box::new(move |_, _| {
                    let _ = app.emit_to("main", "web-guest-focused", &label);
                    Ok(())
                })),
                &mut token,
            )
        };
        // Controller owns the callback and releases it when the guest is closed.
        let _ = send.send(result.map_err(|_| "无法监听网页焦点".to_owned()));
    })
    .map_err(|_| "无法监听网页焦点")?;
    receive
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "网页焦点初始化超时")?
}

pub(super) async fn sync(view: &tauri::Webview, bounds: &WebBounds) -> Result<(), String> {
    let scale = view
        .window()
        .scale_factor()
        .map_err(|_| "无法读取网页缩放")?;
    let root = view.window().hwnd().map_err(|_| "无法读取主窗口")?.0 as usize;
    let bounds = bounds.clone();
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let mut container = HWND::default();
            native
                .controller()
                .ParentWindow(&mut container)
                .map_err(|_| "无法读取网页容器")?;
            // Never clip the main UI: Wry gives each child a dedicated container.
            if container.0 as usize == root || !IsChild(HWND(root as *mut _), container).as_bool() {
                return Err("网页容器不是独立子窗口");
            }
            apply_region(container, &bounds, scale)?;
            super::windows_frame::sync(container, &bounds, scale)
        })();
        let _ = send.send(result.map_err(str::to_owned));
    })
    .map_err(|_| "无法调整网页层级")?;
    receive.await.map_err(|_| "网页已关闭".to_owned())?
}

unsafe fn apply_region(
    container: HWND,
    bounds: &WebBounds,
    scale: f64,
) -> Result<(), &'static str> {
    // Outward rounding prevents a one-pixel native seam at fractional DPI scales.
    unsafe {
        if bounds.occlusions.is_empty() {
            if !GetPropW(container, w!("Qterm.WebTooltipClip")).is_invalid() {
                if SetWindowRgn(container, None, true) == 0 {
                    return Err("无法恢复网页区域");
                }
                let _ = RemovePropW(container, w!("Qterm.WebTooltipClip"));
            }
            return Ok(());
        }
        let region = CreateRectRgn(
            0,
            0,
            (bounds.width * scale).ceil() as i32,
            (bounds.height * scale).ceil() as i32,
        );
        if region.is_invalid() {
            return Err("无法创建网页区域");
        }
        for rect in &bounds.occlusions {
            let cut = CreateRectRgn(
                (rect.x * scale).floor() as i32,
                (rect.y * scale).floor() as i32,
                ((rect.x + rect.width) * scale).ceil() as i32,
                ((rect.y + rect.height) * scale).ceil() as i32,
            );
            let combined = if cut.is_invalid() {
                0
            } else {
                CombineRgn(Some(region), Some(region), Some(cut), RGN_DIFF).0
            };
            if !cut.is_invalid() {
                let _ = DeleteObject(cut.into());
            }
            if combined == 0 {
                let _ = DeleteObject(region.into());
                return Err("无法裁剪网页区域");
            }
        }
        if SetWindowRgn(container, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
            return Err("无法应用网页区域");
        }
        // Windows owns region after a successful SetWindowRgn.
        if SetPropW(
            container,
            w!("Qterm.WebTooltipClip"),
            Some(HANDLE(std::ptr::dangling_mut::<u8>().cast())),
        )
        .is_err()
        {
            let _ = SetWindowRgn(container, None, true);
            return Err("无法记录网页提示框区域");
        }
        Ok(())
    }
}
