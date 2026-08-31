use super::*;

pub(in super::super) async fn run_terminal_staging<S>(
    stream: S,
    session_token: &str,
    sources: Vec<StagingSourceEntry>,
    registered_directories: &HashSet<String>,
    events: TerminalStagingSink,
    mut cancel: oneshot::Receiver<()>,
) -> Option<String>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let cleanup_paths = sources
        .iter()
        .filter(|source| source.cleanup_after)
        .map(|source| source.path.clone())
        .collect::<Vec<_>>();
    if Uuid::parse_str(session_token).is_err() {
        events(TerminalStagingEvent::Failed);
        cleanup_local_staging_files(cleanup_paths).await;
        return None;
    }
    let Ok(sftp) = SftpSession::new(stream).await else {
        events(TerminalStagingEvent::Failed);
        cleanup_local_staging_files(cleanup_paths).await;
        return None;
    };
    let result = async {
        let (directory, directory_created) =
            prepare_clipboard_directory(&sftp, session_token, registered_directories).await?;
        events(TerminalStagingEvent::Scanning {
            item_count: sources.len(),
        });
        let scan = scan_terminal_staging_entries(sources, &mut cancel).await;
        let plan = match scan {
            Ok(Some(plan)) => plan,
            Ok(None) => {
                if directory_created {
                    cleanup_one_clipboard_directory(&sftp, &directory, None).await;
                }
                return Ok((directory, StagingUploadOutcome::Cancelled));
            }
            Err(()) => {
                if directory_created {
                    cleanup_one_clipboard_directory(&sftp, &directory, None).await;
                }
                return Err(TerminalStagingError::UploadFailed);
            }
        };
        let upload =
            upload_terminal_staging_entries(&sftp, &directory, plan, &events, &mut cancel).await;
        if !matches!(upload, Ok(StagingUploadOutcome::Completed(_))) && directory_created {
            cleanup_one_clipboard_directory(&sftp, &directory, None).await;
        }
        upload
            .map(|outcome| (directory, outcome))
            .map_err(|_| TerminalStagingError::UploadFailed)
    }
    .await;
    let _ = sftp.close().await;
    cleanup_local_staging_files(cleanup_paths).await;
    match result {
        Ok((directory, StagingUploadOutcome::Completed(remote_paths))) => {
            events(TerminalStagingEvent::Completed { remote_paths });
            Some(directory)
        }
        Ok((_, StagingUploadOutcome::Cancelled)) => {
            events(TerminalStagingEvent::Cancelled);
            None
        }
        Err(_) => {
            events(TerminalStagingEvent::Failed);
            None
        }
    }
}

enum StagingUploadOutcome {
    Completed(Vec<String>),
    Cancelled,
}

struct TerminalStagingPlan {
    roots: Vec<String>,
    directories: Vec<String>,
    files: Vec<LocalUploadFile>,
    total: u64,
    display_name: String,
    item_count: usize,
}

async fn scan_terminal_staging_entries(
    sources: Vec<StagingSourceEntry>,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<Option<TerminalStagingPlan>, ()> {
    use crate::domain::files::{MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES};

    if sources.is_empty() || sources.len() > 256 {
        return Err(());
    }
    let item_count = sources.len();
    let display_name = if item_count == 1 {
        sources[0].display_name.clone()
    } else {
        format!("{item_count} 个项目")
    };
    let mut roots = Vec::with_capacity(item_count);
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut total = 0_u64;
    let mut stack = Vec::new();
    for source in sources {
        if cancel.try_recv().is_ok() {
            return Ok(None);
        }
        let metadata = tokio::fs::symlink_metadata(&source.path)
            .await
            .map_err(|_| ())?;
        if metadata.file_type().is_symlink() {
            return Err(());
        }
        let id = Uuid::new_v4().to_string();
        let root = if metadata.is_file() {
            source
                .extension
                .as_deref()
                .filter(|extension| {
                    !extension.is_empty()
                        && extension.len() <= 16
                        && extension
                            .chars()
                            .all(|character| character.is_ascii_alphanumeric())
                })
                .map_or(id.clone(), |extension| format!("{id}.{extension}"))
        } else {
            id
        };
        roots.push(root.clone());
        if metadata.is_dir() {
            directories.push(root.clone());
            stack.push((source.path, root, 0_usize));
        } else if metadata.is_file() {
            total = total.checked_add(metadata.len()).ok_or(())?;
            files.push(LocalUploadFile {
                local_path: source.path,
                remote_relative_path: root,
                size: metadata.len(),
            });
        } else {
            return Err(());
        }
    }
    while let Some((local_directory, remote_relative, depth)) = stack.pop() {
        if cancel.try_recv().is_ok() {
            return Ok(None);
        }
        if depth >= MAX_RECURSIVE_FILE_DEPTH {
            return Err(());
        }
        let mut children = tokio::fs::read_dir(local_directory).await.map_err(|_| ())?;
        while let Some(child) = children.next_entry().await.map_err(|_| ())? {
            if cancel.try_recv().is_ok() {
                return Ok(None);
            }
            if directories.len().saturating_add(files.len()) >= MAX_RECURSIVE_FILE_ENTRIES {
                return Err(());
            }
            let name = child
                .file_name()
                .to_str()
                .filter(|name| safe_remote_component(name))
                .ok_or(())?
                .to_owned();
            let child_relative = format!("{remote_relative}/{name}");
            let metadata = tokio::fs::symlink_metadata(child.path())
                .await
                .map_err(|_| ())?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                directories.push(child_relative.clone());
                stack.push((child.path(), child_relative, depth + 1));
            } else if metadata.is_file() {
                total = total.checked_add(metadata.len()).ok_or(())?;
                files.push(LocalUploadFile {
                    local_path: child.path(),
                    remote_relative_path: child_relative,
                    size: metadata.len(),
                });
            } else {
                return Err(());
            }
        }
    }
    Ok(Some(TerminalStagingPlan {
        roots,
        directories,
        files,
        total,
        display_name,
        item_count,
    }))
}

