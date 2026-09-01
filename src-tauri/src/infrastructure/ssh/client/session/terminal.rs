use super::*;

pub(super) async fn run_terminal_session(
    entry: &Arc<SessionEntry>,
    handle: &mut client::Handle<ClientHandler>,
    shell_cache: &crate::infrastructure::persistence::json_remote_shell_cache::JsonRemoteShellCache,
    shell_target: Option<crate::domain::shell_integration::RemoteShellTarget>,
    request: SessionConnectRequest,
    cancel: &mut oneshot::Receiver<()>,
    controls: &mut mpsc::Receiver<SessionControl>,
) -> bool {
    let remote_shell = match shell_target.as_ref() {
        Some(target) => shell_integration::resolve_remote_shell(handle, shell_cache, target).await,
        None => None,
    };

    let terminal = match handle.channel_open_session().await {
        Ok(channel) => channel,
        Err(_) => {
            entry.fail(SessionFailure::ConnectionFailed);
            let _ = handle
                .disconnect(Disconnect::ByApplication, "session failed", "en")
                .await;
            return false;
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
        return false;
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
        return false;
    }
    let (mut terminal_read, terminal_write) = terminal.split();
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut *cancel => {
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
                            let clipboard_entry = Arc::clone(entry);
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
                            let transfer_entry = Arc::clone(entry);
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
                Some(SessionControl::RunGitCommitFileDiff { reply, .. }) => {
                    let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                }
                Some(SessionControl::RunGitConflictDetail { reply, .. }) => {
                    let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                }
                Some(SessionControl::RunGitChangeDiff { reply, .. }) => {
                    let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                }
                Some(SessionControl::RunGitResolveConflict { reply, .. }) => {
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
    true
}
