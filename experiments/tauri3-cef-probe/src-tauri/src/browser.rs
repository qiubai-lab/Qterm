use std::path::Path;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, webview::PageLoadEvent};
use tauri_runtime_cef::WebviewWindowBuilderCefExt;

pub fn open(
    app: &tauri::AppHandle,
    root: &Path,
    id: &str,
    profile: &str,
    port: u16,
    path: &str,
) -> Result<(), String> {
    if !["A", "B"].contains(&profile)
        || port == 0
        || !path.starts_with('/')
        || path.starts_with("//")
    {
        return Err("invalid fixture profile, proxy port or path".into());
    }
    let connections = app.state::<crate::connections::Connections>();
    connections.validate(profile, port)?;
    let console_id = id.to_string();
    let load_id = id.to_string();
    let (blank_sender, blank_receiver) = std::sync::mpsc::channel();
    let window = WebviewWindowBuilder::new(
        app,
        id,
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .title(format!("Qterm CEF Probe — {profile} / {id}"))
    .inner_size(800.0, 560.0)
    .data_directory(root.join(format!("profile-{profile}")))
    .on_console_message(move |message| {
        if let Some(json) = message.message.strip_prefix("PROBE_RESULT ")
            && let Ok(value) = serde_json::from_str::<serde_json::Value>(json)
        {
            crate::report::emit(
                serde_json::json!({"event":"result","id":console_id,"result":value}),
            );
        }
    })
    .on_page_load(move |_, payload| {
        if !matches!(payload.event(), PageLoadEvent::Finished) {
            return;
        }
        if payload.url().as_str() == "about:blank" {
            let _ = blank_sender.send(());
        } else if payload.url().as_str().starts_with("http://localhost:3000/") {
            crate::report::emit(
                serde_json::json!({"event":"loaded","id":load_id,"url":payload.url().as_str()}),
            );
        }
    })
    .build()
    .map_err(|e| e.to_string())?;
    // The alpha runtime posts its initial URL asynchronously after CDP setup.
    // Waiting for that load prevents it from overwriting our subsequent navigation.
    if let Err(error) = blank_receiver.recv_timeout(std::time::Duration::from_secs(15)) {
        let _ = window.destroy();
        return Err(format!("initial blank document did not finish: {error}"));
    }
    let reused = match connections.configure(&window, profile, port) {
        Ok(reused) => reused,
        Err(error) => {
            let _ = window.destroy();
            return Err(error);
        }
    };
    crate::report::emit(
        serde_json::json!({"event":"proxy_ready","id":id,"profile":profile,"port":port,
            "context_reused":reused,"native_identity_verified":true,"other_contexts_isolated":true}),
    );
    window
        .navigate(
            format!("http://localhost:3000{path}")
                .parse()
                .map_err(|e| format!("URL: {e}"))?,
        )
        .map_err(|e| e.to_string())
}
