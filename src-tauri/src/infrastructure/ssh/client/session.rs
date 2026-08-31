use super::*;

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
    let remote_forwards = RemoteForwardMap::default();
    let forward_tasks = ForwardTaskRegistry::default();
    let forward_permits = new_forward_permits();
    let (direct_sender, direct_receiver) = mpsc::channel(MAX_ACTIVE_FORWARD_CONNECTIONS);
    let network_runtime = NetworkForwardRuntime {
        direct_sender,
        direct_receiver,
        remote_forwards,
        forward_tasks,
        forward_permits,
    };
    let config = Arc::new(Config {
        inactivity_timeout: Some(Duration::from_secs(300)),
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        nodelay: true,
        ..Config::default()
    });
    let Some((mut handle, upstream_handles)) = connect_route(
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
    let mut upstream_handles = upstream_handles;

    if request.purpose == SessionPurpose::Files {
        entry.transition(SessionState::Connected);
        while entry.state() == SessionState::Connected {
            tokio::select! {
                _ = &mut cancel => {
                    entry.transition(SessionState::Closing);
                }
                control = controls.recv() => match control {
                    Some(SessionControl::StartTransfer { id, request, events, cancel }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                let transfer_entry = Arc::clone(&entry);
                                tauri::async_runtime::spawn(async move {
                                    run_transfer(channel.into_stream(), request, events, cancel).await;
                                    transfer_entry.finish_transfer(&id);
                                });
                            }
                            _ => {
                                events(TransferEvent::Failed);
                                entry.finish_transfer(&id);
                            }
                        }
                    }
                    Some(SessionControl::ListDirectory { path, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = list_remote_directory(channel.into_stream(), path).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => {
                                let _ = reply.send(Err(()));
                            }
                        }
                    }
                    Some(SessionControl::ReadFile { path, limit, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = read_remote_file(channel.into_stream(), path, limit).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::WriteTextFile { path, text, expected_revision, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = write_remote_text_file(channel.into_stream(), path, text, expected_revision).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::MutateEntry { request, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = mutate_remote_entry(channel.into_stream(), request).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::StoreTerminalStaging { upload_id, sources, events, .. }) => {
                        entry.finish_clipboard_upload(&upload_id);
                        for source in sources.into_iter().filter(|source| source.cleanup_after) {
                            let _ = std::fs::remove_file(source.path);
                        }
                        events(TerminalStagingEvent::Failed);
                    }
                    Some(SessionControl::RunGit { reply, .. }) => { let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable)); }
                    Some(SessionControl::RunGitCommitFiles { reply, .. }) => { let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable)); }
                    Some(SessionControl::Write(_) | SessionControl::Resize(_) | SessionControl::StartNetworkRule { .. } | SessionControl::StopNetworkRule { .. }) => {}
                    None => {
                        entry.transition(SessionState::Closing);
                    }
                }
            }
        }
        let _ = handle
            .disconnect(Disconnect::ByApplication, "file session closed", "en")
            .await;
        disconnect_handles(&mut upstream_handles).await;
        entry.transition(SessionState::Closed);
        return;
    }

    if request.purpose == SessionPurpose::Network {
        run_network_session(
            &entry,
            &mut handle,
            &mut cancel,
            &mut controls,
            network_runtime,
        )
        .await;
        disconnect_handles(&mut upstream_handles).await;
        return;
    }

    if request.purpose == SessionPurpose::Git {
        entry.transition(SessionState::Connected);
        while entry.state() == SessionState::Connected {
            tokio::select! {
                _ = &mut cancel => { entry.transition(SessionState::Closing); }
                control = controls.recv() => match control {
                    Some(SessionControl::RunGit { action, reply }) => {
                        let operation = git::run_remote_git_action(&handle, action);
                        tokio::select! {
                            result = operation => { let _ = reply.send(result); }
                            _ = &mut cancel => {
                                let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                                entry.transition(SessionState::Closing);
                            }
                        }
                    }
                    Some(SessionControl::RunGitCommitFiles { repository, oid, reply }) => {
                        let operation = git::commit_files(&handle, &repository, &oid);
                        tokio::select! {
                            result = operation => { let _ = reply.send(result); }
                            _ = &mut cancel => {
                                let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                                entry.transition(SessionState::Closing);
                            }
                        }
                    }
                    Some(SessionControl::StartNetworkRule { reply, .. } | SessionControl::StopNetworkRule { reply, .. }) => {
                        let _ = reply.send(Err(SessionControlError::NetworkUnavailable));
                    }
                    Some(SessionControl::ListDirectory { path, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = list_remote_directory(channel.into_stream(), path).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(())); }
                        }
                    }
                    Some(SessionControl::ReadFile { reply, .. } | SessionControl::WriteTextFile { reply, .. }) => {
                        let _ = reply.send(Err(SessionControlError::FileUnavailable));
                    }
                    Some(SessionControl::MutateEntry { reply, .. }) => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    Some(SessionControl::StartTransfer { id, events, .. }) => {
                        events(TransferEvent::Failed);
                        entry.finish_transfer(&id);
                    }
                    Some(SessionControl::StoreTerminalStaging { upload_id, sources, events, .. }) => {
                        entry.finish_clipboard_upload(&upload_id);
                        for source in sources.into_iter().filter(|source| source.cleanup_after) { let _ = std::fs::remove_file(source.path); }
                        events(TerminalStagingEvent::Failed);
                    }
                    Some(SessionControl::Write(_) | SessionControl::Resize(_)) => {}
                    None => { entry.transition(SessionState::Closing); }
                }
            }
        }
        let _ = handle
            .disconnect(Disconnect::ByApplication, "git session closed", "en")
            .await;
        disconnect_handles(&mut upstream_handles).await;
        entry.transition(SessionState::Closed);
        return;
    }

    let remote_shell = match shell_target.as_ref() {
        Some(target) => {
            shell_integration::resolve_remote_shell(&handle, shell_cache.as_ref(), target).await
        }
        None => None,
    };

    let terminal = match handle.channel_open_session().await {
        Ok(channel) => channel,
        Err(_) => {
            entry.fail(SessionFailure::ConnectionFailed);
            let _ = handle
                .disconnect(Disconnect::ByApplication, "session failed", "en")
                .await;
            disconnect_handles(&mut upstream_handles).await;
            return;
        }
    };
    let terminal_size = initial_terminal_size(&request);
    let terminal_modes = remote_shell
        .filter(|shell| shell.suppress_pty_echo())
        .map(|_| vec![(russh::Pty::ECHO, 0)])
        .unwrap_or_default();
    if terminal
        .request_pty(
            false,
            "xterm-256color",
            terminal_size.columns,
            terminal_size.rows,
            0,
            0,
            &terminal_modes,
        )
        .await
        .is_err()
        || terminal.request_shell(false).await.is_err()
    {
        entry.fail(SessionFailure::ConnectionFailed);
        let _ = handle
            .disconnect(Disconnect::ByApplication, "session failed", "en")
            .await;
        disconnect_handles(&mut upstream_handles).await;
        return;
    }
    if let Some(shell) = remote_shell
        && terminal
            .data(
                shell
                    .initialization_command(request.initial_directory.as_ref())
                    .as_bytes(),
            )
            .await
            .is_err()
    {
        entry.fail(SessionFailure::ConnectionFailed);
        let _ = handle
            .disconnect(Disconnect::ByApplication, "session failed", "en")
            .await;
        disconnect_handles(&mut upstream_handles).await;
        return;
    }
    let (mut terminal_read, terminal_write) = terminal.split();
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut cancel => {
                entry.transition(SessionState::Closing);
            }
            control = controls.recv() => match control {
                Some(SessionControl::Write(data)) => {
                    if terminal_write.data_bytes(data).await.is_err() {
                        entry.fail(SessionFailure::ConnectionFailed);
                    }
                }
                Some(SessionControl::Resize(size)) => {
                    if terminal_write.window_change(size.columns, size.rows, 0, 0).await.is_err() {
                        entry.fail(SessionFailure::ConnectionFailed);
                    }
                }
                Some(SessionControl::StoreTerminalStaging { upload_id, session_token, sources, events, cancel }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            let clipboard_entry = Arc::clone(&entry);
                            let registered = entry.clipboard_directories();
                            tauri::async_runtime::spawn(async move {
                                let directory = run_terminal_staging(
                                    channel.into_stream(),
                                    &session_token,
                                    sources,
                                    &registered,
                                    events,
                                    cancel,
                                )
                                .await;
                                if let Some(directory) = directory {
                                    clipboard_entry.register_clipboard_directory(directory);
                                }
                                clipboard_entry.finish_clipboard_upload(&upload_id);
                            });
                        }
                        _ => {
                            for source in sources.into_iter().filter(|source| source.cleanup_after) {
                                let _ = std::fs::remove_file(source.path);
                            }
                            events(TerminalStagingEvent::Failed);
                            entry.finish_clipboard_upload(&upload_id);
                        }
                    }
                }
                Some(SessionControl::StartTransfer { id, request, events, cancel }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            let transfer_entry = Arc::clone(&entry);
                            tauri::async_runtime::spawn(async move {
                                run_transfer(channel.into_stream(), request, events, cancel).await;
                                transfer_entry.finish_transfer(&id);
                            });
                        }
                        _ => {
                            events(TransferEvent::Failed);
                            entry.finish_transfer(&id);
                        }
                    }
                }
                Some(SessionControl::ListDirectory { path, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = list_remote_directory(channel.into_stream(), path).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => {
                            let _ = reply.send(Err(()));
                        }
                    }
                }
                Some(SessionControl::ReadFile { path, limit, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = read_remote_file(channel.into_stream(), path, limit).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::WriteTextFile { path, text, expected_revision, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = write_remote_text_file(channel.into_stream(), path, text, expected_revision).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::MutateEntry { request, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = mutate_remote_entry(channel.into_stream(), request).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::StartNetworkRule { reply, .. }) | Some(SessionControl::StopNetworkRule { reply, .. }) => {
                    let _ = reply.send(Err(SessionControlError::NetworkUnavailable));
                }
                Some(SessionControl::RunGit { reply, .. }) => {
                    let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                }
                Some(SessionControl::RunGitCommitFiles { reply, .. }) => {
                    let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                }
                None => {
                    entry.transition(SessionState::Closing);
                }
            },
            message = terminal_read.wait() => match message {
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    (request.terminal_output)(data.to_vec());
                }
                Some(ChannelMsg::Eof | ChannelMsg::Close) | None => {
                    entry.transition(SessionState::Closing);
                }
                _ => {}
            }
        }
    }
    let _ = terminal_write.eof().await;
    let _ = terminal_write.close().await;
    let clipboard_directories = entry.clipboard_directories();
    if !clipboard_directories.is_empty()
        && let Ok(channel) = handle.channel_open_session().await
        && channel.request_subsystem(true, "sftp").await.is_ok()
    {
        cleanup_clipboard_directories(channel.into_stream(), clipboard_directories).await;
    }
    let _ = handle
        .disconnect(Disconnect::ByApplication, "session closed", "en")
        .await;
    disconnect_handles(&mut upstream_handles).await;
    entry.transition(SessionState::Closed);
}
