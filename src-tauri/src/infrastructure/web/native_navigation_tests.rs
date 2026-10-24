//! Real same-document navigation and native Stop checks in the isolated proxy fixture.
use super::{native_surface_tests::pump, windows_navigation};
use std::sync::{Arc, Mutex};
use tauri::{Listener, Manager};

pub(super) struct NavigationProbe {
    events: Arc<Mutex<Vec<serde_json::Value>>>,
    main: tauri::Webview,
    listener: tauri::EventId,
}
impl NavigationProbe {
    pub fn new(app: &tauri::App) -> Self {
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let main = app.get_webview("main").unwrap();
        let listener = main.listen("web-page-state", move |event| {
            captured
                .lock()
                .unwrap()
                .push(serde_json::from_str(event.payload()).unwrap());
        });
        Self {
            events,
            main,
            listener,
        }
    }
    fn saw(&self, suffix: &str, loading: bool, visited: bool) -> bool {
        self.events.lock().unwrap().iter().any(|event| {
            event["label"] == "web-smoke-a"
                && event["url"]
                    .as_str()
                    .is_some_and(|url| url.ends_with(suffix))
                && event["loading"] == loading
                && event["visited"] == visited
        })
    }
    pub fn verify(
        &self,
        app: &mut tauri::App,
        view: &tauri::Webview,
        preserved: impl Fn() -> bool,
    ) {
        pump(app, || self.saw("127.0.0.1:8765/", false, true));
        assert!(
            self.events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e["title"] == "Proxy A" && e["visited"] == true)
        );
        view.eval("document.title='Native updated title'").unwrap();
        pump(app, || {
            self.events.lock().unwrap().iter().any(|e| {
                e["title"] == "Native updated title"
                    && e["metadata"] == true
                    && e["visited"] == false
            })
        });
        for (script, suffix) in [
            (
                "history.pushState({},'', '/dashboard/overview')",
                "/dashboard/overview",
            ),
            (
                "history.replaceState({},'', '/dashboard/settings#section')",
                "/dashboard/settings#section",
            ),
            ("location.hash='second'", "/dashboard/settings#second"),
            ("history.back()", "/dashboard/settings#section"),
            ("history.forward()", "/dashboard/settings#second"),
        ] {
            self.events.lock().unwrap().clear();
            view.eval(script).unwrap();
            pump(app, || self.saw(suffix, false, true));
        }
        view.eval("window.__qtermStopProof='kept'").unwrap();
        self.events.lock().unwrap().clear();
        view.navigate("http://127.0.0.1:8765/slow".parse().unwrap())
            .unwrap();
        pump(app, || self.saw("/slow", true, false));
        let native = view.clone();
        let (send, receive) = std::sync::mpsc::channel();
        tauri::async_runtime::spawn(async move {
            send.send(windows_navigation::stop(&native).await).unwrap();
        });
        // Pump until the native UI-thread action has returned without blocking that thread.
        pump(app, || {
            if let Ok(result) = receive.try_recv() {
                result.unwrap();
                true
            } else {
                false
            }
        });
        pump(app, || {
            self.events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e["label"] == "web-smoke-a" && e["loading"] == false)
        });
        assert!(
            !self
                .events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e["label"] == "web-smoke-a" && e["visited"] == true)
        );
        assert!(app.get_webview(view.label()).is_some());
        view.eval("if(window.__qtermStopProof==='kept') fetch('/stop-preserved')")
            .unwrap();
        pump(app, preserved);
        view.navigate("http://127.0.0.1:8765/after-stop".parse().unwrap())
            .unwrap();
        pump(app, || self.saw("/after-stop", false, true));
        eprintln!(
            "PASS: native pushState/replaceState/hash/back/forward, pending Stop preserves document and guest, subsequent navigation succeeds"
        );
    }
}
impl Drop for NavigationProbe {
    fn drop(&mut self) {
        self.main.unlisten(self.listener);
    }
}
