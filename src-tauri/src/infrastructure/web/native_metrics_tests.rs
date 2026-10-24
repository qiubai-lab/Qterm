//! Invoked by the isolated native browser smoke, never against user pages.
pub(super) fn verify(app: &mut tauri::App, view: &tauri::Webview) {
    let view = view.clone();
    let (send, receive) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let metrics = super::metrics::sample(&view).await.unwrap().unwrap();
        send.send(serde_json::to_value(metrics).unwrap()).unwrap();
    });
    let sample = std::cell::RefCell::new(None);
    super::native_surface_tests::pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *sample.borrow_mut() = Some(value);
        }
        sample.borrow().is_some()
    });
    let sample = sample.into_inner().unwrap();
    assert!(sample["resources"].as_u64().unwrap() > 0);
    assert!(sample["documentId"].as_f64().unwrap() > 0.0);
    assert!(sample["url"].as_str().unwrap().starts_with("http://"));
    eprintln!("PASS: fixed native metrics sampler returns document-scoped aggregate resources");
}
