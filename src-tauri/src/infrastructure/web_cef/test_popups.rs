//! Native popup adoption controls compiled only into the isolated test artifact.
use super::{
    WebHost,
    test_control::{emit, field},
};
use serde_json::{Value, json};
use tauri::Manager;
use tauri_runtime_cef::cef::*;
pub(super) async fn run(app: &tauri::AppHandle, command: &Value) -> Result<(), String> {
    let host = app.state::<WebHost>();
    match field(command, "op")? {
        "popup-accept" => {
            let sessions = app.state::<crate::commands::session::SessionState>();
            let id = field(command, "id")?;
            host.accept_popup(app, sessions.manager(), id, field(command, "request")?)
                .await?;
            emit(json!({"event":"popup-accepted","id":format!("web-{id}")}));
        }
        "popup-reject" => {
            super::popups::reject_popup(app, field(command, "request")?).await?;
            emit(json!({"event":"popup-rejected"}));
        }
        "popup-surface" => {
            let sessions = app.state::<crate::commands::session::SessionState>();
            let id = field(command, "id")?
                .strip_prefix("web-")
                .ok_or("invalid label")?;
            host.sync(
                app,
                sessions.manager(),
                id,
                serde_json::from_value(
                    json!({"x":0,"y":80,"width":440,"height":500,"visible":true}),
                )
                .unwrap(),
            )
            .await?;
            let state = host.state.lock().await;
            let view = state
                .guests
                .get(field(command, "id")?)
                .ok_or("unknown popup")?
                .view(app, field(command, "id")?)?;
            let root = app
                .get_webview(field(command, "root")?)
                .ok_or("unknown root")?;
            let parent = super::native::with(&root, |view| Ok(view.browser())).await?;
            let info = view
                .with(move |browser| {
                    #[cfg(target_os = "macos")]
                    unsafe extern "C" {
                        fn qterm_cef_same_window(
                            a: *mut std::ffi::c_void,
                            b: *mut std::ffi::c_void,
                        ) -> bool;
                    }
                    #[cfg(target_os = "macos")]
                    let same = unsafe {
                        qterm_cef_same_window(
                            browser
                                .host()
                                .ok_or("popup missing host")?
                                .window_handle()
                                .cast(),
                            parent
                                .host()
                                .ok_or("root missing host")?
                                .window_handle()
                                .cast(),
                        )
                    };
                    #[cfg(not(target_os = "macos"))]
                    let same = false;
                    Ok(json!({"sameWindow":same,"valid":browser.is_valid()!=0}))
                })
                .await?;
            emit(json!({"event":"popup-surface","info":info}));
        }
        _ => return Err("unknown popup command".into()),
    }
    Ok(())
}
