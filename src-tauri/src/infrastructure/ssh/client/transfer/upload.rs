use super::*;

pub(super) enum TransferOutcome {
    Completed,
    Cancelled,
}

pub(in super::super) struct LocalUploadFile {
    pub(super) local_path: PathBuf,
    pub(super) remote_relative_path: String,
    pub(super) size: u64,
}

pub(in super::super) struct LocalUploadPlan {
    pub(in super::super) roots: Vec<String>,
    pub(in super::super) directories: Vec<String>,
    pub(in super::super) files: Vec<LocalUploadFile>,
    pub(in super::super) total: u64,
}

pub(super) async fn upload_entries(
    sftp: &SftpSession,
    local_paths: Vec<PathBuf>,
    remote_directory: RemotePath,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let Some(plan) = scan_local_upload_entries(local_paths, cancel).await? else {
        return Ok(TransferOutcome::Cancelled);
    };
    for root in &plan.roots {
        let target = remote_child_path(remote_directory.as_str(), root)?;
        if sftp.try_exists(&target).await.map_err(|_| ())? {
            return Err(());
        }
    }
    let mut created_roots = Vec::new();
    let result = async {
        for root in &plan.roots {
            created_roots.push(remote_child_path(remote_directory.as_str(), root)?);
        }
        for directory in &plan.directories {
            sftp.create_dir(remote_child_path(remote_directory.as_str(), directory)?)
                .await
                .map_err(|_| ())?;
        }
        events(TransferEvent::Started {
            total_bytes: plan.total,
        });
        let mut completed = 0_u64;
        for file in plan.files {
            let target = remote_child_path(remote_directory.as_str(), &file.remote_relative_path)?;
            let temporary = format!("{target}.terminal-demo-{}.part", Uuid::new_v4());
            let mut source = tokio::fs::File::open(&file.local_path)
                .await
                .map_err(|_| ())?;
            let mut destination = sftp.create(&temporary).await.map_err(|_| ())?;
            let outcome = copy_with_aggregate(
                &mut source,
                &mut destination,
                completed,
                plan.total,
                events,
                cancel,
            )
            .await;
            match outcome {
                Ok(TransferOutcome::Completed) => {
                    destination.shutdown().await.map_err(|_| ())?;
                    sftp.rename(&temporary, &target).await.map_err(|_| ())?;
                    completed = completed.saturating_add(file.size);
                }
                Ok(TransferOutcome::Cancelled) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Ok(TransferOutcome::Cancelled);
                }
                Err(()) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Err(());
                }
            }
        }
        Ok(TransferOutcome::Completed)
    }
    .await;
    if !matches!(result, Ok(TransferOutcome::Completed)) {
        for root in created_roots.into_iter().rev() {
            let _ = delete_remote_entry(sftp, &root).await;
        }
    }
    result
}

