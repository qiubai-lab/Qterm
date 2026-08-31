use super::*;

mod files;
mod git;
mod terminal;

use files::run_files_session;
use git::run_git_session;
use terminal::run_terminal_session;

pub(super) fn initial_terminal_size(request: &SessionConnectRequest) -> TerminalSize {
    request
        .terminal_size
        .expect("terminal sessions have a validated initial size")
}

pub(super) fn shell_integration_target(
    request: &SessionConnectRequest,
) -> Option<crate::domain::shell_integration::RemoteShellTarget> {
    if request.purpose != SessionPurpose::Terminal || !request.remote_shell_integration_enabled {
        return None;
    }
    request.route.last().map(|target| {
        crate::domain::shell_integration::RemoteShellTarget::new(
            target.profile_id.clone(),
            target.endpoint.host().to_owned(),
            target.endpoint.port(),
            target.username.clone(),
        )
    })
}

async fn connect_route(
    entry: Arc<SessionEntry>,
    host_keys: Arc<KnownHostService>,
    config: Arc<Config>,
    network_runtime: &NetworkForwardRuntime,
    route: Vec<SessionRouteNode>,
    cancel: &mut oneshot::Receiver<()>,
) -> Option<(
    client::Handle<ClientHandler>,
    Vec<client::Handle<ClientHandler>>,
)> {
    let total = route.len();
    let mut handles: Vec<client::Handle<ClientHandler>> = Vec::with_capacity(total);
    let mut metadata: Vec<RouteNodeMetadata> = Vec::with_capacity(total);

    for (index, node) in route.into_iter().enumerate() {
        let node_metadata = node.metadata(index, total);
        if index > 0 {
            let previous = metadata[index - 1].clone();
            entry.emit(SessionEvent::RouteProgress {
                node: previous.clone(),
                stage: RouteStage::OpenTunnel,
            });
            let tunnel = handles[index - 1].channel_open_direct_tcpip(
                node.endpoint.host().to_owned(),
                u32::from(node.endpoint.port()),
                "127.0.0.1",
                0,
            );
            let channel = tokio::select! {
                result = tunnel => match result {
                    Ok(channel) => channel,
                    Err(_) => {
                        if entry.state() != SessionState::Failed {
                            entry.fail_at(
                                SessionFailure::TunnelOpenFailed,
                                previous,
                                RouteStage::OpenTunnel,
                            );
                        }
                        disconnect_handles(&mut handles).await;
                        return None;
                    }
                },
                _ = &mut *cancel => {
                    disconnect_handles(&mut handles).await;
                    entry.transition(SessionState::Closed);
                    return None;
                }
            };
            entry.emit(SessionEvent::RouteProgress {
                node: node_metadata.clone(),
                stage: RouteStage::Connect,
            });
            let handler = route_handler(
                Arc::clone(&entry),
                Arc::clone(&host_keys),
                network_runtime,
                node_metadata.clone(),
            );
            let connection = tokio::time::timeout(
                CONNECT_TIMEOUT,
                client::connect_stream(Arc::clone(&config), channel.into_stream(), handler),
            );
            let handle = tokio::select! {
                result = connection => match result {
                    Ok(Ok(handle)) => handle,
                    _ => {
                        if entry.state() != SessionState::Failed {
                            entry.fail_at(
                                SessionFailure::ConnectionFailed,
                                node_metadata.clone(),
                                RouteStage::Connect,
                            );
                        }
                        disconnect_handles(&mut handles).await;
                        return None;
                    }
                },
                _ = &mut *cancel => {
                    disconnect_handles(&mut handles).await;
                    entry.transition(SessionState::Closed);
                    return None;
                }
            };
            handles.push(handle);
        } else {
            entry.emit(SessionEvent::RouteProgress {
                node: node_metadata.clone(),
                stage: RouteStage::Connect,
            });
            let handler = route_handler(
                Arc::clone(&entry),
                Arc::clone(&host_keys),
                network_runtime,
                node_metadata.clone(),
            );
            let address = (node.endpoint.host().to_owned(), node.endpoint.port());
            let connection = tokio::time::timeout(
                CONNECT_TIMEOUT,
                client::connect(Arc::clone(&config), address, handler),
            );
            let handle = tokio::select! {
                result = connection => match result {
                    Ok(Ok(handle)) => handle,
                    _ => {
                        if entry.state() != SessionState::Failed {
                            entry.fail_at(
                                SessionFailure::ConnectionFailed,
                                node_metadata.clone(),
                                RouteStage::Connect,
                            );
                        }
                        return None;
                    }
                },
                _ = &mut *cancel => {
                    entry.transition(SessionState::Closed);
                    return None;
                }
            };
            handles.push(handle);
        }

        if !entry.transition(SessionState::Authenticating) {
            disconnect_handles(&mut handles).await;
            return None;
        }
        entry.emit(SessionEvent::RouteProgress {
            node: node_metadata.clone(),
            stage: RouteStage::Authenticate,
        });
        let authentication = authenticate(
            handles.last_mut().expect("connected route handle"),
            node.username,
            node.auth,
        );
        tokio::select! {
            result = authentication => if let Err(error) = result {
                entry.fail_at(
                    SessionFailure::Authentication(error),
                    node_metadata.clone(),
                    RouteStage::Authenticate,
                );
                disconnect_handles(&mut handles).await;
                return None;
            },
            _ = &mut *cancel => {
                disconnect_handles(&mut handles).await;
                entry.transition(SessionState::Closed);
                return None;
            }
        }
        metadata.push(node_metadata);
        if index + 1 < total && !entry.transition(SessionState::Connecting) {
            disconnect_handles(&mut handles).await;
            return None;
        }
    }

    let handle = handles.pop().expect("validated session route is not empty");
    Some((handle, handles))
}

