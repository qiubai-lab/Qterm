use std::{
    fmt,
    io::Write,
    path::{Path, PathBuf},
};

use atomic_write_file::AtomicWriteFile;

use crate::domain::files::{
    FileDocument, MAX_IMAGE_FILE_BYTES, MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES,
    MAX_TEXT_FILE_BYTES, content_revision,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileServiceError {
    InvalidPath,
    Unavailable,
    TooLarge,
    NotUtf8,
    Conflict,
}

impl fmt::Display for FileServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidPath => "invalid file path",
            Self::Unavailable => "file unavailable",
            Self::TooLarge => "file too large",
            Self::NotUtf8 => "file is not UTF-8",
            Self::Conflict => "file changed externally",
        })
    }
}

impl std::error::Error for FileServiceError {}

pub async fn read_local_text(path: &Path) -> Result<FileDocument, FileServiceError> {
    read_local(path, MAX_TEXT_FILE_BYTES, true).await
}

pub async fn read_local_binary(path: &Path) -> Result<FileDocument, FileServiceError> {
    read_local(path, MAX_IMAGE_FILE_BYTES, false).await
}

async fn read_local(
    path: &Path,
    limit: u64,
    require_utf8: bool,
) -> Result<FileDocument, FileServiceError> {
    validate_path(path)?;
    let metadata = tokio::fs::symlink_metadata(path)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err(if metadata.len() > limit {
            FileServiceError::TooLarge
        } else {
            FileServiceError::Unavailable
        });
    }
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    if require_utf8 && std::str::from_utf8(&bytes).is_err() {
        return Err(FileServiceError::NotUtf8);
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

pub async fn write_local_text(
    path: &Path,
    text: String,
    expected_revision: &str,
) -> Result<FileDocument, FileServiceError> {
    if text.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(FileServiceError::TooLarge);
    }
    let current = read_local_text(path).await?;
    if current.revision != expected_revision {
        return Err(FileServiceError::Conflict);
    }
    let owned_path = path.to_path_buf();
    let bytes = text.into_bytes();
    let write_bytes = bytes.clone();
    tokio::task::spawn_blocking(move || {
        let mut file =
            AtomicWriteFile::open(&owned_path).map_err(|_| FileServiceError::Unavailable)?;
        file.write_all(&write_bytes)
            .map_err(|_| FileServiceError::Unavailable)?;
        file.commit().map_err(|_| FileServiceError::Unavailable)
    })
    .await
    .map_err(|_| FileServiceError::Unavailable)??;
    read_local_text(path).await
}

pub fn validate_entry_name(name: &str) -> Result<(), FileServiceError> {
    if name.trim().is_empty()
        || name == "."
        || name == ".."
        || name.len() > 255
        || name.contains(['/', '\\', '\0'])
        || name.chars().any(char::is_control)
    {
        Err(FileServiceError::InvalidPath)
    } else {
        Ok(())
    }
}

pub async fn copy_local_file(source: &Path, target_name: &str) -> Result<(), FileServiceError> {
    validate_path(source)?;
    validate_entry_name(target_name)?;
    let metadata = tokio::fs::symlink_metadata(source)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(FileServiceError::Unavailable);
    }
    let target = sibling_path(source, target_name)?;
    let mut input = tokio::fs::File::open(source)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    let mut output = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                FileServiceError::Conflict
            } else {
                FileServiceError::Unavailable
            }
        })?;
    let result = async {
        tokio::io::copy(&mut input, &mut output)
            .await
            .map_err(|_| FileServiceError::Unavailable)?;
        output
            .sync_all()
            .await
            .map_err(|_| FileServiceError::Unavailable)?;
        tokio::fs::set_permissions(&target, metadata.permissions())
            .await
            .map_err(|_| FileServiceError::Unavailable)
    }
    .await;
    if result.is_err() {
        drop(output);
        let _ = tokio::fs::remove_file(&target).await;
    }
    result
}

pub async fn create_local_entry(
    directory: &Path,
    name: &str,
    is_directory: bool,
) -> Result<(), FileServiceError> {
    validate_path(directory)?;
    validate_entry_name(name)?;
    let target = directory.join(name);
    let result = if is_directory {
        tokio::fs::create_dir(&target).await
    } else {
        tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .await
            .map(|_| ())
    };
    result.map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            FileServiceError::Conflict
        } else {
            FileServiceError::Unavailable
        }
    })
}

pub async fn rename_local_entry(source: &Path, target_name: &str) -> Result<(), FileServiceError> {
    validate_path(source)?;
    validate_entry_name(target_name)?;
    tokio::fs::symlink_metadata(source)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    let target = sibling_path(source, target_name)?;
    if tokio::fs::try_exists(&target)
        .await
        .map_err(|_| FileServiceError::Unavailable)?
    {
        return Err(FileServiceError::Conflict);
    }
    tokio::fs::rename(source, target)
        .await
        .map_err(|_| FileServiceError::Unavailable)
}

pub async fn delete_local_entry(path: &Path) -> Result<(), FileServiceError> {
    validate_path(path)?;
    let metadata = tokio::fs::symlink_metadata(path)
        .await
        .map_err(|_| FileServiceError::Unavailable)?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        validate_local_tree(path).await?;
        tokio::fs::remove_dir_all(path)
            .await
            .map_err(|_| FileServiceError::Unavailable)
    } else {
        tokio::fs::remove_file(path)
            .await
            .map_err(|_| FileServiceError::Unavailable)
    }
}

fn sibling_path(source: &Path, target_name: &str) -> Result<PathBuf, FileServiceError> {
    source
        .parent()
        .map(|parent| parent.join(target_name))
        .ok_or(FileServiceError::InvalidPath)
}

