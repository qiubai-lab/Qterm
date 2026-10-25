//! Real deferred handoff. DevTools userGesture exercises WebView2's native initiation flag.
use super::{
    WebHost,
    native_local_tests::{eval, run, wait_for_page},
    native_surface_tests::pump,
};
use crate::infrastructure::ssh::client::SshSessionManager;
use std::sync::{Arc, Mutex};
use tauri::{Listener, Manager};
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;

pub(super) fn gesture(_app: &mut tauri::App, view: &tauri::Webview, expression: &str) {
    let parameters = serde_json::json!({"expression": expression, "userGesture": true}).to_string();
    view.with_webview(move |native| unsafe {
        let parameters = webview2_com::CoTaskMemPWSTR::from(parameters.as_str());
        let method = webview2_com::CoTaskMemPWSTR::from("Runtime.evaluate");
        native
            .controller()
            .CoreWebView2()
            .unwrap()
            .CallDevToolsProtocolMethod(
                *method.as_ref().as_pcwstr(),
                *parameters.as_ref().as_pcwstr(),
                &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |error, _| {
                    error
                })),
            )
            .unwrap();
    })
    .unwrap();
}

struct Probe {
    main: tauri::Webview,
    events: Arc<Mutex<Vec<serde_json::Value>>>,
    listener: tauri::EventId,
}
impl Probe {
    fn new(app: &tauri::App) -> Self {
        let main = app.get_webview("main").unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let listener = main.listen("web-popup", move |event| {
            captured
                .lock()
                .unwrap()
                .push(serde_json::from_str(event.payload()).unwrap());
        });
        Self {
            main,
            events,
            listener,
        }
    }
    fn request(&self, app: &mut tauri::App, source: &tauri::Webview, expression: &str) -> String {
        self.events.lock().unwrap().clear();
        gesture(app, source, expression);
        self.wait_request(app)
    }
    fn click_request(
        &self,
        app: &mut tauri::App,
        source: &tauri::Webview,
        selector: &str,
    ) -> String {
        self.events.lock().unwrap().clear();
        super::native_popup_click_tests::click(app, source, selector);
        self.wait_request(app)
    }
    fn wait_request(&self, app: &mut tauri::App) -> String {
        pump(app, || {
            self.events
                .lock()
                .unwrap()
                .iter()
                .any(|event| event["requestId"].is_string())
        });
        self.events
            .lock()
            .unwrap()
            .iter()
            .find_map(|event| event["requestId"].as_str().map(str::to_owned))
            .unwrap()
    }
}
impl Drop for Probe {
    fn drop(&mut self) {
        self.main.unlisten(self.listener);
    }
}

fn adopt(
    app: &mut tauri::App,
    host: &Arc<WebHost>,
    sessions: &Arc<SshSessionManager>,
    request: &str,
) -> (String, tauri::Webview) {
    let id = uuid::Uuid::new_v4().to_string();
    let (host, sessions, handle, child, request) = (
        host.clone(),
        sessions.clone(),
        app.handle().clone(),
        id.clone(),
        request.to_owned(),
    );
    run(app, async move {
        host.accept_popup(&handle, &sessions, &child, &request)
            .await
    })
    .unwrap();
    let view = app.get_webview(&super::label(&id).unwrap()).unwrap();
    (id, view)
}
fn close(app: &mut tauri::App, host: &Arc<WebHost>, sessions: &Arc<SshSessionManager>, id: String) {
    let (host, sessions, handle) = (host.clone(), sessions.clone(), app.handle().clone());
    run(
        app,
        async move { host.close(&handle, &sessions, &id).await },
    )
    .unwrap();
}

