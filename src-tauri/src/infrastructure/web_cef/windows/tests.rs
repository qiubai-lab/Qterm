use super::*;
use std::sync::{Arc, Mutex};
use windows::{
    Win32::{
        Graphics::Gdi::{CreateRectRgn, DeleteObject, GetWindowRgn, PtInRegion},
        UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, IsWindow, WS_CHILD, WS_OVERLAPPEDWINDOW,
        },
    },
    core::w,
};

struct Window(HWND);
impl Window {
    fn new(parent: Option<HWND>) -> Self {
        Self(
            unsafe {
                CreateWindowExW(
                    Default::default(),
                    w!("STATIC"),
                    w!("Qterm CEF test"),
                    if parent.is_some() {
                        WS_CHILD
                    } else {
                        WS_OVERLAPPEDWINDOW
                    },
                    0,
                    0,
                    500,
                    500,
                    parent,
                    None,
                    None,
                    None,
                )
            }
            .unwrap(),
        )
    }
}
impl Drop for Window {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyWindow(self.0);
        }
    }
}
fn bounds() -> WebBounds {
    serde_json::from_value(
        serde_json::json!({"x":10,"y":20,"width":200,"height":100,"visible":true}),
    )
    .unwrap()
}

#[test]
fn adopted_popup_stays_above_main_surface_across_focus_resize_and_tab_switches() {
    use windows::Win32::{
        Foundation::POINT,
        UI::WindowsAndMessaging::{
            CWP_SKIPINVISIBLE, ChildWindowFromPointEx, HWND_BOTTOM, HWND_TOP, SW_HIDE,
            SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos, ShowWindow,
        },
    };
    let parent = Window::new(None);
    let main = Window::new(Some(parent.0));
    let popup = Window::new(Some(parent.0));
    unsafe {
        let _ = ShowWindow(main.0, SW_SHOWNOACTIVATE);
        let _ = ShowWindow(popup.0, SW_SHOWNOACTIVATE);
        let no_move = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
        SetWindowPos(popup.0, Some(HWND_BOTTOM), 0, 0, 0, 0, no_move).unwrap();
        let front =
            || ChildWindowFromPointEx(parent.0, POINT { x: 100, y: 100 }, CWP_SKIPINVISIBLE);
        assert_eq!(
            front(),
            main.0,
            "reproduce a loaded child hidden behind the main UI"
        );
        stacking::raise_and_pin(popup.0).unwrap();
        assert_eq!(front(), popup.0);
        // Model Chromium's subsequent reposition; only its z-order change is vetoed.
        SetWindowPos(popup.0, Some(HWND_BOTTOM), 10, 20, 300, 250, SWP_NOACTIVATE).unwrap();
        assert_eq!(front(), popup.0);
        let mut rect = windows::Win32::Foundation::RECT::default();
        windows::Win32::UI::WindowsAndMessaging::GetWindowRect(popup.0, &mut rect).unwrap();
        assert_eq!((rect.right - rect.left, rect.bottom - rect.top), (300, 250));
        let _ = ShowWindow(popup.0, SW_HIDE);
        assert_eq!(front(), main.0);
        SetWindowPos(main.0, Some(HWND_TOP), 0, 0, 0, 0, no_move).unwrap();
        stacking::raise_and_pin(popup.0).unwrap();
        let _ = ShowWindow(popup.0, SW_SHOWNOACTIVATE);
        assert_eq!(front(), popup.0);
        drop(popup);
        assert_eq!(front(), main.0);
    }
}

#[test]
fn windows_occlusions_union_round_outwards_and_recover() {
    let parent = Window::new(None);
    let child = Window::new(Some(parent.0));
    let mut bounds = bounds();
    bounds.occlusions = serde_json::from_value(serde_json::json!([
        {"x":10.3,"y":10.3,"width":30.1,"height":30.1},
        {"x":20.0,"y":20.0,"width":30.0,"height":30.0}]))
    .unwrap();
    region::apply(child.0, &bounds, 1.25).unwrap();
    unsafe {
        let rgn = CreateRectRgn(0, 0, 0, 0);
        assert_ne!(GetWindowRgn(child.0, rgn).0, 0);
        assert!(PtInRegion(rgn, 2, 2).as_bool());
        for (x, y) in [(12, 12), (30, 30), (62, 62)] {
            assert!(!PtInRegion(rgn, x, y).as_bool());
        }
        bounds.covered = true;
        bounds.input_blocked = true;
        region::apply(child.0, &bounds, 1.25).unwrap();
        assert_ne!(GetWindowRgn(child.0, rgn).0, 0);
        assert!(!PtInRegion(rgn, 2, 2).as_bool());
        bounds.covered = false;
        bounds.occlusions.clear();
        region::apply(child.0, &bounds, 1.25).unwrap();
        assert_eq!(GetWindowRgn(child.0, rgn).0, 0);
        assert_eq!(
            GetWindowRgn(parent.0, rgn).0,
            0,
            "main window must never be clipped"
        );
        let _ = DeleteObject(rgn.into());
    }
}

