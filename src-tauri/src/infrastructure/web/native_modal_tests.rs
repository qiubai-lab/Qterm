//! Extends the isolated native smoke fixture; no user profile or remote service.
use super::{WebBounds, windows_snapshot, windows_surface};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use std::time::{Duration, Instant};
use tauri::{Listener, Manager};
use windows::{
    Win32::{
        Foundation::HWND,
        Graphics::Gdi::{CreateRectRgn, DeleteObject, GetWindowRgn, NULLREGION},
        UI::{
            Input::KeyboardAndMouse::{GetFocus, IsWindowEnabled},
            WindowsAndMessaging::IsChild,
        },
    },
    core::BOOL,
};

fn pump_result<T: Send + 'static>(
    app: &mut tauri::App,
    work: impl std::future::Future<Output = T> + Send + 'static,
) -> T {
    let done = Arc::new(AtomicBool::new(false));
    let finished = done.clone();
    let (send, receive) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let result = work.await;
        let _ = send.send(result);
        finished.store(true, Ordering::SeqCst);
    });
    super::native_surface_tests::pump(app, || done.load(Ordering::SeqCst));
    receive.recv().unwrap()
}

fn sync(app: &mut tauri::App, view: &tauri::Webview, bounds: &WebBounds) {
    let (view, bounds) = (view.clone(), bounds.clone());
    pump_result(
        app,
        async move { windows_surface::sync(&view, &bounds).await },
    )
    .unwrap();
}

fn capture(app: &mut tauri::App, view: &tauri::Webview) -> String {
    let view = view.clone();
    pump_result(app, async move { windows_snapshot::capture(&view).await }).unwrap()
}

fn assert_native_state(app: &mut tauri::App, view: &tauri::Webview, covered: bool) {
    let view = view.clone();
    let actual = pump_result(app, async move {
        let (send, receive) = tokio::sync::oneshot::channel();
        view.with_webview(move |native| unsafe {
            let mut container = HWND::default();
            let controller = native.controller();
            controller.ParentWindow(&mut container).unwrap();
            let mut visible = BOOL::default();
            controller.IsVisible(&mut visible).unwrap();
            let region = CreateRectRgn(0, 0, 0, 0);
            let region_type = GetWindowRgn(container, region);
            let _ = DeleteObject(region.into());
            let _ = send.send((
                visible.as_bool(),
                IsWindowEnabled(container).as_bool(),
                region_type,
                IsChild(container, GetFocus()).as_bool() || container == GetFocus(),
            ));
        })
        .unwrap();
        receive.await.unwrap()
    });
    assert!(actual.0, "modal must retain the live WebView2 compositor");
    assert_eq!(actual.1, !covered, "native input must follow modal scope");
    if covered {
        assert!(
            !actual.3,
            "modal must transfer native keyboard focus to the host"
        );
    }
    assert_eq!(
        actual.2 == NULLREGION,
        covered,
        "covered HWND must have no visible or hit-test region"
    );
}

pub(super) fn verify(app: &mut tauri::App, view: &tauri::Webview, evidence: &str) {
    let main = app.get_webview("main").unwrap();
    let events = Arc::new(AtomicUsize::new(0));
    let received = events.clone();
    let label = serde_json::to_string(view.label()).unwrap();
    let listener = main.listen("web-guest-focused", move |event| {
        if event.payload() == label {
            received.fetch_add(1, Ordering::SeqCst);
        }
    });
    view.set_focus().unwrap();
    let settled = Instant::now() + Duration::from_millis(150);
    super::native_surface_tests::pump(app, || Instant::now() >= settled);
    // Both notifications are delivered without a new GotFocus event. Native
    // pointer initialization emits this fixed message, never arbitrary IPC.
    for _ in 0..2 {
        let before = events.load(Ordering::SeqCst);
        view.eval("window.chrome.webview.postMessage('qterm-native-pointer')")
            .unwrap();
        super::native_surface_tests::pump(app, || events.load(Ordering::SeqCst) > before);
    }
    let mut bounds = WebBounds {
        x: 20.0,
        y: 80.0,
        width: 470.0,
        height: 500.0,
        visible: true,
        input_blocked: true,
        covered: false,
        occlusions: vec![],
        panels: vec![],
        frame: None,
        scrollbar: None,
    };
    sync(app, view, &bounds);
    let before = events.load(Ordering::SeqCst);
    view.eval("window.chrome.webview.postMessage('qterm-native-pointer')")
        .unwrap();
    let settled = Instant::now() + Duration::from_millis(150);
    super::native_surface_tests::pump(app, || Instant::now() >= settled);
    assert_eq!(
        events.load(Ordering::SeqCst),
        before,
        "disabled guests cannot dismiss host overlays"
    );
    let before_url = view.url().unwrap();
    let png = capture(app, view);
    let bytes = STANDARD.decode(&png).unwrap();
    let image = image::load_from_memory(&bytes).unwrap().to_rgba8();
    assert!(image.width() > 100 && image.height() > 100);
    assert!(
        image
            .pixels()
            .any(|pixel| pixel[0] > 150 && pixel[1] > 150 && pixel[2] > 150),
        "preview must contain painted page pixels"
    );
    main.eval(format!(r#"document.body.style='margin:0;background:#121519;color:white;font:16px Segoe UI';document.body.innerHTML='<img id="preview" style="position:absolute;left:20px;top:80px;width:470px;height:500px" src="data:image/png;base64,{png}"><div style="position:fixed;inset:0;background:#0008;display:grid;place-items:center"><section style="padding:32px;background:#252c32;border:1px solid #75e6cf;border-radius:12px"><h2>公共模态覆盖</h2><p>网页快照保留 · 原生输入已阻断</p></section></div>'"#)).unwrap();
    bounds.covered = true;
    sync(app, view, &bounds);
    assert_native_state(app, view, true);
    // Region clipping must also permit recapture after resize/navigation under a modal.
    let covered_png = capture(app, view);
    assert!(!covered_png.is_empty());
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../docs/qb-spec/evidence")
        .join(evidence);
    std::fs::create_dir_all(&path).unwrap();
    std::fs::write(path.join("guest-preview.png"), &bytes).unwrap();
    let host = capture(app, &main);
    std::fs::write(path.join("modal-host.png"), STANDARD.decode(host).unwrap()).unwrap();
    bounds.covered = false;
    bounds.input_blocked = false;
    sync(app, view, &bounds);
    assert_native_state(app, view, false);
    assert_eq!(
        view.url().unwrap(),
        before_url,
        "modal dismissal must not navigate or recreate"
    );
    assert!(!capture(app, view).is_empty());
    main.unlisten(listener);
    eprintln!(
        "PASS: decoded native preview, blocked input, empty HWND region, live compositor, recapture while covered, same-page restoration"
    );
}