async fn validate_local_tree(root: &Path) -> Result<(), FileServiceError> {
    let mut stack = vec![(root.to_path_buf(), 0_usize)];
    let mut entries = 0_usize;
    while let Some((directory, depth)) = stack.pop() {
        if depth > MAX_RECURSIVE_FILE_DEPTH {
            return Err(FileServiceError::Unavailable);
        }
        let mut children = tokio::fs::read_dir(directory)
            .await
            .map_err(|_| FileServiceError::Unavailable)?;
        while let Some(child) = children
            .next_entry()
            .await
            .map_err(|_| FileServiceError::Unavailable)?
        {
            entries = entries.saturating_add(1);
            if entries > MAX_RECURSIVE_FILE_ENTRIES {
                return Err(FileServiceError::Unavailable);
            }
            let metadata = tokio::fs::symlink_metadata(child.path())
                .await
                .map_err(|_| FileServiceError::Unavailable)?;
            if metadata.is_dir() && !metadata.file_type().is_symlink() {
                stack.push((child.path(), depth + 1));
            }
        }
    }
    Ok(())
}

fn validate_path(path: &Path) -> Result<(), FileServiceError> {
    let value = path.to_string_lossy();
    if value.trim().is_empty() || value.len() > 4096 || value.contains('\0') {
        Err(FileServiceError::InvalidPath)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{
        FileServiceError, copy_local_file, create_local_entry, delete_local_entry, read_local_text,
        rename_local_entry, write_local_text,
    };

    #[tokio::test]
    async fn local_text_save_rejects_external_changes() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("config.yaml");
        tokio::fs::write(&path, "enabled: false\n")
            .await
            .expect("initial file");
        let document = read_local_text(&path).await.expect("read document");
        tokio::fs::write(&path, "enabled: external\n")
            .await
            .expect("external change");

        assert_eq!(
            write_local_text(&path, "enabled: true\n".into(), &document.revision).await,
            Err(FileServiceError::Conflict)
        );
        assert_eq!(
            tokio::fs::read_to_string(path)
                .await
                .expect("preserved file"),
            "enabled: external\n"
        );
    }

    #[tokio::test]
    async fn local_text_save_atomically_replaces_matching_revision() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("notes.md");
        tokio::fs::write(&path, "old").await.expect("initial file");
        let document = read_local_text(&path).await.expect("read document");
        let saved = write_local_text(&path, "new".into(), &document.revision)
            .await
            .expect("save");

        assert_eq!(saved.bytes, b"new");
        assert_eq!(
            tokio::fs::read_to_string(path).await.expect("saved file"),
            "new"
        );
    }

    #[tokio::test]
    async fn text_preview_rejects_non_utf8_and_oversized_files() {
        let directory = tempdir().expect("temp directory");
        let binary = directory.path().join("binary.dat");
        tokio::fs::write(&binary, [0xff, 0xfe])
            .await
            .expect("binary file");
        assert_eq!(
            read_local_text(&binary).await,
            Err(FileServiceError::NotUtf8)
        );

        let oversized = directory.path().join("oversized.txt");
        tokio::fs::write(&oversized, vec![b'x'; 2 * 1024 * 1024 + 1])
            .await
            .expect("oversized file");
        assert_eq!(
            read_local_text(&oversized).await,
            Err(FileServiceError::TooLarge)
        );
    }

    #[tokio::test]
    async fn local_mutations_refuse_overwrite_and_delete_recursive_trees() {
        let directory = tempdir().expect("temp directory");
        let source = directory.path().join("source.txt");
        tokio::fs::write(&source, "source").await.expect("source");
        copy_local_file(&source, "copy.txt").await.expect("copy");
        assert_eq!(
            tokio::fs::read_to_string(directory.path().join("copy.txt"))
                .await
                .expect("copy content"),
            "source"
        );
        assert_eq!(
            copy_local_file(&source, "copy.txt").await,
            Err(FileServiceError::Conflict)
        );
        rename_local_entry(&source, "renamed.txt")
            .await
            .expect("rename");
        assert!(!source.exists());

        let tree = directory.path().join("tree");
        tokio::fs::create_dir_all(tree.join("nested"))
            .await
            .expect("tree");
        tokio::fs::write(tree.join("nested/file.txt"), "nested")
            .await
            .expect("nested file");
        delete_local_entry(&tree).await.expect("delete tree");
        assert!(!tree.exists());
    }

    #[tokio::test]
    async fn local_mutations_reject_path_segments_as_names() {
        let directory = tempdir().expect("temp directory");
        let source = directory.path().join("source.txt");
        tokio::fs::write(&source, "source").await.expect("source");
        assert_eq!(
            copy_local_file(&source, "../escape.txt").await,
            Err(FileServiceError::InvalidPath)
        );
        assert_eq!(
            rename_local_entry(&source, "nested/name.txt").await,
            Err(FileServiceError::InvalidPath)
        );
    }

    #[tokio::test]
    async fn local_create_makes_empty_entries_without_overwriting() {
        let directory = tempdir().expect("temp directory");
        create_local_entry(directory.path(), "notes.txt", false)
            .await
            .expect("create file");
        create_local_entry(directory.path(), "assets", true)
            .await
            .expect("create directory");
        assert_eq!(
            tokio::fs::metadata(directory.path().join("notes.txt"))
                .await
                .expect("file")
                .len(),
            0
        );
        assert!(
            tokio::fs::metadata(directory.path().join("assets"))
                .await
                .expect("directory")
                .is_dir()
        );
        assert_eq!(
            create_local_entry(directory.path(), "notes.txt", false).await,
            Err(FileServiceError::Conflict)
        );
    }
}