pub(in super::super) async fn scan_local_upload_entries(
    local_paths: Vec<PathBuf>,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<Option<LocalUploadPlan>, ()> {
    use crate::domain::files::{MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES};

    let mut roots = Vec::new();
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut total = 0_u64;
    let mut stack = Vec::new();
    for local_path in local_paths {
        let name = local_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| safe_remote_component(name))
            .ok_or(())?
            .to_owned();
        if roots.contains(&name) {
            return Err(());
        }
        let metadata = tokio::fs::symlink_metadata(&local_path)
            .await
            .map_err(|_| ())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        roots.push(name.clone());
        if metadata.is_dir() {
            directories.push(name.clone());
            stack.push((local_path, name, 0_usize));
        } else if metadata.is_file() {
            total = total.saturating_add(metadata.len());
            files.push(LocalUploadFile {
                local_path,
                remote_relative_path: name,
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
                total = total.saturating_add(metadata.len());
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
    Ok(Some(LocalUploadPlan {
        roots,
        directories,
        files,
        total,
    }))
}

pub(super) fn remote_child_path(parent: &str, child: &str) -> Result<String, ()> {
    if child
        .split('/')
        .any(|component| !safe_remote_component(component))
    {
        return Err(());
    }
    Ok(if parent == "/" {
        format!("/{child}")
    } else {
        format!("{}/{child}", parent.trim_end_matches('/'))
    })
}

pub(super) fn safe_remote_component(name: &str) -> bool {
    !name.trim().is_empty()
        && name != "."
        && name != ".."
        && name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && !name.chars().any(char::is_control)
}

pub(super) async fn upload_file(
    sftp: &SftpSession,
    local_path: PathBuf,
    remote_path: RemotePath,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let total = tokio::fs::metadata(&local_path)
        .await
        .map_err(|_| ())?
        .len();
    let mut source = tokio::fs::File::open(local_path).await.map_err(|_| ())?;
    if sftp
        .try_exists(remote_path.as_str())
        .await
        .map_err(|_| ())?
    {
        return Err(());
    }
    let temporary_path = format!("{}.terminal-demo.part", remote_path.as_str());
    let mut destination = sftp.create(temporary_path.clone()).await.map_err(|_| ())?;
    events(TransferEvent::Started { total_bytes: total });
    let outcome = copy_with_progress(&mut source, &mut destination, total, events, cancel).await;
    match outcome {
        Ok(TransferOutcome::Completed) => {
            destination.shutdown().await.map_err(|_| ())?;
            sftp.rename(temporary_path.clone(), remote_path.as_str())
                .await
                .map_err(|_| ())?;
            Ok(TransferOutcome::Completed)
        }
        Ok(TransferOutcome::Cancelled) => {
            drop(destination);
            let _ = sftp.remove_file(temporary_path).await;
            Ok(TransferOutcome::Cancelled)
        }
        Err(()) => {
            drop(destination);
            let _ = sftp.remove_file(temporary_path).await;
            Err(())
        }
    }
}

pub(super) async fn download_file(
    sftp: &SftpSession,
    remote_path: RemotePath,
    local_path: PathBuf,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let mut source = sftp.open(remote_path.as_str()).await.map_err(|_| ())?;
    let total = source.metadata().await.map_err(|_| ())?.size.unwrap_or(0);
    let temporary_path = local_path.with_extension(format!(
        "{}.terminal-demo.part",
        local_path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
    ));
    let mut destination = tokio::fs::File::create(&temporary_path)
        .await
        .map_err(|_| ())?;
    events(TransferEvent::Started { total_bytes: total });
    let outcome = copy_with_progress(&mut source, &mut destination, total, events, cancel).await;
    match outcome {
        Ok(TransferOutcome::Completed) => {
            destination.flush().await.map_err(|_| ())?;
            drop(destination);
            tokio::fs::rename(&temporary_path, local_path)
                .await
                .map_err(|_| ())?;
            Ok(TransferOutcome::Completed)
        }
        Ok(TransferOutcome::Cancelled) => {
            drop(destination);
            let _ = tokio::fs::remove_file(temporary_path).await;
            Ok(TransferOutcome::Cancelled)
        }
        Err(()) => {
            drop(destination);
            let _ = tokio::fs::remove_file(temporary_path).await;
            Err(())
        }
    }
}

struct RemoteDownloadFile {
    remote_path: String,
    relative_path: PathBuf,
    size: u64,
}

pub(super) async fn download_directory(
    sftp: &SftpSession,
    remote_path: RemotePath,
    local_path: PathBuf,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    if tokio::fs::try_exists(&local_path).await.map_err(|_| ())? {
        return Err(());
    }
    let Some((directories, files, total)) =
        scan_remote_directory(sftp, remote_path.as_str(), cancel).await?
    else {
        return Ok(TransferOutcome::Cancelled);
    };
    tokio::fs::create_dir(&local_path).await.map_err(|_| ())?;
    let result = async {
        for directory in directories {
            tokio::fs::create_dir_all(local_path.join(directory))
                .await
                .map_err(|_| ())?;
        }
        events(TransferEvent::Started { total_bytes: total });
        let mut completed = 0_u64;
        for file in files {
            let target = local_path.join(&file.relative_path);
            let file_name = target
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or(())?;
            let temporary = target.with_file_name(format!("{file_name}.terminal-demo.part"));
            let mut source = sftp.open(&file.remote_path).await.map_err(|_| ())?;
            let mut destination = tokio::fs::File::create(&temporary).await.map_err(|_| ())?;
            match copy_with_aggregate(
                &mut source,
                &mut destination,
                completed,
                total,
                events,
                cancel,
            )
            .await?
            {
                TransferOutcome::Completed => {
                    destination.flush().await.map_err(|_| ())?;
                    drop(destination);
                    tokio::fs::rename(&temporary, &target)
                        .await
                        .map_err(|_| ())?;
                    completed = completed.saturating_add(file.size);
                }
                TransferOutcome::Cancelled => {
                    drop(destination);
                    let _ = tokio::fs::remove_file(temporary).await;
                    return Ok(TransferOutcome::Cancelled);
                }
            }
        }
        Ok(TransferOutcome::Completed)
    }
    .await;
    if !matches!(result, Ok(TransferOutcome::Completed)) {
        let _ = tokio::fs::remove_dir_all(&local_path).await;
    }
    result
}

async fn scan_remote_directory(
    sftp: &SftpSession,
    root: &str,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<Option<(Vec<PathBuf>, Vec<RemoteDownloadFile>, u64)>, ()> {
    let metadata = sftp.symlink_metadata(root).await.map_err(|_| ())?;
    if !metadata.is_dir() || metadata.is_symlink() {
        return Err(());
    }
    let mut stack = vec![(root.to_owned(), PathBuf::new())];
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut total = 0_u64;
    while let Some((remote_directory, relative_directory)) = stack.pop() {
        if cancel.try_recv().is_ok() {
            return Ok(None);
        }
        let entries = sftp.read_dir(&remote_directory).await.map_err(|_| ())?;
        for entry in entries {
            let name = entry.file_name();
            if name.is_empty()
                || name == "."
                || name == ".."
                || Path::new(&name).components().count() != 1
            {
                return Err(());
            }
            let metadata = entry.metadata();
            if metadata.is_symlink() {
                continue;
            }
            let relative_path = relative_directory.join(&name);
            if relative_path.components().count() > MAX_DIRECTORY_DOWNLOAD_DEPTH
                || directories.len().saturating_add(files.len()) >= MAX_DIRECTORY_DOWNLOAD_ENTRIES
            {
                return Err(());
            }
            if metadata.is_dir() {
                directories.push(relative_path.clone());
                stack.push((entry.path(), relative_path));
            } else if metadata.is_regular() {
                total = total.saturating_add(metadata.len());
                files.push(RemoteDownloadFile {
                    remote_path: entry.path(),
                    relative_path,
                    size: metadata.len(),
                });
            }
        }
    }
    Ok(Some((directories, files, total)))
}

async fn copy_with_aggregate<R, W>(
    source: &mut R,
    destination: &mut W,
    completed: u64,
    total: u64,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut current = 0_u64;
    loop {
        let read = tokio::select! {
            _ = &mut *cancel => return Ok(TransferOutcome::Cancelled),
            result = source.read(&mut buffer) => result.map_err(|_| ())?,
        };
        if read == 0 {
            return Ok(TransferOutcome::Completed);
        }
        destination
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ())?;
        current += read as u64;
        events(TransferEvent::Progress {
            transferred_bytes: completed.saturating_add(current),
            total_bytes: total,
        });
    }
}

async fn copy_with_progress<R, W>(
    source: &mut R,
    destination: &mut W,
    total: u64,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut transferred = 0_u64;
    loop {
        let read = tokio::select! {
            _ = &mut *cancel => return Ok(TransferOutcome::Cancelled),
            result = source.read(&mut buffer) => result.map_err(|_| ())?,
        };
        if read == 0 {
            return Ok(TransferOutcome::Completed);
        }
        destination
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ())?;
        transferred += read as u64;
        events(TransferEvent::Progress {
            transferred_bytes: transferred,
            total_bytes: total,
        });
    }
}
