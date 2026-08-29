use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use image::{ExtendedColorType, ImageEncoder, codecs::png::PngEncoder};

use crate::{
    domain::terminal_staging::{
        ClipboardPayloadKind, TerminalStagingError, safe_staging_extension,
        select_clipboard_payload_kind, validate_rgba_layout,
    },
    ports::terminal_staging::{
        ClipboardPayload, ClipboardPayloadSource, StagingSourceEntry, TerminalStagingFuture,
    },
};

const MAX_CLIPBOARD_ROOT_ENTRIES: usize = 256;
const CLIPBOARD_IMAGE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Debug)]
pub struct NativeClipboardPayloadSource {
    cache_directory: PathBuf,
}

impl NativeClipboardPayloadSource {
    pub fn new(cache_directory: PathBuf) -> Self {
        Self { cache_directory }
    }
}

impl ClipboardPayloadSource for NativeClipboardPayloadSource {
    fn read_payload(
        &self,
    ) -> TerminalStagingFuture<'_, Result<ClipboardPayload, TerminalStagingError>> {
        let cache_directory = self.cache_directory.clone();
        Box::pin(async {
            tauri::async_runtime::spawn_blocking(move || read_native_payload(&cache_directory))
                .await
                .map_err(|_| TerminalStagingError::ClipboardUnavailable)?
        })
    }
}

fn read_native_payload(cache_directory: &Path) -> Result<ClipboardPayload, TerminalStagingError> {
    prepare_clipboard_cache(cache_directory)?;
    let mut clipboard =
        arboard::Clipboard::new().map_err(|_| TerminalStagingError::ClipboardUnavailable)?;
    let paths = clipboard.get().file_list().unwrap_or_default();
    let text = clipboard.get_text().ok();
    match select_clipboard_payload_kind(!paths.is_empty(), text.as_deref(), false) {
        ClipboardPayloadKind::FileList => {
            return entries_from_file_list(paths).map(ClipboardPayload::Entries);
        }
        ClipboardPayloadKind::Text => {
            return Ok(ClipboardPayload::Text(text.unwrap_or_default()));
        }
        ClipboardPayloadKind::Image | ClipboardPayloadKind::Empty => {}
    }
    match clipboard.get_image() {
        Ok(image) => spool_rgba_image(
            cache_directory,
            u32::try_from(image.width).map_err(|_| TerminalStagingError::InvalidClipboardData)?,
            u32::try_from(image.height).map_err(|_| TerminalStagingError::InvalidClipboardData)?,
            image.bytes.as_ref(),
        )
        .map(|entry| ClipboardPayload::Entries(vec![entry])),
        Err(_) => Ok(ClipboardPayload::Empty),
    }
}

fn entries_from_file_list(
    paths: Vec<PathBuf>,
) -> Result<Vec<StagingSourceEntry>, TerminalStagingError> {
    if paths.is_empty() || paths.len() > MAX_CLIPBOARD_ROOT_ENTRIES {
        return Err(TerminalStagingError::InvalidClipboardData);
    }
    let mut seen = HashSet::new();
    let mut entries = Vec::with_capacity(paths.len());
    for path in paths {
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
        if metadata.file_type().is_symlink() || !(metadata.is_file() || metadata.is_dir()) {
            return Err(TerminalStagingError::LocalSourceUnavailable);
        }
        let canonical = std::fs::canonicalize(&path)
            .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
        let canonical = dunce::simplified(&canonical).to_path_buf();
        if !seen.insert(canonical.clone()) {
            return Err(TerminalStagingError::InvalidClipboardData);
        }
        let display_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or(TerminalStagingError::InvalidClipboardData)?
            .to_owned();
        entries.push(StagingSourceEntry {
            extension: metadata
                .is_file()
                .then(|| safe_staging_extension(&path))
                .flatten(),
            path: canonical,
            display_name,
            cleanup_after: false,
        });
    }
    Ok(entries)
}

