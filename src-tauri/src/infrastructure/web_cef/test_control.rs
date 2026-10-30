//! Compile-time-only parent process harness. Never registered as guest IPC.
use super::{
    Environment, WebHost, WebTarget,
    gateway::{Gateway, Route},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io::BufRead, sync::Arc};
use tauri::Manager;

pub(super) fn emit(value: Value) {
    println!("PROBE {value}");
}
pub(super) fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        emit(json!({"event":"ready"}));
        for line in std::io::stdin().lock().lines() {
            let result = line
                .map_err(|e| e.to_string())
                .and_then(|line| serde_json::from_str::<Value>(&line).map_err(|e| e.to_string()));
            let result =
                result.and_then(|command| tauri::async_runtime::block_on(run(&app, command)));
            if let Err(error) = result {
                emit(json!({"event":"error","error":error}));
            }
        }
        app.exit(0);
    });
}
pub(super) fn field<'a>(command: &'a Value, key: &str) -> Result<&'a str, String> {
    command[key]
        .as_str()
        .ok_or_else(|| format!("missing {key}"))
}
async fn run(app: &tauri::AppHandle, command: Value) -> Result<(), String> {
    let host = app.state::<WebHost>();
    match field(&command, "op")? {
        "open" => {
            let (id, profile, path) = (
                field(&command, "id")?,
                field(&command, "profile")?,
                field(&command, "path")?,
            );
            let port = command["port"]
                .as_u64()
                .filter(|p| *p > 0 && *p <= 65535)
                .ok_or("invalid port")? as u16;
            let owner = command["owner"].as_str().unwrap_or(profile);
            let mut state = host.state.lock().await;
            if let Some(e) = state.environments.get(profile) {
                // Test caller may not mutate an already-bound route when opening a sibling.
                let path = e.directory.join("fixture-port");
                if std::fs::read_to_string(path).ok().as_deref() != Some(&port.to_string()) {
                    return Err(
                        "connection proxy binding cannot change when opening a window".into(),
                    );
                }
            } else {
                let directory = host.root.join(profile);
                std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
                std::fs::write(directory.join("fixture-port"), port.to_string())
                    .map_err(|e| e.to_string())?;
                let gateway = Gateway::new(Arc::new(|_| true)).await?;
                state.environments.insert(
                    profile.into(),
                    Environment {
                        directory,
                        gateway: Some(gateway),
                        context: None,
                        owners: HashSet::new(),
                        retiring: false,
                    },
                );
            }
            let env = state
                .environments
                .get_mut(profile)
                .ok_or("missing environment")?;
            env.owners.insert(owner.into());
            env.gateway
                .as_ref()
                .ok_or("missing gateway")?
                .add(
                    owner.into(),
                    Route {
                        session: owner.into(),
                        port,
                    },
                )
                .await;
            if state.guests.contains_key(id) {
                return Err("window exists".into());
            }
            WebHost::mount(
                &mut state,
                app,
                id.into(),
                profile,
                WebTarget::Remote {
                    session_id: owner.into(),
                    profile_id: profile.into(),
                },
                format!("http://localhost:3000{path}")
                    .parse()
                    .map_err(|e| format!("URL: {e}"))?,
            )
            .await?;
            let view = app.get_webview(id).ok_or("missing fixture view")?;
            view.set_bounds(tauri::Rect {
                position: tauri::LogicalPosition::new(
                    if profile == "A" { 0.0 } else { 450.0 },
                    80.0,
                )
                .into(),
                size: tauri::LogicalSize::new(440.0, 500.0).into(),
            })
            .map_err(|e| e.to_string())?;
            view.show().map_err(|e| e.to_string())?;
        }
        "eval" => {
            let id = field(&command, "id")?;
            let view = app.get_webview(id).ok_or("unknown window")?;
            let protocol = if id == "main" {
                super::protocol::Protocol::install(&view)?
            } else {
                host.state
                    .lock()
                    .await
                    .guests
                    .get(id)
                    .ok_or("unknown window")?
                    .protocol
                    .clone()
            };
            let expression = format!("(async()=>{{ {} }})()", field(&command, "script")?);
            let result = protocol.call(&view,"Runtime.evaluate",json!({"expression":expression,"awaitPromise":true,"returnByValue":true,"userGesture":command["gesture"].as_bool().unwrap_or(false)})).await?;
            let value = if result.get("exceptionDetails").is_some() {
                json!({"tag":command["tag"],"error":result["exceptionDetails"]})
            } else {
                json!({"tag":command["tag"],"value":result["result"]["value"]})
            };
            emit(json!({"event":"result","id":id,"result":value}));
        }
        "close" => {
            let id = field(&command, "id")?;
            WebHost::close_page(&mut *host.state.lock().await, app, id).await?;
            emit(json!({"event":"closed","id":id}));
        }
        "disconnect" => {
            let owner = field(&command, "profile")?;
            let sessions = app.state::<crate::commands::session::SessionState>();
            host.disconnect(app, sessions.manager(), owner).await?;
            emit(
                json!({"event":"disconnected","profile":owner,"environments":host.state.lock().await.environments.len(),"pooledContexts":super::native::on_ui(app, || Ok(tauri_runtime_cef::pooled_request_context_count())).await?}),
            );
        }
        "counts" => {
            let state = host.state.lock().await;
            emit(
                json!({"event":"counts","environments":state.environments.len(),"guests":state.guests.len(),"gatewayPorts":state.environments.values().filter_map(|e|e.gateway.as_ref().map(|g|g.port)).collect::<Vec<_>>(),"pooledContexts":super::native::on_ui(app, || Ok(tauri_runtime_cef::pooled_request_context_count())).await?}),
            );
        }
        "popup-info" => {
            use tauri_runtime_cef::cef::*;
            let view = app
                .get_webview(field(&command, "id")?)
                .ok_or("missing root")?;
            let info = super::native::with(&view, |view| Ok(view.popups().iter().map(|p| json!({"id":p.browser().identifier(), "chrome":p.browser().host().is_some_and(|h| h.runtime_style() == RuntimeStyle::CHROME)})).collect::<Vec<_>>())).await?;
            emit(json!({"event":"popup-info","popups":info}));
        }
        "popup-eval" => {
            use tauri_runtime_cef::cef::*;
            let view = app
                .get_webview(field(&command, "id")?)
                .ok_or("missing root")?;
            let popup_id = command["popup"].as_i64().ok_or("missing popup")? as i32;
            let expression = field(&command, "script")?.to_string();
            let message_id =
                tauri_runtime_cef::allocate_devtools_message_id().map_err(|e| e.to_string())?;
            super::native::with(&view, move |view| {
                let browser = view.popups().iter().map(|popup| popup.browser())
                    .find(|browser| browser.identifier() == popup_id).ok_or("unknown popup in root family")?;
                let message = json!({"id":message_id,"method":"Runtime.evaluate","params":{"expression":expression,"userGesture":true}}).to_string();
                if browser.host().ok_or("missing popup host")?.send_dev_tools_message(Some(message.as_bytes())) != 1 {
                    return Err("popup DevTools dispatch failed".into());
                }
                Ok(())
            }).await?;
            emit(json!({"event":"popup-dispatched"}));
        }
        "network-gate" => {
            let directory = host
                .state
                .lock()
                .await
                .environments
                .get(field(&command, "profile")?)
                .ok_or("unknown environment")?
                .directory
                .clone();
            let enabled = command["enabled"].as_bool().ok_or("missing gate state")?;
            super::native::on_ui(app, move || {
                tauri_runtime_cef::set_request_context_network_enabled(&directory, enabled)
            })
            .await?;
            emit(json!({"event":"gate-changed"}));
        }
        "fail-close-once" => {
            super::native::FAIL_CLOSE_ONCE.store(true, std::sync::atomic::Ordering::SeqCst);
            emit(json!({"event":"failure-armed"}));
        }
        "quit" => {
            host.shutdown(app).await?;
            app.exit(0);
        }
        _ => super::test_session::run(app, &command).await?,
    }
    Ok(())
}
