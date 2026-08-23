use super::*;

pub(super) async fn run_transfer<S>(
    stream: S,
    request: TransferRequest,
    events: TransferSink,
    mut cancel: oneshot::Receiver<()>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = match SftpSession::new(stream).await {
        Ok(session) => session,
        Err(_) => {
            events(TransferEvent::Failed);
            return;
        }
    };
    let result = match request {
        TransferRequest::Upload {
            local_path,
            remote_path,
        } => upload_file(&sftp, local_path, remote_path, &events, &mut cancel).await,
        TransferRequest::UploadEntries {
            local_paths,
            remote_directory,
        } => upload_entries(&sftp, local_paths, remote_directory, &events, &mut cancel).await,
        TransferRequest::Download {
            remote_path,
            local_path,
        } => download_file(&sftp, remote_path, local_path, &events, &mut cancel).await,
        TransferRequest::DownloadDirectory {
            remote_path,
            local_path,
        } => download_directory(&sftp, remote_path, local_path, &events, &mut cancel).await,
    };
    match result {
        Ok(TransferOutcome::Completed) => events(TransferEvent::Completed),
        Ok(TransferOutcome::Cancelled) => events(TransferEvent::Cancelled),
        Err(()) => events(TransferEvent::Failed),
    }
    let _ = sftp.close().await;
}

pub(super) async fn list_remote_directory<S>(
    stream: S,
    path: RemotePath,
) -> Result<DirectoryListing, ()>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream).await.map_err(|_| ())?;
    let canonical = sftp.canonicalize(path.as_str()).await.map_err(|_| ())?;
    let directory = sftp.read_dir(canonical.clone()).await.map_err(|_| ())?;
    let entries = directory
        .map(|entry| {
            let metadata = entry.metadata();
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs());
            FileEntry {
                name: entry.file_name(),
                path: entry.path(),
                is_directory: metadata.is_dir(),
                is_symlink: metadata.is_symlink(),
                size: metadata.len(),
                modified_at,
                permission_mode: metadata.permissions.map(|mode| mode & 0o7777),
            }
        })
        .collect();
    let _ = sftp.close().await;
    Ok(DirectoryListing::new(canonical, entries))
}

pub(super) async fn read_remote_file<S>(
    stream: S,
    path: RemotePath,
    limit: u64,
) -> Result<FileDocument, SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let result = read_remote_document(&sftp, path.as_str(), limit).await;
    let _ = sftp.close().await;
    result
}

async fn read_remote_document(
    sftp: &SftpSession,
    path: &str,
    limit: u64,
) -> Result<FileDocument, SessionControlError> {
    let metadata = sftp
        .symlink_metadata(path)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if metadata.len() > limit {
        return Err(SessionControlError::FileTooLarge);
    }
    if !metadata.is_regular() {
        return Err(SessionControlError::FileUnavailable);
    }
    let bytes = sftp
        .read(path)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if bytes.len() as u64 > limit {
        return Err(SessionControlError::FileTooLarge);
    }
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    Ok(FileDocument {
        revision: content_revision(&bytes),
        bytes,
        modified_at,
    })
}