pub(super) fn verify(
    app: &mut tauri::App,
    host: &Arc<WebHost>,
    sessions: &Arc<SshSessionManager>,
    source: &tauri::Webview,
    requests: &Arc<Mutex<Vec<String>>>,
) {
    wait_for_page(
        app,
        source,
        "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
    );
    let probe = Probe::new(app);
    let before = source.url().unwrap();
    eval(
        app,
        source,
        "window.popupProof='source'; localStorage.setItem('popup-proof','shared'); true",
    );
    let request = probe.request(
        app,
        source,
        "window.popupChild=window.open(location.href+'?popup=1'); true",
    );
    let (child_id, child) = adopt(app, host, sessions, &request);
    wait_for_page(
        app,
        &child,
        "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
    );
    assert_eq!(
        eval(
            app,
            &child,
            "window.opener.popupProof==='source' && localStorage.getItem('popup-proof')==='shared'"
        ),
        "true"
    );
    assert_eq!(source.url().unwrap(), before);
    let (host_copy, sessions_copy, handle, used) = (
        host.clone(),
        sessions.clone(),
        app.handle().clone(),
        request.clone(),
    );
    assert!(
        run(app, async move {
            host_copy
                .accept_popup(
                    &handle,
                    &sessions_copy,
                    &uuid::Uuid::new_v4().to_string(),
                    &used,
                )
                .await
        })
        .is_err()
    );
    let closed = Arc::new(Mutex::new(false));
    let captured = closed.clone();
    let label = child.label().to_owned();
    let listener = probe.main.listen("web-window-close", move |event| {
        if serde_json::from_str::<String>(event.payload()).unwrap() == label {
            *captured.lock().unwrap() = true;
        }
    });
    child.eval("window.close()").unwrap();
    pump(app, || *closed.lock().unwrap());
    probe.main.unlisten(listener);
    close(app, host, sessions, child_id);

    eval(
        app,
        source,
        "document.body.insertAdjacentHTML('beforeend', '<a id=popup-anchor target=_blank href=\"?anchor=1\">Open child</a>'); true",
    );
    let request = probe.click_request(app, source, "#popup-anchor");
    let (id, page) = adopt(app, host, sessions, &request);
    wait_for_page(
        app,
        &page,
        "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
    );
    super::native_popup_click_tests::assert_click(app, source);
    super::native_popup_click_tests::verify_guest_opener_denied(app, &page);
    assert_eq!(source.url().unwrap(), before);
    close(app, host, sessions, id);

    for expression in [
        "const f=document.createElement('form'); f.method='POST'; f.target='_blank'; f.action=location.href+'?form=1'; f.innerHTML='<input name=proof value=post-preserved>'; document.body.append(f); f.submit(); true",
        "window.blankChild=window.open('about:blank'); blankChild.location=location.href+'?blank=1'; true",
    ] {
        let request = probe.request(app, source, expression);
        let (id, page) = adopt(app, host, sessions, &request);
        wait_for_page(
            app,
            &page,
            "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
        );
        assert_eq!(source.url().unwrap(), before);
        close(app, host, sessions, id);
    }
    assert!(
        requests
            .lock()
            .unwrap()
            .iter()
            .any(|request| request.starts_with("POST /?form=1 ")
                && request.contains("proof=post-preserved"))
    );

    probe.events.lock().unwrap().clear();
    // The fixture delays its automatic popup until earlier synthetic activation expires.
    source
        .navigate(format!("{before}?automatic=1").parse().unwrap())
        .unwrap();
    wait_for_page(
        app,
        source,
        "document.title==='Local fixture' && typeof window.popupProof==='undefined'",
    );
    // The fixture's load script attempts a popup without any host-provided gesture.
    pump(app, || {
        probe.events.lock().unwrap().iter().any(|event| {
            event["message"]
                .as_str()
                .is_some_and(|text| text.contains("自动"))
        })
    });
    assert!(
        !probe
            .events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event["requestId"].is_string())
    );
    let request = probe.request(
        app,
        source,
        "window.open(location.href+'?rejected=1'); true",
    );
    let (handle, id) = (app.handle().clone(), request.clone());
    run(app, async move {
        super::windows_popups::reject(&handle, &id).await
    })
    .unwrap();
    let (handle, id) = (app.handle().clone(), request);
    assert!(
        run(app, async move {
            super::windows_popups::source(&handle, &id).await
        })
        .is_err()
    );
    // Mark the old document before requesting a reload so readiness cannot match it.
    eval(app, source, "window.popupProof='before-reload'; true");
    let request = probe.request(app, source, "window.open(location.href+'?stale=1'); true");
    source.reload().unwrap();
    wait_for_page(
        app,
        source,
        "document.title === 'Local fixture' && typeof window.popupProof==='undefined'",
    );
    let (handle, id) = (app.handle().clone(), request);
    assert!(
        run(app, async move {
            super::windows_popups::source(&handle, &id).await
        })
        .is_err()
    );
    let parent_request = probe.request(app, source, "window.open(location.href+'?parent=1'); true");
    let (parent_id, parent) = adopt(app, host, sessions, &parent_request);
    wait_for_page(app, &parent, "document.title==='Local fixture'");
    let pending = probe.request(app, &parent, "window.open(location.href+'?orphan=1'); true");
    close(app, host, sessions, parent_id);
    let handle = app.handle().clone();
    assert!(
        run(app, async move {
            super::windows_popups::source(&handle, &pending).await
        })
        .is_err()
    );
    let pending = probe.request(app, source, "window.open(location.href+'?expire=1'); true");
    wait_expiry(app, &probe);
    let handle = app.handle().clone();
    assert!(
        run(app, async move {
            super::windows_popups::source(&handle, &pending).await
        })
        .is_err()
    );
    eprintln!(
        "PASS: native blank links, window.open, POST payload, blank-then-navigation, opener/storage, IPC denial, script close, duplicate/rejected/stale/closed/expired requests"
    );
    if std::env::var_os("QTERM_WEB_LIVE_BAIDU").is_some() {
        verify_baidu(app, host, sessions, source);
    }
}

