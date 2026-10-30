use super::WebHost;
use tauri::Manager;
use tauri_runtime_cef::{WebviewCefExt, cef::*};

pub(crate) fn initialize_main(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let main = app.get_webview("main").ok_or("main webview missing")?;
    main.with_cef_webview(|native| {
        if let Some(context) = native
            .browser()
            .host()
            .and_then(|host| host.request_context())
            && let Err(error) = super::contexts::apply(&context, None)
        {
            eprintln!("Main UI network initialization failed: {error}");
        }
    })?;
    #[cfg(feature = "cef-integration-test")]
    super::test_control::start(app.clone());
    Ok(())
}
pub(crate) fn on_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    use std::sync::atomic::{AtomicU8, Ordering};
    // 0 = running, 1 = draining, 2 = release complete. A second user quit must
    // not bypass the first request's asynchronous native cleanup.
    static PHASE: AtomicU8 = AtomicU8::new(0);
    if let tauri::RunEvent::ExitRequested { api, .. } = event {
        if PHASE.load(Ordering::SeqCst) == 2 {
            return;
        }
        api.prevent_exit();
        if PHASE
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = app.state::<WebHost>().shutdown(&app).await {
                    eprintln!("CEF shutdown cleanup failed: {error}");
                }
                PHASE.store(2, Ordering::SeqCst);
                app.exit(0);
            });
        }
    }
}