async fn upload_terminal_staging_entries(
    sftp: &SftpSession,
    directory: &str,
    plan: TerminalStagingPlan,
    events: &TerminalStagingSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<StagingUploadOutcome, ()> {
    for root in &plan.roots {
        if sftp
            .try_exists(&remote_child_path(directory, root)?)
            .await
            .map_err(|_| ())?
        {
            return Err(());
        }
    }
    let created_roots = plan
        .roots
        .iter()
        .map(|root| remote_child_path(directory, root))
        .collect::<Result<Vec<_>, _>>()?;
    let result = async {
        for relative in &plan.directories {
            let target = remote_child_path(directory, relative)?;
            sftp.create_dir(&target).await.map_err(|_| ())?;
            sftp.set_metadata(
                &target,
                FileAttributes {
                    permissions: Some(STAGING_DIRECTORY_MODE),
                    ..FileAttributes::default()
                },
            )
            .await
            .map_err(|_| ())?;
        }
        events(TerminalStagingEvent::Started {
            total_bytes: plan.total,
            item_count: plan.item_count,
            display_name: plan.display_name,
        });
        let mut completed = 0_u64;
        for file in plan.files {
            let target = remote_child_path(directory, &file.remote_relative_path)?;
            let parent = target
                .rsplit_once('/')
                .map_or(directory, |(parent, _)| parent);
            let temporary = format!("{parent}/.{}.part", Uuid::new_v4());
            let mut source = tokio::fs::File::open(&file.local_path)
                .await
                .map_err(|_| ())?;
            let mut destination = sftp
                .open_with_flags_and_attributes(
                    &temporary,
                    russh_sftp::protocol::OpenFlags::CREATE
                        | russh_sftp::protocol::OpenFlags::EXCLUDE
                        | russh_sftp::protocol::OpenFlags::WRITE,
                    FileAttributes {
                        permissions: Some(STAGING_FILE_MODE),
                        ..FileAttributes::default()
                    },
                )
                .await
                .map_err(|_| ())?;
            let copied = copy_terminal_staging_with_progress(
                &mut source,
                &mut destination,
                completed,
                plan.total,
                events,
                cancel,
            )
            .await;
            match copied {
                Ok(StagingUploadOutcome::Completed(_)) => {
                    destination.shutdown().await.map_err(|_| ())?;
                    sftp.rename(&temporary, &target).await.map_err(|_| ())?;
                    completed = completed.checked_add(file.size).ok_or(())?;
                }
                Ok(StagingUploadOutcome::Cancelled) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Ok(StagingUploadOutcome::Cancelled);
                }
                Err(()) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Err(());
                }
            }
        }
        Ok(StagingUploadOutcome::Completed(created_roots.clone()))
    }
    .await;
    if !matches!(result, Ok(StagingUploadOutcome::Completed(_))) {
        for root in created_roots.iter().rev() {
            let _ = delete_remote_entry(sftp, root).await;
        }
    }
    result
}