#[allow(deprecated)]
fn wait_expiry(app: &mut tauri::App, probe: &Probe) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    while !probe.events.lock().unwrap().iter().any(|event| {
        event["message"]
            .as_str()
            .is_some_and(|text| text.contains("超时"))
    }) {
        app.run_iteration(|_, _| {});
        assert!(
            std::time::Instant::now() < deadline,
            "popup deferral did not expire"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

fn verify_baidu(
    app: &mut tauri::App,
    host: &Arc<WebHost>,
    sessions: &Arc<SshSessionManager>,
    source: &tauri::Webview,
) {
    let probe = Probe::new(app);
    source
        .navigate("https://www.baidu.com/".parse().unwrap())
        .unwrap();
    wait_for_page(
        app,
        source,
        "document.title.includes('百度') && !!document.querySelector('a[target=\"_blank\"][href^=\"http\"]')",
    );
    let before = source.url().unwrap();
    let request = probe.click_request(app, source, "a[target=\"_blank\"][href^=\"http\"]");
    let loaded = Arc::new(Mutex::new(Vec::<String>::new()));
    let captured = loaded.clone();
    let listener = probe.main.listen("web-page-state", move |event| {
        let state: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
        if state["visited"] == true {
            captured
                .lock()
                .unwrap()
                .push(state["label"].as_str().unwrap().to_owned());
        }
    });
    let (id, child) = adopt(app, host, sessions, &request);
    pump(app, || {
        loaded
            .lock()
            .unwrap()
            .iter()
            .any(|label| label == child.label())
    });
    assert_ne!(child.url().unwrap().as_str(), "about:blank");
    assert_eq!(source.url().unwrap(), before);
    super::native_popup_click_tests::assert_click(app, source);
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../docs/qb-spec/evidence/QB-20261025-web-opener-interception");
    std::fs::create_dir_all(&folder).unwrap();
    for (name, view) in [("baidu-source.png", source), ("baidu-popup.png", &child)] {
        view.set_bounds(tauri::Rect {
            position: tauri::LogicalPosition::new(20.0, 50.0).into(),
            size: tauri::LogicalSize::new(900.0, 550.0).into(),
        })
        .unwrap();
        view.show().unwrap();
        let page = view.clone();
        let png = run(
            app,
            async move { super::windows_snapshot::capture(&page).await },
        )
        .unwrap();
        use base64::Engine;
        std::fs::write(
            folder.join(name),
            base64::engine::general_purpose::STANDARD
                .decode(png)
                .unwrap(),
        )
        .unwrap();
    }
    probe.main.unlisten(listener);
    close(app, host, sessions, id);
    eprintln!(
        "PASS: live Baidu target=_blank opens a managed native child while preserving the homepage"
    );
}

pub(super) fn verify_remote(
    app: &mut tauri::App,
    source: &tauri::Webview,
    directory: &std::path::Path,
    port: u16,
) {
    let probe = Probe::new(app);
    let before = source.url().unwrap();
    eval(
        app,
        source,
        "document.body.insertAdjacentHTML('beforeend', '<a id=remote-popup-anchor target=_blank href=\"http://remote-popup.invalid:8765/popup-proxy\">Open remote child</a>'); true",
    );
    let request = probe.click_request(app, source, "#remote-popup-anchor");
    let (handle, directory) = (app.handle().clone(), directory.to_path_buf());
    run(app, async move {
        super::windows::create_popup(&handle, "web-popup-proxy", &request, Some(port), &directory)
            .await
    })
    .unwrap();
    let child = app.get_webview("web-popup-proxy").unwrap();
    wait_for_page(
        app,
        &child,
        "document.title==='Proxy A' && document.getElementById('ipc').textContent.includes('blocked')",
    );
    assert_eq!(source.url().unwrap(), before);
    super::native_popup_click_tests::assert_click(app, source);
    super::native_popup_click_tests::verify_guest_opener_denied(app, &child);
    child.close().unwrap();
    eprintln!("PASS: native popup retains source SOCKS environment and guest restrictions");
}