#[test]
fn windows_input_and_frame_lifetimes_follow_guest_hwnd() {
    let parent = Window::new(None);
    let child = Window::new(Some(parent.0));
    let notices = Arc::new(Mutex::new(Vec::new()));
    let sink = notices.clone();
    input::register(child.0, Arc::new(move |n| sink.lock().unwrap().push(n))).unwrap();
    assert_eq!(input::registered(), 1);
    input::register(
        child.0,
        Arc::new(|_| panic!("duplicate registration replaced handler")),
    )
    .unwrap();
    assert_eq!(input::registered(), 1);
    let mut bounds = bounds();
    bounds.frame = serde_json::from_value(serde_json::json!({"x":0,"y":0,"width":200,"height":100,"radius":6,"stroke":1,"color":[100,200,180,255]})).unwrap();
    super::super::windows_frame::sync(child.0, &bounds, 1.25).unwrap();
    let overlay = super::super::windows_frame::handle(child.0);
    assert!(unsafe { IsWindow(Some(overlay)) }.as_bool());
    drop(child);
    assert_eq!(input::registered(), 0);
    assert!(!unsafe { IsWindow(Some(overlay)) }.as_bool());
    assert!(unsafe { IsWindow(Some(parent.0)) }.as_bool());
}

#[test]
fn windows_close_shortcut_requires_focused_enabled_guest_and_ignores_repeat() {
    use windows::Win32::{
        Foundation::WPARAM,
        UI::{
            Input::KeyboardAndMouse::{
                EnableWindow, GetKeyboardState, SetFocus, SetKeyboardState, VK_CONTROL, VK_SHIFT,
            },
            WindowsAndMessaging::{
                MSG, SW_HIDE, SW_SHOWNOACTIVATE, ShowWindow, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
                WM_NULL,
            },
        },
    };
    let parent = Window::new(None);
    let guest = Window::new(Some(parent.0));
    let content = Window::new(Some(guest.0));
    let notices = Arc::new(Mutex::new(Vec::new()));
    let sink = notices.clone();
    input::register(guest.0, Arc::new(move |n| sink.lock().unwrap().push(n))).unwrap();
    unsafe {
        let mut original = [0u8; 256];
        GetKeyboardState(&mut original).unwrap();
        for hwnd in [parent.0, guest.0, content.0] {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        SetFocus(Some(content.0)).unwrap();
        let mut keys = [0u8; 256];
        keys[VK_CONTROL.0 as usize] = 128;
        SetKeyboardState(&keys).unwrap();
        let mut press = MSG {
            hwnd: content.0,
            message: WM_KEYDOWN,
            wParam: WPARAM(b'W' as usize),
            ..Default::default()
        };
        input::route(&mut press);
        assert_eq!(press.message, WM_NULL);
        assert_eq!(*notices.lock().unwrap(), vec![input::Notice::CloseTab]);
        press.message = WM_KEYDOWN;
        press.lParam.0 = 1 << 30;
        input::route(&mut press);
        assert_eq!(press.message, WM_NULL);
        press.message = WM_KEYUP;
        input::route(&mut press);
        assert_eq!(press.message, WM_NULL);
        assert_eq!(notices.lock().unwrap().len(), 1);
        press.message = WM_KEYDOWN;
        press.lParam.0 = 0;
        keys[VK_SHIFT.0 as usize] = 128;
        SetKeyboardState(&keys).unwrap();
        input::route(&mut press);
        assert_eq!(press.message, WM_KEYDOWN, "Ctrl+Shift+W is not tab close");
        keys[VK_SHIFT.0 as usize] = 0;
        SetKeyboardState(&keys).unwrap();
        SetFocus(Some(parent.0)).unwrap();
        input::route(&mut press);
        assert_eq!(press.message, WM_KEYDOWN, "stale guest message is ignored");
        press.message = WM_LBUTTONDOWN;
        input::route(&mut press);
        assert_eq!(
            notices.lock().unwrap().last(),
            Some(&input::Notice::Focused)
        );
        let count = notices.lock().unwrap().len();
        let _ = EnableWindow(guest.0, false);
        input::route(&mut press);
        assert_eq!(notices.lock().unwrap().len(), count);
        let _ = EnableWindow(guest.0, true);
        let _ = ShowWindow(guest.0, SW_HIDE);
        input::route(&mut press);
        assert_eq!(notices.lock().unwrap().len(), count);
        SetKeyboardState(&original).unwrap();
    }
}
