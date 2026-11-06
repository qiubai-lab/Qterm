//! Keyboard delivery after Windows foreground activation, using the isolated smoke window.
use super::{native_local_tests::wait_for_page, native_surface_tests::pump};
use tauri::Manager;
use windows::Win32::UI::{
    Input::KeyboardAndMouse::{
        GetFocus, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        SendInput, SetFocus,
    },
    WindowsAndMessaging::{GetForegroundWindow, IsChild, SetForegroundWindow},
};

pub(super) fn verify(app: &mut tauri::App) {
    crate::infrastructure::windows_focus::install(app).unwrap();
    let main = app.get_webview("main").unwrap();
    let shell = main.window().hwnd().unwrap();
    main.window().set_focus().unwrap();
    main.set_focus().unwrap();
    main.eval("window.probe = document.body.appendChild(document.createElement('textarea')); probe.focus()").unwrap();
    wait_for_page(
        app,
        &main,
        "document.hasFocus() && document.activeElement === probe",
    );
    let input_hwnd = unsafe { GetFocus() };
    assert!(unsafe { IsChild(shell, input_hwnd).as_bool() });

    let other = tauri::window::WindowBuilder::new(app, "focus-switch")
        .title("Qterm focus test")
        .build()
        .unwrap();
    let other_hwnd = other.hwnd().unwrap();
    unsafe {
        let _ = SetForegroundWindow(other_hwnd);
        pump(app, || GetForegroundWindow() == other_hwnd);
        let _ = SetForegroundWindow(shell);
        pump(app, || GetForegroundWindow() == shell);
        // Recreate the failing activation path even on systems that remember the child.
        let _ = SetFocus(Some(shell));
        assert_eq!(GetFocus(), input_hwnd);

        let key = |flags| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wScan: u16::from(b'x'),
                    dwFlags: flags,
                    ..Default::default()
                },
            },
        };
        let keys = [
            key(KEYEVENTF_UNICODE),
            key(KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
        ];
        assert_eq!(GetForegroundWindow(), shell);
        assert_eq!(SendInput(&keys, size_of::<INPUT>() as i32), 2);
    }
    wait_for_page(app, &main, "probe.value === 'x'");
    other.destroy().unwrap();
    eprintln!("PASS: first native character reaches the main WebView2 after window reactivation");
}