fn spool_rgba_image(
    cache_directory: &Path,
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<StagingSourceEntry, TerminalStagingError> {
    validate_rgba_layout(width, height, rgba.len())?;
    prepare_clipboard_cache(cache_directory)?;
    let path = cache_directory.join(format!("{}.png", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&path)
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    let write_result = PngEncoder::new(&mut file)
        .write_image(rgba, width, height, ExtendedColorType::Rgba8)
        .map_err(|_| TerminalStagingError::InvalidClipboardData)
        .and_then(|_| {
            file.flush()
                .map_err(|_| TerminalStagingError::LocalSourceUnavailable)
        });
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&path);
        return Err(error);
    }
    Ok(StagingSourceEntry {
        path,
        display_name: "clipboard.png".into(),
        extension: Some("png".into()),
        cleanup_after: true,
    })
}

fn prepare_clipboard_cache(cache_directory: &Path) -> Result<(), TerminalStagingError> {
    std::fs::create_dir_all(cache_directory)
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    #[cfg(unix)]
    std::fs::set_permissions(cache_directory, std::fs::Permissions::from_mode(0o700))
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    cleanup_expired_clipboard_images(cache_directory, CLIPBOARD_IMAGE_TTL)
}

fn cleanup_expired_clipboard_images(
    cache_directory: &Path,
    ttl: Duration,
) -> Result<(), TerminalStagingError> {
    let entries = std::fs::read_dir(cache_directory)
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_managed_clipboard_image(&path) {
            continue;
        }
        let expired = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age >= ttl);
        if expired {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

fn is_managed_clipboard_image(path: &Path) -> bool {
    path.extension().and_then(|value| value.to_str()) == Some("png")
        && path
            .file_stem()
            .and_then(|value| value.to_str())
            .is_some_and(|value| uuid::Uuid::parse_str(value).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_file_lists_preserve_only_safe_display_metadata() {
        let directory = tempfile::tempdir().expect("tempdir");
        let image = directory.path().join("Photo.JPEG");
        let folder = directory.path().join("assets");
        std::fs::write(&image, b"bytes").expect("fixture");
        std::fs::create_dir(&folder).expect("folder");
        let entries = entries_from_file_list(vec![image, folder]).expect("entries");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].display_name, "Photo.JPEG");
        assert_eq!(entries[0].extension.as_deref(), Some("jpeg"));
        assert!(!entries[0].cleanup_after);
        assert!(entries[0].path.is_absolute());
        assert_eq!(entries[1].display_name, "assets");
        assert_eq!(entries[1].extension, None);
    }

    #[test]
    fn duplicate_roots_are_not_authorized() {
        let directory = tempfile::tempdir().expect("tempdir");
        let file = directory.path().join("file.txt");
        std::fs::write(&file, b"bytes").expect("fixture");
        assert_eq!(
            entries_from_file_list(vec![file.clone(), file]),
            Err(TerminalStagingError::InvalidClipboardData)
        );
    }

    #[test]
    fn raw_images_spool_to_png_without_the_previous_dimension_limit() {
        let directory = tempfile::tempdir().expect("cache root");
        let width = 8_193_u32;
        let rgba = vec![255_u8; usize::try_from(u64::from(width) * 4).expect("bytes")];
        let entry = spool_rgba_image(directory.path(), width, 1, &rgba).expect("spool");
        assert_eq!(entry.extension.as_deref(), Some("png"));
        assert!(entry.cleanup_after);
        assert_eq!(entry.path.parent(), Some(directory.path()));
        let stem = entry
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .expect("stem");
        assert!(uuid::Uuid::parse_str(stem).is_ok());
        assert!(std::fs::metadata(&entry.path).expect("metadata").len() > 8);
        std::fs::remove_file(entry.path).expect("cleanup");
    }

    #[test]
    fn clipboard_cache_cleanup_only_removes_managed_expired_png_files() {
        let directory = tempfile::tempdir().expect("cache root");
        let managed = directory
            .path()
            .join(format!("{}.png", uuid::Uuid::new_v4()));
        let unrelated = directory.path().join("keep.png");
        std::fs::write(&managed, b"managed").expect("managed fixture");
        std::fs::write(&unrelated, b"unrelated").expect("unrelated fixture");

        cleanup_expired_clipboard_images(directory.path(), std::time::Duration::ZERO)
            .expect("cleanup");

        assert!(!managed.exists());
        assert!(unrelated.exists());
    }
}
