//! Trusted pointer input tests the enlarged hit target, not just CSS declarations.
use super::{
    native_local_tests::{eval, wait_for_page},
    native_scrollbar_tests::{capture, native_input},
};

fn mouse(app: &mut tauri::App, view: &tauri::Webview, kind: &str, x: f64, y: f64, down: bool) {
    native_input(
        app,
        view,
        "Input.dispatchMouseEvent",
        serde_json::json!({
            "type": kind, "x": x, "y": y, "button": if kind == "mouseMoved" && !down { "none" } else { "left" },
            "buttons": if down { 1 } else { 0 }, "clickCount": if kind == "mouseMoved" { 0 } else { 1 }
        }),
    );
}

fn point(app: &mut tauri::App, view: &tauri::Webview, label: &str) -> [f64; 2] {
    let label = serde_json::to_string(label).unwrap();
    serde_json::from_str(&eval(app, view, &format!(r#"(() => {{
      const hit=document.querySelector('qterm-scrollbars').shadowRoot.querySelector('[aria-label='+JSON.stringify({label})+']');
      window.testScrollHit=hit; const r=hit.getBoundingClientRect();
      return hit.getAttribute('aria-orientation')==='vertical' ? [r.right-7,r.top+r.height/2] : [r.left+r.width/2,r.bottom-7];
    }})()"#))).unwrap()
}

