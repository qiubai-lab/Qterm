use super::*;

pub(super) async fn run_files_session(
    entry: &Arc<SessionEntry>,
    handle: &mut client::Handle<ClientHandler>,
    cancel: &mut oneshot::Receiver<()>,
    controls: &mut mpsc::Receiver<SessionControl>,
) {
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut *cancel => {
                entry.transition(SessionState::Closing);
            }
            control = controls.recv() => match control {
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
}
