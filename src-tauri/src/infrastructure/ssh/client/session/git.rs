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
                Some(SessionControl::RunGitCommitFileDiff { repository, oid, path, reply }) => {
                    let operation = client_git::commit_file_diff(handle, &repository, &oid, &path);
                    tokio::select! {
                        result = operation => { let _ = reply.send(result); }
                        _ = &mut *cancel => {
                            let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                            entry.transition(SessionState::Closing);
                        }
                    }
                }
                Some(SessionControl::RunGitConflictDetail { repository, path, reply }) => {
                    let operation = load_conflict_detail(handle, &repository, &path);
                    tokio::select! {
                        result = operation => { let _ = reply.send(result); }
                        _ = &mut *cancel => {
                            let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                            entry.transition(SessionState::Closing);
                        }
                    }
                }
                Some(SessionControl::RunGitChangeDiff { repository, path, staged, reply }) => {
                    let operation = load_change_diff(handle, &repository, &path, staged);
                    tokio::select! {
                        result = operation => { let _ = reply.send(result); }
                        _ = &mut *cancel => {
                            let _ = reply.send(Err(crate::domain::git::GitError::SessionUnavailable));
                            entry.transition(SessionState::Closing);
                        }
                    }
                }
                Some(SessionControl::RunGitResolveConflict { repository, path, resolution, reply }) => {
                    let operation = resolve_conflict(handle, &repository, &path, &resolution);
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

async fn load_conflict_detail(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<crate::domain::git::GitConflictDetail, crate::domain::git::GitError> {
    let result = read_conflict_result(handle, repository, path).await?;
    client_git::conflict_detail(handle, repository, path, result).await
}

async fn load_change_diff(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    staged: bool,
) -> Result<crate::domain::git::GitChangeDiff, crate::domain::git::GitError> {
    let worktree = if staged {
        None
    } else {
        Some(read_change_worktree_version(handle, repository, path).await?)
    };
    client_git::change_diff(handle, repository, path, staged, worktree).await
}

async fn resolve_conflict(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
    resolution: &crate::domain::git::GitConflictResolution,
) -> Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError> {
    if let crate::domain::git::GitConflictResolution::SaveText {
        content,
        expected_revision,
    } = resolution
    {
        let detail = load_conflict_detail(handle, repository, path).await?;
        if !detail.editable || detail.result.revision != *expected_revision {
            return Err(crate::domain::git::GitError::Conflict(
                "冲突文件已在外部变化，请重新加载".into(),
            ));
        }
        let remote_path = conflict_remote_path(repository, path)?;
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
        write_remote_text_file(
            channel.into_stream(),
            remote_path,
            content.clone(),
            expected_revision.clone(),
        )
        .await
        .map_err(map_file_error)?;
        return client_git::resolve_conflict(
            handle,
            repository,
            path,
            &crate::domain::git::GitConflictResolution::MarkResolved,
        )
        .await;
    }
    if matches!(
        resolution,
        crate::domain::git::GitConflictResolution::MarkResolved
    ) {
        let detail = load_conflict_detail(handle, repository, path).await?;
        if detail.result.kind == crate::domain::git::GitConflictContentKind::Missing {
            return Err(crate::domain::git::GitError::Conflict(
                "结果文件不存在，请选择删除结果".into(),
            ));
        }
    }
    client_git::resolve_conflict(handle, repository, path, resolution).await
}

async fn read_conflict_result(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<crate::domain::git::GitConflictResult, crate::domain::git::GitError> {
    let remote_path = conflict_remote_path(repository, path)?;
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
    match read_remote_file(
        channel.into_stream(),
        remote_path,
        crate::domain::git::MAX_CONFLICT_TEXT_BYTES as u64,
    )
    .await
    {
        Ok(document) => {
            let content = std::str::from_utf8(&document.bytes)
                .ok()
                .filter(|_| !document.bytes.contains(&0))
                .map(str::to_owned);
            Ok(crate::domain::git::GitConflictResult {
                kind: if content.is_some() {
                    crate::domain::git::GitConflictContentKind::Text
                } else {
                    crate::domain::git::GitConflictContentKind::Binary
                },
                content,
                revision: document.revision,
                size: document.bytes.len() as u64,
                mode: Some(0o100644),
            })
        }
        Err(SessionControlError::FileTooLarge) => Ok(crate::domain::git::GitConflictResult {
            kind: crate::domain::git::GitConflictContentKind::Unsupported,
            content: None,
            revision: "oversize".into(),
            size: 0,
            mode: Some(0o100644),
        }),
        Err(SessionControlError::FileUnavailable) => Ok(crate::domain::git::GitConflictResult {
            kind: crate::domain::git::GitConflictContentKind::Missing,
            content: None,
            revision: "missing".into(),
            size: 0,
            mode: None,
        }),
        Err(error) => Err(map_file_error(error)),
    }
}

fn conflict_remote_path(
    repository: &str,
    path: &str,
) -> Result<RemotePath, crate::domain::git::GitError> {
    crate::domain::git::validate_remote_repository_path(repository)?;
    crate::domain::git::validate_posix_paths(&[path.to_owned()])?;
    RemotePath::new(format!("{}/{}", repository.trim_end_matches('/'), path))
        .map_err(|_| crate::domain::git::GitError::InvalidPath)
}

async fn read_change_worktree_version(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    path: &str,
) -> Result<crate::domain::git::GitConflictVersion, crate::domain::git::GitError> {
    let remote_path = conflict_remote_path(repository, path)?;
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|_| crate::domain::git::GitError::SessionUnavailable)?;
    match read_remote_file(
        channel.into_stream(),
        remote_path,
        crate::domain::git::MAX_GIT_DIFF_TEXT_BYTES as u64,
    )
    .await
    {
        Ok(document) => {
            let content = std::str::from_utf8(&document.bytes)
                .ok()
                .filter(|_| !document.bytes.contains(&0))
                .map(str::to_owned);
            Ok(crate::domain::git::GitConflictVersion {
                kind: if content.is_some() {
                    crate::domain::git::GitConflictContentKind::Text
                } else {
                    crate::domain::git::GitConflictContentKind::Binary
                },
                content,
                size: document.bytes.len() as u64,
                mode: Some(0o100644),
            })
        }
        Err(SessionControlError::FileTooLarge) => Ok(crate::domain::git::GitConflictVersion {
            kind: crate::domain::git::GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(0o100644),
        }),
        Err(SessionControlError::FileUnavailable) => Ok(crate::domain::git::GitConflictVersion {
            kind: crate::domain::git::GitConflictContentKind::Missing,
            content: None,
            size: 0,
            mode: None,
        }),
        Err(error) => Err(map_file_error(error)),
    }
}

fn map_file_error(error: SessionControlError) -> crate::domain::git::GitError {
    match error {
        SessionControlError::FileConflict => {
            crate::domain::git::GitError::Conflict("冲突文件已在外部变化，请重新加载".into())
        }
        SessionControlError::FileTooLarge => crate::domain::git::GitError::OutputTooLarge,
        SessionControlError::SessionNotConnected | SessionControlError::SessionFinished => {
            crate::domain::git::GitError::SessionUnavailable
        }
        _ => crate::domain::git::GitError::Io,
    }
}
