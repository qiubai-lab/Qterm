//! Forward keyboard focus stranded on the desktop shell to its main WebView2.
use tauri::Manager;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC, ICoreWebView2Controller,
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Input::KeyboardAndMouse::GetFocus,
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{GetForegroundWindow, WM_NCDESTROY, WM_SETFOCUS},
    },
};

pub(crate) fn install(app: &tauri::App) -> tauri::Result<()> {
    let Some(main) = app.get_webview("main") else {
        return Ok(());
    };
    let root = main.window().hwnd()?.0 as usize;
    main.with_webview(move |webview| unsafe {
        let root = HWND(root as _);
        // The subclass owns this controller reference until the HWND is destroyed.
        let controller = Box::into_raw(Box::new(webview.controller()));
        if !SetWindowSubclass(root, Some(forward_focus), 1, controller as usize).as_bool() {
            drop(Box::from_raw(controller));
            eprintln!("Could not install the main WebView2 keyboard focus handler");
        }
    })
}

unsafe extern "system" fn forward_focus(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    data: usize,
) -> LRESULT {
    unsafe {
        if msg == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(forward_focus), id);
            drop(Box::from_raw(data as *mut ICoreWebView2Controller));
        }
        if msg == WM_SETFOCUS {
            // Default handling may re-enter the window procedure or focus a guest.
            let controller = (&*(data as *const ICoreWebView2Controller)).clone();
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            if GetForegroundWindow() == hwnd && GetFocus() == hwnd {
                let _ = controller.MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
            }
            return result;
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }
}
