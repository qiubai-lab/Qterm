//! Real WebView2 regression assertions, invoked by native_webview_smoke.
use super::{WebBounds, WebClipRect, frame_raster::WebFrame, windows_frame, windows_surface};
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{Listener, Manager};
use windows::Win32::{
    Foundation::HWND,
    Graphics::Gdi::{CreateRectRgn, DeleteObject, GetWindowRgn, PtInRegion},
    UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, IsWindow, IsWindowVisible, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_TRANSPARENT,
    },
};

#[allow(deprecated)]
pub(super) fn pump(app: &mut tauri::App, until: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        app.run_iteration(|_, _| {});
        if until() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "native surface callback timed out"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

pub(super) fn verify(app: &mut tauri::App, a: &tauri::Webview, b: &tauri::Webview) {
    let events = Arc::new(AtomicUsize::new(0));
    let received = events.clone();
    let main = app.get_webview("main").unwrap();
    let listener = main.listen("web-guest-focused", move |event| {
        if event.payload() == "\"web-smoke-a\"" {
            received.fetch_add(1, Ordering::SeqCst);
        }
    });
    b.set_focus().unwrap();
    let settle = Instant::now() + Duration::from_millis(150);
    pump(app, || Instant::now() >= settle);
    let before = events.load(Ordering::SeqCst);
    a.set_focus().unwrap();
    pump(app, || events.load(Ordering::SeqCst) > before);
    main.unlisten(listener);

    let bounds = WebBounds {
        x: 20.0,
        y: 80.0,
        width: 470.0,
        height: 500.0,
        visible: true,
        frame: Some(WebFrame {
            x: 25.0,
            y: 60.0,
            width: 390.0,
            height: 350.0,
            radius: 8.0,
            stroke: 1.0,
            color: [255, 255, 0, 255],
        }),
        panels: vec![],
        occlusions: vec![WebClipRect {
            x: 20.0,
            y: 10.0,
            width: 180.0,
            height: 32.0,
        }],
    };
    main.eval(r##"document.body.style='background:#090a0c;color:#75e6cf;font:14px Segoe UI';document.body.innerHTML='<p style="padding:12px">Native transparent frame: bright content stays intact during movement. Click inputs to test focus.</p><div style="position:absolute;left:40px;top:90px;width:180px;height:32px;background:#153b35;color:#75e6cf;border:1px solid #75e6cf;box-sizing:border-box">Refresh webpage tooltip</div><div id="qa-frame" style="position:absolute;left:45px;top:140px;width:390px;height:350px;border:1px solid #ffff00;border-radius:8px;box-sizing:border-box;pointer-events:none"></div>'"##).unwrap();
    sync_and_check(app, a, bounds.clone(), true);
    let mut rounded = bounds.clone();
    rounded.frame = None;
    rounded.panels.push(super::surface_raster::WebPanel {
        edge: WebFrame {
            x: 20.0,
            y: 10.0,
            width: 180.0,
            height: 32.0,
            radius: 6.0,
            stroke: 1.0,
            color: [48, 52, 58, 255],
        },
        background: [25, 27, 31, 255],
    });
    rounded.occlusions = vec![
        WebClipRect {
            x: 26.0,
            y: 10.0,
            width: 168.0,
            height: 32.0,
        },
        WebClipRect {
            x: 20.0,
            y: 16.0,
            width: 180.0,
            height: 20.0,
        },
    ];
    sync_and_check(app, a, rounded, true);
    eprintln!(
        "PASS: rounded panel rim uses the transparent non-activating native layer without a selection frame"
    );
    let mut restored = bounds.clone();
    restored.occlusions.clear();
    restored.frame = None;
    sync_and_check(app, a, restored, false);
    // Leave an intermediate-frame sample for optional screenshot inspection.
    sync_and_check(app, a, bounds, true);
    eprintln!(
        "PASS: native focus, tooltip-only clipping, mouse-transparent layered frame, intact webpage under stroke, overlay removal"
    );
}

fn sync_and_check(app: &mut tauri::App, view: &tauri::Webview, bounds: WebBounds, clipped: bool) {
    let view = view.clone();
    let (send, receive) = std::sync::mpsc::channel();
    let done = Arc::new(AtomicUsize::new(0));
    let finished = done.clone();
    tauri::async_runtime::spawn(async move {
        windows_surface::sync(&view, &bounds).await.unwrap();
        let scale = view.window().scale_factor().unwrap();
        let frame_visible = bounds.frame.is_some() || !bounds.panels.is_empty();
        view.with_webview(move |native| unsafe {
            let mut container = HWND::default();
            native.controller().ParentWindow(&mut container).unwrap();
            let region = CreateRectRgn(0, 0, 0, 0);
            let kind = GetWindowRgn(container, region);
            let point = |x: f64, y: f64| {
                PtInRegion(region, (x * scale) as i32, (y * scale) as i32).as_bool()
            };
            let region_correct = if clipped {
                kind.0 != 0 && !point(30.0, 20.0) && point(100.0, 61.0) && point(200.0, 200.0)
            } else {
                kind.0 == 0
            };
            let overlay = windows_frame::handle(container);
            let required = (WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE).0 as isize;
            let correct = region_correct
                && IsWindow(Some(overlay)).as_bool()
                && IsWindowVisible(overlay).as_bool() == frame_visible
                && GetWindowLongPtrW(overlay, GWL_EXSTYLE) & required == required;
            let _ = DeleteObject(region.into());
            send.send(correct).unwrap();
            finished.store(1, Ordering::SeqCst);
        })
        .unwrap();
    });
    pump(app, || done.load(Ordering::SeqCst) == 1);
    assert!(
        receive.recv().unwrap(),
        "native window region does not match overlay geometry"
    );
}

pub(super) fn animate(app: &mut tauri::App, a: &tauri::Webview, b: &tauri::Webview, end: Instant) {
    let main = app.get_webview("main").unwrap();
    let start = Instant::now();
    // Exercise both directions even without the optional visual-inspection hold.
    let end = end.max(start + Duration::from_secs(3));
    while Instant::now() < end {
        let phase = start.elapsed().as_secs_f64() % 1.2;
        let progress = if phase < 0.3 {
            1.0 - (1.0 - phase / 0.3).powi(3)
        } else if phase < 0.6 {
            1.0
        } else if phase < 0.9 {
            (1.0 - (phase - 0.6) / 0.3).powi(3)
        } else {
            0.0
        };
        let left = 35.0 + 440.0 * progress;
        main.eval(format!("Object.assign(document.getElementById('qa-frame').style,{{left:'{left}px',top:'140px',width:'400px',height:'350px'}})")).unwrap();
        for (view, x) in [(a, 20.0), (b, 510.0)] {
            let bounds = WebBounds {
                x,
                y: 80.0,
                width: 470.0,
                height: 500.0,
                visible: true,
                panels: vec![],
                occlusions: vec![],
                frame: Some(WebFrame {
                    x: left - x,
                    y: 60.0,
                    width: 400.0,
                    height: 350.0,
                    radius: 8.0,
                    stroke: 1.0,
                    color: [255, 255, 0, 255],
                }),
            };
            // Native sync and region assertions run for every animation sample.
            sync_animation(app, view, bounds);
        }
    }
    eprintln!("PASS: repeated forward/reverse native frame animation preserves an unclipped guest");
}

fn sync_animation(app: &mut tauri::App, view: &tauri::Webview, bounds: WebBounds) {
    let view = view.clone();
    let done = Arc::new(AtomicUsize::new(0));
    let finished = done.clone();
    tauri::async_runtime::spawn(async move {
        windows_surface::sync(&view, &bounds).await.unwrap();
        view.with_webview(move |native| unsafe {
            let mut container = HWND::default();
            native.controller().ParentWindow(&mut container).unwrap();
            let region = CreateRectRgn(0, 0, 0, 0);
            assert_eq!(
                GetWindowRgn(container, region).0,
                0,
                "animation must never punch holes into the webpage"
            );
            let _ = DeleteObject(region.into());
            finished.store(1, Ordering::SeqCst);
        })
        .unwrap();
    });
    pump(app, || done.load(Ordering::SeqCst) == 1);
}

pub(super) fn close_guests(app: &mut tauri::App, a: &tauri::Webview, b: &tauri::Webview) {
    let mut overlays = Vec::new();
    for view in [a, b] {
        let captured = Arc::new(AtomicUsize::new(0));
        let received = captured.clone();
        view.with_webview(move |native| unsafe {
            let mut parent = HWND::default();
            native.controller().ParentWindow(&mut parent).unwrap();
            received.store(windows_frame::handle(parent).0 as usize, Ordering::SeqCst);
        })
        .unwrap();
        pump(app, || captured.load(Ordering::SeqCst) != 0);
        overlays.push(captured.load(Ordering::SeqCst));
    }
    a.close().unwrap();
    b.close().unwrap();
    pump(app, || {
        overlays
            .iter()
            .all(|handle| unsafe { !IsWindow(Some(HWND(*handle as *mut _))).as_bool() })
    });
    eprintln!("PASS: closing guests destroys both native frame overlays");
}

#[test]
fn bounds_reject_unbounded_or_non_finite_occlusion_input() {
    let mut bounds = WebBounds {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
        visible: true,
        frame: None,
        panels: vec![],
        occlusions: vec![],
    };
    assert!(bounds.valid());
    bounds.occlusions.push(WebClipRect {
        x: 10.0,
        y: 10.0,
        width: 20.0,
        height: 20.0,
    });
    assert!(bounds.valid());
    bounds.occlusions[0].width = 100.0;
    assert!(!bounds.valid());
    bounds.occlusions[0].width = f64::NAN;
    assert!(!bounds.valid());
    bounds.occlusions[0].width = 20.0;
    bounds.occlusions = vec![bounds.occlusions[0].clone(); 65];
    assert!(!bounds.valid());
}
