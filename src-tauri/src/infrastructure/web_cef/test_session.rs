//! Parent-only integration driver for the real authenticated Qterm SSH/session path.
use super::{
    WebHost, WebTarget,
    test_control::{emit, field},
};
use crate::{
    commands::session::SessionState,
    domain::{
        auth::AuthRequest,
        session::{HostEndpoint, SessionEvent, SessionState as Status},
    },
    infrastructure::ssh::client::{SessionConnectRequest, SessionPurpose, SessionRouteNode},
};
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::Manager;

pub(super) async fn run(app: &tauri::AppHandle, command: &Value) -> Result<(), String> {
    let state = app.state::<SessionState>();
    let manager = state.manager();
    let host = app.state::<WebHost>();
    match field(command, "op")? {
        "ssh-connect" => {
            let profile = field(command, "profile")?.to_string();
            let (send, mut receive) = tokio::sync::mpsc::unbounded_channel();
            let port = command["port"]
                .as_u64()
                .and_then(|p| u16::try_from(p).ok())
                .ok_or("invalid SSH port")?;
            let id = manager.connect(
                SessionConnectRequest {
                    route: vec![SessionRouteNode {
                        profile_id: profile.clone(),
                        name: "CEF fixture".into(),
                        endpoint: HostEndpoint::new("127.0.0.1", port.into())
                            .map_err(|_| "invalid endpoint")?,
                        username: field(command, "username")?.into(),
                        auth: AuthRequest::PrivateKey {
                            path: field(command, "key")?.into(),
                            passphrase: None,
                        },
                    }],
                    purpose: SessionPurpose::Network,
                    profile_id: Some(profile),
                    terminal_size: None,
                    initial_directory: None,
                    terminal_output: Arc::new(|_| {}),
                    remote_shell_integration_enabled: false,
                    history_free_bash_enabled: false,
                },
                Arc::new(move |event| {
                    let _ = send.send(event);
                }),
            );
            let connected = async {
                while let Some(event) = receive.recv().await {
                    match event {
                        SessionEvent::HostKeyConfirmationRequired { fingerprint, .. }
                            if fingerprint == field(command, "fingerprint")? =>
                        {
                            manager.accept_host_key(&id).map_err(|e| format!("{e:?}"))?
                        }
                        SessionEvent::HostKeyConfirmationRequired { .. }
                        | SessionEvent::HostKeyChanged { .. } => {
                            return Err("fixture host key does not match pinned fingerprint".into());
                        }
                        SessionEvent::StateChanged(Status::Connected) => return Ok(()),
                        SessionEvent::Failed { failure, .. } => {
                            return Err(format!("SSH fixture: {failure:?}"));
                        }
                        _ => {}
                    }
                }
                Err("SSH fixture ended".into())
            };
            let result: Result<(), String> =
                tokio::time::timeout(std::time::Duration::from_secs(20), connected)
                    .await
                    .map_err(|_| "SSH fixture timeout".to_string())
                    .and_then(|r| r);
            if let Err(error) = result {
                let _ = manager.close(&id);
                return Err(error);
            }
            emit(json!({"event":"ssh-connected","session":id,"tag":command["tag"]}));
        }
        "ssh-open" => {
            let id = field(command, "id")?;
            host.open(
                app,
                manager,
                id,
                &WebTarget::Remote {
                    session_id: field(command, "session")?.into(),
                    profile_id: field(command, "profile")?.into(),
                },
                field(command, "url")?,
            )
            .await?;
            host.sync(
                app,
                manager,
                id,
                serde_json::from_value(
                    json!({"x":0,"y":80,"width":440,"height":500,"visible":true}),
                )
                .unwrap(),
            )
            .await?;
        }
        "ssh-close" => {
            let session = field(command, "session")?;
            manager.close(session).map_err(|e| format!("{e:?}"))?;
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
            loop {
                let state = host.state.lock().await;
                let owned = state
                    .environments
                    .values()
                    .any(|e| e.owners.contains(session));
                let pages = state
                    .guests
                    .values()
                    .any(|g| g.target.session() == Some(session));
                drop(state);
                if !owned && !pages {
                    break;
                }
                if tokio::time::Instant::now() >= deadline {
                    return Err("automatic disconnect cleanup timeout".into());
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
            emit(json!({"event":"ssh-closed","session":session}));
        }
        "browser-action" => {
            host.action(
                app,
                manager,
                field(command, "id")?,
                field(command, "action")?,
                command["url"].as_str(),
            )
            .await?;
            emit(json!({"event":"action-done"}));
        }
        "browser-clear" => {
            host.clear_data(
                app,
                manager,
                field(command, "id")?,
                serde_json::from_value(command["selection"].clone()).map_err(|e| e.to_string())?,
            )
            .await?;
            emit(json!({"event":"clear-done"}));
        }
        "browser-observe" => {
            let id = field(command, "id")?;
            let metrics = host.metrics(app, manager, id).await?;
            let snapshot = serde_json::to_value(host.snapshot(app, manager, id).await?)
                .map_err(|e| e.to_string())?;
            emit(
                json!({"event":"observed","metrics":metrics,"snapshotBytes":snapshot["png"].as_str().map(str::len)}),
            );
        }
        _ => return Err("unknown SSH fixture operation".into()),
    }
    Ok(())
}