async fn copy_terminal_staging_with_progress<R, W>(
    source: &mut R,
    destination: &mut W,
    completed: u64,
    total: u64,
    events: &TerminalStagingSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<StagingUploadOutcome, ()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut current = 0_u64;
    loop {
        let read = tokio::select! {
            _ = &mut *cancel => return Ok(StagingUploadOutcome::Cancelled),
            result = source.read(&mut buffer) => result.map_err(|_| ())?,
        };
        if read == 0 {
            return Ok(StagingUploadOutcome::Completed(Vec::new()));
        }
        destination
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ())?;
        current = current.checked_add(read as u64).ok_or(())?;
        events(TerminalStagingEvent::Progress {
            transferred_bytes: completed.saturating_add(current),
            total_bytes: total,
        });
    }
}

async fn cleanup_local_staging_files(paths: Vec<PathBuf>) {
    for path in paths {
        let _ = tokio::fs::remove_file(path).await;
    }
}

async fn prepare_clipboard_directory(
    sftp: &SftpSession,
    session_token: &str,
    registered_directories: &HashSet<String>,
) -> Result<(String, bool), TerminalStagingError> {
    let preferred = format!("/tmp/.qterm-clipboard-{session_token}");
    if let Ok(created) = prepare_private_directory(
        sftp,
        &preferred,
        registered_directories.contains(&preferred),
    )
    .await
    {
        return Ok((preferred, created));
    }

    let home = sftp
        .canonicalize(".")
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    if !home.starts_with('/') {
        return Err(TerminalStagingError::TemporaryDirectoryUnavailable);
    }
    let home_metadata = sftp
        .symlink_metadata(&home)
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    if !home_metadata.is_dir() || home_metadata.is_symlink() {
        return Err(TerminalStagingError::TemporaryDirectoryUnavailable);
    }
    let cache = remote_child(&home, ".cache");
    ensure_directory(sftp, &cache, home_metadata.uid, false).await?;
    let qterm = remote_child(&cache, "qterm");
    ensure_directory(sftp, &qterm, home_metadata.uid, true).await?;
    let clipboard = remote_child(&qterm, "clipboard");
    ensure_directory(sftp, &clipboard, home_metadata.uid, true).await?;
    cleanup_expired_home_directories(sftp, &clipboard, home_metadata.uid).await;
    let fallback = remote_child(&clipboard, session_token);
    let created =
        prepare_private_directory(sftp, &fallback, registered_directories.contains(&fallback))
            .await?;
    Ok((fallback, created))
}

async fn prepare_private_directory(
    sftp: &SftpSession,
    path: &str,
    registered: bool,
) -> Result<bool, TerminalStagingError> {
    let exists = sftp
        .try_exists(path)
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    if exists && !registered {
        return Err(TerminalStagingError::TemporaryDirectoryUnavailable);
    }
    let created = !exists;
    if created {
        sftp.create_dir(path)
            .await
            .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    }
    let outcome = async {
        sftp.set_metadata(
            path,
            FileAttributes {
                permissions: Some(STAGING_DIRECTORY_MODE),
                ..FileAttributes::default()
            },
        )
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
        let metadata = sftp
            .symlink_metadata(path)
            .await
            .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
        if !metadata.is_dir()
            || metadata.is_symlink()
            || metadata.permissions.map(|mode| mode & 0o777) != Some(STAGING_DIRECTORY_MODE)
        {
            return Err(TerminalStagingError::TemporaryDirectoryUnavailable);
        }
        Ok(created)
    }
    .await;
    if outcome.is_err() && created {
        let _ = sftp.remove_dir(path).await;
    }
    outcome
}

async fn ensure_directory(
    sftp: &SftpSession,
    path: &str,
    expected_uid: Option<u32>,
    private: bool,
) -> Result<(), TerminalStagingError> {
    if !sftp
        .try_exists(path)
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?
    {
        sftp.create_dir(path)
            .await
            .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    }
    let metadata = sftp
        .symlink_metadata(path)
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    if !metadata.is_dir()
        || metadata.is_symlink()
        || (expected_uid.is_some() && metadata.uid != expected_uid)
    {
        return Err(TerminalStagingError::TemporaryDirectoryUnavailable);
    }
    if private {
        sftp.set_metadata(
            path,
            FileAttributes {
                permissions: Some(STAGING_DIRECTORY_MODE),
                ..FileAttributes::default()
            },
        )
        .await
        .map_err(|_| TerminalStagingError::TemporaryDirectoryUnavailable)?;
    }
    Ok(())
}

