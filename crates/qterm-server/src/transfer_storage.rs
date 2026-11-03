//! Local/SFTP transfer destinations share admission, quotas and cancellation.
use crate::{
    error::{ApiError, Result},
    files::remote_path,
    local_files,
    state::ServerState,
    transfer_lifecycle::Operation,
    transfers::{self, MAX_TRANSFER_BYTES},
};
use qterm_core::infrastructure::ssh::client::TransferRequest;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub fn authorize(state: &ServerState, owner: &str, session: &str) -> Result<()> {
    if session == "local" {
        if state.auth.valid(owner) {
            Ok(())
        } else {
            Err(ApiError::unauthorized())
        }
    } else {
        state.authorize(owner, session)
    }
}
fn components(path: &str) -> Result<Vec<&str>> {
    let parts = path.split('/').collect::<Vec<_>>();
    if path.len() > 4096
        || parts.len() > 64
        || parts
            .iter()
            .any(|p| p.is_empty() || *p == "." || *p == ".." || p.contains(['\\', ':', '\0']))
    {
        return Err(ApiError::invalid());
    }
    Ok(parts)
}
async fn destination(
    state: &ServerState,
    owner: &str,
    session: &str,
    base: &str,
    relative: Option<&str>,
    directory: bool,
    operation: &Operation,
) -> Result<String> {
    let Some(relative) = relative else {
        return Ok(base.into());
    };
    let parts = components(relative)?;
    let mut path = base.to_owned();
    for (index, name) in parts.iter().enumerate() {
        authorize(state, owner, session)?;
        operation.check()?;
        let is_dir = directory || index + 1 < parts.len();
        if session == "local" {
            let child = local_files::path(path.clone())?.join(name);
            match tokio::fs::symlink_metadata(&child).await {
                Ok(meta) if meta.is_symlink() || (is_dir && !meta.is_dir()) => {
                    return Err(ApiError::invalid());
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && is_dir => {
                    tokio::fs::create_dir(&child)
                        .await
                        .map_err(|_| ApiError::storage())?
                }
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                    return Err(ApiError::storage());
                }
                _ => {}
            }
            path = child.to_string_lossy().into_owned();
        } else {
            let listing = state
                .sessions
                .list_directory(session, remote_path(path.clone())?)
                .await?;
            if let Some(entry) = listing.entries.iter().find(|e| e.name == *name) {
                if entry.is_symlink || (is_dir && !entry.is_directory) {
                    return Err(ApiError::invalid());
                }
            } else if is_dir {
                state
                    .sessions
                    .create_entry(session, remote_path(path.clone())?, name.to_string(), true)
                    .await?;
            }
            path = format!("{}/{}", path.trim_end_matches('/'), name);
        }
    }
    Ok(path)
}
#[allow(clippy::too_many_arguments)]
pub async fn upload(
    state: &Arc<ServerState>,
    owner: &str,
    session: &str,
    base: &str,
    relative: Option<&str>,
    directory: bool,
    source: &Path,
    operation: &Operation,
) -> Result<()> {
    authorize(state, owner, session)?;
    operation.check()?;
    let target = destination(state, owner, session, base, relative, directory, operation).await?;
    if directory {
        return if relative.is_some() {
            Ok(())
        } else {
            Err(ApiError::invalid())
        };
    }
    if session == "local" {
        let target = local_files::path(target)?;
        if let Ok(meta) = tokio::fs::symlink_metadata(&target).await
            && !meta.is_file()
        {
            return Err(ApiError::invalid());
        }
        let temp = tempfile::NamedTempFile::new_in(target.parent().ok_or_else(ApiError::invalid)?)
            .map_err(|_| ApiError::storage())?
            .into_temp_path();
        copy(source, &temp, operation).await?;
        authorize(state, owner, session)?;
        operation.check()?;
        temp.persist(target).map_err(|_| ApiError::storage())?;
        Ok(())
    } else {
        transfers::transfer(
            state,
            owner,
            session,
            TransferRequest::Upload {
                local_path: source.into(),
                remote_path: remote_path(target)?,
            },
            operation,
        )
        .await
    }
}
async fn copy(source: &Path, destination: &Path, operation: &Operation) -> Result<()> {
    let meta = tokio::fs::symlink_metadata(source)
        .await
        .map_err(|_| ApiError::storage())?;
    if !meta.is_file() || meta.len() > MAX_TRANSFER_BYTES {
        return Err(ApiError::invalid());
    }
    operation
        .total
        .store(meta.len(), std::sync::atomic::Ordering::Relaxed);
    let mut input = tokio::fs::File::open(source)
        .await
        .map_err(|_| ApiError::storage())?;
    let mut output = tokio::fs::File::create(destination)
        .await
        .map_err(|_| ApiError::storage())?;
    let mut buffer = vec![0; 64 * 1024];
    let mut total = 0;
    loop {
        operation.check()?;
        let size = input
            .read(&mut buffer)
            .await
            .map_err(|_| ApiError::storage())?;
        if size == 0 {
            break;
        }
        total += size as u64;
        if total > MAX_TRANSFER_BYTES {
            return Err(ApiError::invalid());
        }
        output
            .write_all(&buffer[..size])
            .await
            .map_err(|_| ApiError::storage())?;
        operation
            .progress
            .store(total, std::sync::atomic::Ordering::Relaxed);
    }
    output.flush().await.map_err(|_| ApiError::storage())
}
pub async fn download(
    state: &Arc<ServerState>,
    owner: &str,
    session: &str,
    path: &str,
    directory: bool,
    operation: &Operation,
) -> Result<(tempfile::TempPath, String)> {
    let file = transfers::temporary(state)?;
    let name = path
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .filter(|n| !n.is_empty())
        .unwrap_or("download");
    if directory {
        let staging = tempfile::tempdir_in(state.config.data.join("cache/transfers"))
            .map_err(|_| ApiError::storage())?;
        let root = if session == "local" {
            local_files::path(path.into())?
        } else {
            let destination = staging.path().join("contents");
            transfers::transfer(
                state,
                owner,
                session,
                TransferRequest::DownloadDirectory {
                    remote_path: remote_path(path.into())?,
                    local_path: destination.clone(),
                },
                operation,
            )
            .await?;
            destination
        };
        if !tokio::fs::symlink_metadata(&root)
            .await
            .map_err(|_| ApiError::storage())?
            .is_dir()
        {
            return Err(ApiError::invalid());
        }
        // Scoped blocking work retains the operation and temp directory until completion.
        tokio::task::block_in_place(|| crate::transfer_archive::pack(&root, &file, operation))?;
    } else if session == "local" {
        copy(&local_files::path(path.into())?, &file, operation).await?;
    } else {
        transfers::transfer(
            state,
            owner,
            session,
            TransferRequest::Download {
                remote_path: remote_path(path.into())?,
                local_path: PathBuf::from(&file),
            },
            operation,
        )
        .await?;
    }
    Ok((
        file,
        if directory {
            format!("{name}.tar")
        } else {
            name.into()
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_traversal_and_platform_specific_paths() {
        for value in [
            "../file",
            "/root",
            "a//b",
            "a/./b",
            "C:/file",
            "a\\b",
            "a/../../x",
        ] {
            assert!(components(value).is_err(), "{value}");
        }
        assert_eq!(components("目录/sub/file.txt").unwrap().len(), 3);
    }
}
