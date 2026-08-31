use super::super::git as client_git;
use super::*;

pub(super) async fn run_git_session(
    entry: &Arc<SessionEntry>,
    handle: &mut client::Handle<ClientHandler>,
    cancel: &mut oneshot::Receiver<()>,
    controls: &mut mpsc::Receiver<SessionControl>,
) {
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut *cancel => { entry.transition(SessionState::Closing); }
            control = controls.recv() => match control {
                Some(SessionControl::RunGit { action, reply }) => {
                    let operation = client_git::run_remote_git_action(handle, action);
                    tokio::select! {
                        result = operation => { let _ = reply.send(result); }
                        _ = &mut *cancel => {
                            let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                            entry.transition(SessionState::Closing);
                        }
                    }
                }
                Some(SessionControl::RunGitCommitFiles { repository, oid, reply }) => {
                    let operation = client_git::commit_files(handle, &repository, &oid);
                    tokio::select! {
                        result = operation => { let _ = reply.send(result); }
                        _ = &mut *cancel => {
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
}