pub(super) fn verify(app: &mut tauri::App, view: &tauri::Webview) {
    view.window().set_focus().unwrap();
    view.set_focus().unwrap();
    eval(
        app,
        view,
        "window.beforeOverlayWidth=document.documentElement.clientWidth; window.beforeOverlayHeight=document.documentElement.clientHeight; window.dragTrusted=false; document.addEventListener('pointerdown', e=>{window.dragTrusted=e.isTrusted;window.dragPointer=e.pointerId;},true); true",
    );
    for (label, axis) in [
        ("网页纵向滚动条", "y"),
        ("网页横向滚动条", "x"),
        ("区域纵向滚动条", "y"),
        ("区域横向滚动条", "x"),
    ] {
        eval(
            app,
            view,
            "scrollTo(0,0);document.getElementById('nested').scrollTo(0,0);true",
        );
        wait_for_page(
            app,
            view,
            "scrollY===0 && scrollX===0 && document.querySelector('qterm-scrollbars').shadowRoot.querySelector('[aria-label=\"网页纵向滚动条\"]').getAttribute('aria-valuenow')==='0'",
        );
        // Pump geometry for nested scroll reset too, before obtaining the hit rectangle.
        wait_for_page(
            app,
            view,
            "Array.from(document.querySelector('qterm-scrollbars').shadowRoot.querySelectorAll('.hit')).every(e=>e.getAttribute('aria-valuenow')==='0')",
        );
        let [x, y] = point(app, view, label);
        mouse(app, view, "mouseMoved", x, y, false);
        let thickness = if axis == "y" { "width" } else { "height" };
        wait_for_page(
            app,
            view,
            &format!(
                "Math.abs(testScrollHit.querySelector('.thumb').getBoundingClientRect().{thickness}-9)<0.1"
            ),
        );
        if label == "网页纵向滚动条" {
            capture(app, view, "scrollbar-hover.png");
            // Sample inside the guest: host IPC/polling latency must not consume the grace period.
            eval(
                app,
                view,
                "window.hoverSample=null; document.addEventListener('pointermove',()=>{const start=performance.now();setTimeout(()=>window.hoverSample={elapsed:performance.now()-start,active:testScrollHit.parentElement.hasAttribute('data-active'),width:testScrollHit.querySelector('.thumb').getBoundingClientRect().width},180)},{once:true,capture:true});true",
            );
            mouse(app, view, "mouseMoved", x - 40.0, y, false);
            wait_for_page(app, view, "window.hoverSample!==null");
            assert_eq!(
                eval(
                    app,
                    view,
                    "hoverSample.active && Math.abs(hoverSample.width-9)<0.1"
                ),
                "true",
                "{}",
                eval(app, view, "hoverSample")
            );
            mouse(app, view, "mouseMoved", x, y, false);
            eval(
                app,
                view,
                "window.hoverDwell=false;setTimeout(()=>window.hoverDwell=true,700);true",
            );
            wait_for_page(app, view, "window.hoverDwell");
            assert_eq!(
                eval(
                    app,
                    view,
                    "testScrollHit.parentElement.hasAttribute('data-active')"
                ),
                "true"
            );
            mouse(app, view, "mouseMoved", x - 40.0, y, false);
            wait_for_page(
                app,
                view,
                "Math.abs(testScrollHit.querySelector('.thumb').getBoundingClientRect().width-3)<0.1",
            );
            mouse(app, view, "mouseMoved", x, y, false);
            wait_for_page(
                app,
                view,
                "Math.abs(testScrollHit.querySelector('.thumb').getBoundingClientRect().width-9)<0.1",
            );
            eprintln!("PASS: hover exit grace period, re-entry cancellation and eventual collapse");
        }
        mouse(app, view, "mousePressed", x, y, true);
        eprintln!(
            "overlay {label} down: {}",
            eval(
                app,
                view,
                "({trusted:dragTrusted,pointer:dragPointer,captured:testScrollHit.hasPointerCapture(dragPointer),dragging:testScrollHit.parentElement.hasAttribute('data-dragging')})"
            )
        );
        // Leave the 12px rail orthogonally while dragging: capture must retain ownership.
        let (next_x, next_y) = if axis == "y" {
            (x - 80.0, y + 65.0)
        } else {
            (x + 65.0, y - 80.0)
        };
        mouse(app, view, "mouseMoved", next_x, next_y, true);
        wait_for_page(
            app,
            view,
            "Number(testScrollHit.getAttribute('aria-valuenow'))>0",
        );
        assert_eq!(
            eval(
                app,
                view,
                "window.dragTrusted && testScrollHit.hasPointerCapture(window.dragPointer)"
            ),
            "true",
            "{label}: {}",
            eval(
                app,
                view,
                "({trusted:dragTrusted,pointer:dragPointer,captured:testScrollHit.hasPointerCapture(dragPointer),dragging:testScrollHit.parentElement.hasAttribute('data-dragging'),connected:testScrollHit.isConnected})"
            )
        );
        assert_eq!(
            eval(
                app,
                view,
                "document.documentElement.clientWidth===beforeOverlayWidth && document.documentElement.clientHeight===beforeOverlayHeight"
            ),
            "true"
        );
        if label.starts_with("区域") {
            assert_eq!(eval(app, view, "scrollX===0 && scrollY===0"), "true");
        }
        mouse(app, view, "mouseReleased", next_x, next_y, false);
        wait_for_page(
            app,
            view,
            &format!(
                "Math.abs(testScrollHit.querySelector('.thumb').getBoundingClientRect().{thickness}-3)<0.1"
            ),
        );
    }
    // Cancellation and blur cannot leave the bar expanded or pointer-captured.
    for cancel in [
        "document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.dragPointer,bubbles:true}))",
        "window.dispatchEvent(new Event('blur'))",
    ] {
        let [x, y] = point(app, view, "网页纵向滚动条");
        mouse(app, view, "mouseMoved", x, y, false);
        mouse(app, view, "mousePressed", x, y, true);
        eval(app, view, &format!("{cancel};true"));
        wait_for_page(
            app,
            view,
            "!testScrollHit.hasPointerCapture(window.dragPointer) && !testScrollHit.parentElement.hasAttribute('data-dragging') && Math.abs(testScrollHit.querySelector('.thumb').getBoundingClientRect().width-3)<0.1",
        );
        mouse(app, view, "mouseReleased", x, y, false);
    }
    eval(app, view, "scrollTo(0,180);true");
    capture(app, view, "scrollbar-after-drag.png");
    eprintln!(
        "PASS: trusted root/nested horizontal/vertical drags from 12px hit areas, 3-to-9px proximity, capture, release/cancel/blur and stable viewport geometry"
    );
}
