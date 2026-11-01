use crate::{
    application::file_service::FileServiceError,
    domain::files::{DirectoryListing, FileEntry, MAX_RECURSIVE_FILE_ENTRIES},
};
use std::{path::Path, time::UNIX_EPOCH};

pub async fn list(path: &Path) -> Result<DirectoryListing, FileServiceError> {
    let canonical = tokio::fs::canonicalize(path)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    let canonical = dunce::simplified(&canonical);
    let mut directory = tokio::fs::read_dir(canonical)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    let mut entries = Vec::new();
    while let Some(entry) = directory
        .next_entry()
        .await
        .map_err(|_| FileServiceError::Unavailable)?
    {
        if entries.len() >= MAX_RECURSIVE_FILE_ENTRIES {
            return Err(FileServiceError::TooLarge);
        }
        let metadata = entry
            .metadata()
            .await
            .map_err(|_| FileServiceError::Unavailable)?;
        let file_type = entry
            .file_type()
            .await
            .map_err(|_| FileServiceError::Unavailable)?;
        #[cfg(unix)]
        let permission_mode = {
            use std::os::unix::fs::PermissionsExt;
            Some(metadata.permissions().mode() & 0o7777)
        };
        #[cfg(not(unix))]
        let permission_mode = None;
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: dunce::simplified(&entry.path())
                .to_string_lossy()
                .into_owned(),
            is_directory: metadata.is_dir(),
            is_symlink: file_type.is_symlink(),
            size: metadata.len(),
            modified_at: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
            permission_mode,
        });
    }
    Ok(DirectoryListing::new(
        canonical.to_string_lossy().into_owned(),
        entries,
    ))
}