fn route_handler(
    entry: Arc<SessionEntry>,
    host_keys: Arc<KnownHostService>,
    network_runtime: &NetworkForwardRuntime,
    node: RouteNodeMetadata,
) -> ClientHandler {
    let allow_remote_forwards = node.role == RouteNodeRole::Target;
    ClientHandler {
        entry,
        node,
        host_keys,
        remote_forwards: Arc::clone(&network_runtime.remote_forwards),
        forward_tasks: Arc::clone(&network_runtime.forward_tasks),
        forward_permits: Arc::clone(&network_runtime.forward_permits),
        allow_remote_forwards,
    }
}

async fn disconnect_handles(handles: &mut Vec<client::Handle<ClientHandler>>) {
    while let Some(handle) = handles.pop() {
        let _ = handle
            .disconnect(Disconnect::ByApplication, "route closed", "en")
            .await;
    }
}

pub(super) async fn run_session(
    entry: Arc<SessionEntry>,
    host_keys: Arc<KnownHostService>,
    shell_cache: Arc<
        crate::infrastructure::persistence::json_remote_shell_cache::JsonRemoteShellCache,
    >,
    mut request: SessionConnectRequest,
    mut cancel: oneshot::Receiver<()>,
    mut controls: mpsc::Receiver<SessionControl>,
) {
    let shell_target = shell_integration_target(&request);
    let network_runtime = network_runtime();
    let config = Arc::new(Config {
        inactivity_timeout: Some(Duration::from_secs(300)),
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        nodelay: true,
        ..Config::default()
    });
    let Some((mut handle, mut upstream_handles)) = connect_route(
        Arc::clone(&entry),
        host_keys,
        config,
        &network_runtime,
        std::mem::take(&mut request.route),
        &mut cancel,
    )
    .await
    else {
        return;
    };

    match request.purpose {
        SessionPurpose::Files => {
            run_files_session(&entry, &mut handle, &mut cancel, &mut controls).await;
            disconnect_handles(&mut upstream_handles).await;
            entry.transition(SessionState::Closed);
        }
        SessionPurpose::Network => {
            run_network_session(
                &entry,
                &mut handle,
                &mut cancel,
                &mut controls,
                network_runtime,
            )
            .await;
            disconnect_handles(&mut upstream_handles).await;
        }
        SessionPurpose::Git => {
            run_git_session(&entry, &mut handle, &mut cancel, &mut controls).await;
            disconnect_handles(&mut upstream_handles).await;
            entry.transition(SessionState::Closed);
        }
        SessionPurpose::Terminal => {
            let closed = run_terminal_session(
                &entry,
                &mut handle,
                shell_cache.as_ref(),
                shell_target,
                request,
                &mut cancel,
                &mut controls,
            )
            .await;
            disconnect_handles(&mut upstream_handles).await;
            if closed {
                entry.transition(SessionState::Closed);
            }
        }
    }
}

fn network_runtime() -> NetworkForwardRuntime {
    let remote_forwards = RemoteForwardMap::default();
    let forward_tasks = ForwardTaskRegistry::default();
    let forward_permits = new_forward_permits();
    let (direct_sender, direct_receiver) = mpsc::channel(MAX_ACTIVE_FORWARD_CONNECTIONS);
    NetworkForwardRuntime {
        direct_sender,
        direct_receiver,
        remote_forwards,
        forward_tasks,
        forward_permits,
    }
}