async fn cleanup_expired_home_directories(
    sftp: &SftpSession,
    parent: &str,
    expected_uid: Option<u32>,
) {
    let Ok(entries) = sftp.read_dir(parent).await else {
        return;
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    for entry in entries {
        let name = entry.file_name();
        let metadata = entry.metadata();
        let expired = metadata
            .mtime
            .map(u64::from)
            .is_some_and(|modified| staging_directory_expired(now, modified));
        if Uuid::parse_str(&name).is_ok()
            && expired
            && metadata.is_dir()
            && !metadata.is_symlink()
            && (expected_uid.is_none() || metadata.uid == expected_uid)
        {
            cleanup_one_clipboard_directory(sftp, &entry.path(), expected_uid).await;
        }
    }
}

pub(in super::super) async fn cleanup_clipboard_directories<S>(
    stream: S,
    directories: HashSet<String>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let Ok(sftp) = SftpSession::new(stream).await else {
        return;
    };
    for directory in directories {
        cleanup_one_clipboard_directory(&sftp, &directory, None).await;
    }
    let _ = sftp.close().await;
}

async fn cleanup_one_clipboard_directory(
    sftp: &SftpSession,
    directory: &str,
    expected_uid: Option<u32>,
) {
    let Ok(metadata) = sftp.symlink_metadata(directory).await else {
        return;
    };
    if !metadata.is_dir()
        || metadata.is_symlink()
        || (expected_uid.is_some() && metadata.uid != expected_uid)
    {
        return;
    }
    let Ok(entries) = sftp.read_dir(directory).await else {
        return;
    };
    for entry in entries {
        let metadata = entry.metadata();
        let name = entry.file_name();
        if safe_staging_entry_name(&name)
            && (expected_uid.is_none() || metadata.uid == expected_uid)
        {
            if metadata.is_dir() && !metadata.is_symlink() {
                let _ = delete_remote_entry(sftp, &entry.path()).await;
            } else if metadata.is_regular() || metadata.is_symlink() {
                let _ = sftp.remove_file(entry.path()).await;
            }
        }
    }
    if sftp
        .read_dir(directory)
        .await
        .is_ok_and(|mut remaining| remaining.next().is_none())
    {
        let _ = sftp.remove_dir(directory).await;
    }
}

fn remote_child(parent: &str, child: &str) -> String {
    if parent == "/" {
        format!("/{child}")
    } else {
        format!("{}/{child}", parent.trim_end_matches('/'))
    }
}

fn staging_directory_expired(now: u64, modified: u64) -> bool {
    now.saturating_sub(modified) > STAGING_HOME_TTL_SECS
}

fn safe_staging_entry_name(name: &str) -> bool {
    if let Some(stem) = name
        .strip_prefix('.')
        .and_then(|value| value.strip_suffix(".part"))
    {
        return Uuid::parse_str(stem).is_ok();
    }
    let (stem, extension) = name.split_once('.').unwrap_or((name, ""));
    Uuid::parse_str(stem).is_ok()
        && (extension.is_empty()
            || (extension.len() <= 16
                && extension
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_accepts_only_qterm_uuid_staging_names() {
        let id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        assert!(safe_staging_entry_name(id));
        assert!(safe_staging_entry_name(&format!("{id}.png")));
        assert!(safe_staging_entry_name(&format!(".{id}.part")));
        assert!(!safe_staging_entry_name("image.png"));
        assert!(!safe_staging_entry_name(&format!("{id}.tar.gz")));
        assert!(!safe_staging_entry_name(&format!("../{id}.png")));
    }

    #[test]
    fn home_cleanup_keeps_the_exact_ttl_boundary() {
        assert!(!staging_directory_expired(STAGING_HOME_TTL_SECS, 0));
        assert!(!staging_directory_expired(STAGING_HOME_TTL_SECS - 1, 0));
        assert!(staging_directory_expired(STAGING_HOME_TTL_SECS + 1, 0));
    }

    #[test]
    fn remote_children_preserve_an_absolute_root() {
        assert_eq!(remote_child("/", ".cache"), "/.cache");
        assert_eq!(remote_child("/home/dev/", ".cache"), "/home/dev/.cache");
    }

    #[tokio::test]
    async fn staging_scan_honors_cancellation_before_local_io() {
        let directory = tempfile::tempdir().expect("tempdir");
        let source = directory.path().join("archive.bin");
        std::fs::write(&source, b"payload").expect("fixture");
        let (cancel_sender, mut cancel) = oneshot::channel();
        cancel_sender.send(()).expect("cancel");
        let result = scan_terminal_staging_entries(
            vec![StagingSourceEntry {
                path: source,
                display_name: "archive.bin".into(),
                extension: Some("bin".into()),
                cleanup_after: false,
            }],
            &mut cancel,
        )
        .await
        .expect("scan");
        assert!(result.is_none());
    }
}
