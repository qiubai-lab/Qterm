//! Pointer input through the real guest document and installed production plugins.
use super::native_local_tests::{eval, wait_for_page};
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;

pub(super) fn click(app: &mut tauri::App, view: &tauri::Webview, selector: &str) {
    let selector = serde_json::to_string(selector).unwrap();
    let point = eval(
        app,
        view,
        &format!(
            r#"(() => {{
              window.popupClickProof = {{ trusted: false, prevented: null, errors: [] }};
              window.addEventListener('click', event => {{
                popupClickProof.trusted = event.isTrusted;
                popupClickProof.prevented = event.defaultPrevented;
              }}, {{ once: true }});
              window.addEventListener('unhandledrejection', event => {{
                popupClickProof.errors.push(String(event.reason));
              }}, {{ once: true }});
              const element = document.querySelector({selector});
              element.scrollIntoView({{ block: 'center' }});
              const rect = element.getBoundingClientRect();
              return [rect.x + rect.width / 2, rect.y + rect.height / 2];
            }})()"#
        ),
    );
    let point: [f64; 2] = serde_json::from_str(&point).unwrap();
    view.with_webview(move |native| unsafe {
        let core = native.controller().CoreWebView2().unwrap();
        let method = webview2_com::CoTaskMemPWSTR::from("Input.dispatchMouseEvent");
        for event in ["mousePressed", "mouseReleased"] {
            let parameters = serde_json::json!({
                "type": event, "x": point[0], "y": point[1],
                "button": "left", "clickCount": 1
            })
            .to_string();
            let parameters = webview2_com::CoTaskMemPWSTR::from(parameters.as_str());
            // Release can await the popup deferral; pump/adopt before waiting for JS.
            core.CallDevToolsProtocolMethod(
                *method.as_ref().as_pcwstr(),
                *parameters.as_ref().as_pcwstr(),
                &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|error, _| error)),
            )
            .unwrap();
        }
    })
    .unwrap();
}

pub(super) fn assert_click(app: &mut tauri::App, view: &tauri::Webview) {
    let proof: serde_json::Value =
        serde_json::from_str(&eval(app, view, "window.popupClickProof")).unwrap();
    assert_eq!(
        proof,
        serde_json::json!({"trusted": true, "prevented": false, "errors": []}),
        "real anchor click must reach native handling without opener rejection"
    );
}

pub(super) fn verify_guest_opener_denied(app: &mut tauri::App, view: &tauri::Webview) {
    use tauri::Manager;
    assert!(
        app.try_state::<tauri_plugin_opener::Opener<tauri::Wry>>()
            .is_some()
    );
    eval(
        app,
        view,
        "window.openerProof=null; window.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', {url:'https://example.invalid/guest-opener-denied'}).then(()=>window.openerProof='ALLOWED').catch(error=>window.openerProof=String(error)); true",
    );
    wait_for_page(app, view, "window.openerProof !== null");
    let proof = eval(app, view, "window.openerProof");
    assert!(proof.contains("opener.open_url not allowed"), "{proof}");
}