pub(super) async fn write_remote_text_file<S>(
    stream: S,
    path: RemotePath,
    text: String,
    expected_revision: String,
) -> Result<FileDocument, SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    use crate::domain::files::MAX_TEXT_FILE_BYTES;

    if text.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(SessionControlError::FileTooLarge);
    }
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let current = read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await?;
    if current.revision != expected_revision {
        let _ = sftp.close().await;
        return Err(SessionControlError::FileConflict);
    }
    let original_permissions = sftp
        .metadata(path.as_str())
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
        .permissions;
    let suffix = Uuid::new_v4();
    let temporary = format!("{}.terminal-demo-{suffix}.part", path.as_str());
    let backup = format!("{}.terminal-demo-{suffix}.backup", path.as_str());
    let mut temporary_file = match sftp.create(&temporary).await {
        Ok(file) => file,
        Err(_) => {
            let _ = sftp.close().await;
            return Err(SessionControlError::FileUnavailable);
        }
    };
    if original_permissions.is_some()
        && temporary_file
            .set_metadata(FileAttributes {
                permissions: original_permissions,
                ..FileAttributes::default()
            })
            .await
            .is_err()
    {
        let _ = temporary_file.close().await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if temporary_file.write_all(text.as_bytes()).await.is_err() {
        let _ = temporary_file.close().await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if temporary_file.close().await.is_err() {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    let latest = match read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await {
        Ok(document) => document,
        Err(error) => {
            let _ = sftp.remove_file(&temporary).await;
            let _ = sftp.close().await;
            return Err(error);
        }
    };
    if latest.revision != expected_revision {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileConflict);
    }
    if sftp.rename(path.as_str(), &backup).await.is_err() {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if sftp.rename(&temporary, path.as_str()).await.is_err() {
        let _ = sftp.rename(&backup, path.as_str()).await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    let _ = sftp.remove_file(&backup).await;
    let saved = read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await;
    let _ = sftp.close().await;
    saved
}

pub(super) async fn mutate_remote_entry<S>(
    stream: S,
    request: RemoteMutation,
) -> Result<(), SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let result = match request {
        RemoteMutation::Create {
            directory,
            name,
            is_directory,
        } => create_remote_entry(&sftp, directory.as_str(), &name, is_directory).await,
        RemoteMutation::Copy { path, target_name } => {
            copy_remote_file(&sftp, path.as_str(), &target_name).await
        }
        RemoteMutation::Rename { path, target_name } => {
            rename_remote_entry(&sftp, path.as_str(), &target_name).await
        }
        RemoteMutation::Delete { path } => delete_remote_entry(&sftp, path.as_str()).await,
    };
    let _ = sftp.close().await;
    result
}

pub(super) async fn create_remote_entry(
    sftp: &SftpSession,
    directory: &str,
    name: &str,
    is_directory: bool,
) -> Result<(), SessionControlError> {
    let target =
        remote_child_path(directory, name).map_err(|_| SessionControlError::FileUnavailable)?;
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    if is_directory {
        sftp.create_dir(target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    } else {
        sftp.create(target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
            .close()
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    }
}

pub(super) async fn copy_remote_file(
    sftp: &SftpSession,
    source: &str,
    target_name: &str,
) -> Result<(), SessionControlError> {
    let target = remote_sibling_path(source, target_name)?;
    let metadata = sftp
        .symlink_metadata(source)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if !metadata.is_regular() || metadata.is_symlink() {
        return Err(SessionControlError::FileUnavailable);
    }
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    let temporary = format!("{target}.terminal-demo-{}.part", Uuid::new_v4());
    let mut input = sftp
        .open(source)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let mut output = sftp
        .create(&temporary)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let outcome = async {
        if metadata.permissions.is_some() {
            output
                .set_metadata(FileAttributes {
                    permissions: metadata.permissions,
                    ..FileAttributes::default()
                })
                .await
                .map_err(|_| SessionControlError::FileUnavailable)?;
        }
        tokio::io::copy(&mut input, &mut output)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        output
            .shutdown()
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        sftp.rename(&temporary, &target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    }
    .await;
    if outcome.is_err() {
        let _ = output.shutdown().await;
        let _ = sftp.remove_file(&temporary).await;
    }
    outcome
}

pub(super) async fn rename_remote_entry(
    sftp: &SftpSession,
    source: &str,
    target_name: &str,
) -> Result<(), SessionControlError> {
    let target = remote_sibling_path(source, target_name)?;
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    sftp.rename(source, target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)
}

pub(super) async fn delete_remote_entry(
    sftp: &SftpSession,
    root: &str,
) -> Result<(), SessionControlError> {
    use crate::domain::files::{MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES};

    let metadata = sftp
        .symlink_metadata(root)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if !metadata.is_dir() || metadata.is_symlink() {
        return sftp
            .remove_file(root)
            .await
            .map_err(|_| SessionControlError::FileUnavailable);
    }
    let mut stack = vec![(root.to_owned(), 0_usize)];
    let mut directories = Vec::new();
    let mut files = Vec::new();
    while let Some((directory, depth)) = stack.pop() {
        if depth > MAX_RECURSIVE_FILE_DEPTH {
            return Err(SessionControlError::FileUnavailable);
        }
        directories.push(directory.clone());
        let children = sftp
            .read_dir(&directory)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        for child in children {
            if directories.len().saturating_add(files.len()) >= MAX_RECURSIVE_FILE_ENTRIES {
                return Err(SessionControlError::FileUnavailable);
            }
            let metadata = child.metadata();
            if metadata.is_dir() && !metadata.is_symlink() {
                stack.push((child.path(), depth + 1));
            } else {
                files.push(child.path());
            }
        }
    }
    for file in files {
        sftp.remove_file(file)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
    }
    for directory in directories.into_iter().rev() {
        sftp.remove_dir(directory)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
    }
    Ok(())
}

fn remote_sibling_path(source: &str, target_name: &str) -> Result<String, SessionControlError> {
    if target_name.trim().is_empty()
        || target_name == "."
        || target_name == ".."
        || target_name.len() > 255
        || target_name.contains(['/', '\\', '\0'])
        || target_name.chars().any(char::is_control)
    {
        return Err(SessionControlError::FileUnavailable);
    }
    match source.rsplit_once('/') {
        Some(("", _)) => Ok(format!("/{target_name}")),
        Some((parent, _)) => Ok(format!("{parent}/{target_name}")),
        None => Ok(target_name.to_owned()),
    }
}

enum TransferOutcome {
    Completed,
    Cancelled,
}

pub(super) struct LocalUploadFile {
    pub(super) local_path: PathBuf,
    pub(super) remote_relative_path: String,
    pub(super) size: u64,
}

pub(super) struct LocalUploadPlan {
    pub(super) roots: Vec<String>,
    pub(super) directories: Vec<String>,
    pub(super) files: Vec<LocalUploadFile>,
    pub(super) total: u64,
}

async fn upload_entries(
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

pub(super) async fn scan_local_upload_entries(
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

fn remote_child_path(parent: &str, child: &str) -> Result<String, ()> {
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

fn safe_remote_component(name: &str) -> bool {
    !name.trim().is_empty()
        && name != "."
        && name != ".."
        && name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && !name.chars().any(char::is_control)
}

async fn upload_file(
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

async fn download_file(
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

async fn download_directory(
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
