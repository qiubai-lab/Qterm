use super::*;

pub(in super::super) async fn list_remote_directory<S>(
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

pub(in super::super) async fn read_remote_file<S>(
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

pub(in super::super) async fn write_remote_text_file<S>(
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

pub(in super::super) async fn mutate_remote_entry<S>(
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

async fn copy_remote_file(
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

async fn rename_remote_entry(
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
