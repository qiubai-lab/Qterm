use std::{collections::HashSet, io::Write, path::PathBuf};

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

pub struct NativeClipboardPayloadSource;

impl ClipboardPayloadSource for NativeClipboardPayloadSource {
    fn read_payload(
        &self,
    ) -> TerminalStagingFuture<'_, Result<ClipboardPayload, TerminalStagingError>> {
        Box::pin(async {
            tauri::async_runtime::spawn_blocking(read_native_payload)
                .await
                .map_err(|_| TerminalStagingError::ClipboardUnavailable)?
        })
    }
}

fn read_native_payload() -> Result<ClipboardPayload, TerminalStagingError> {
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
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<StagingSourceEntry, TerminalStagingError> {
    validate_rgba_layout(width, height, rgba.len())?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".qterm-staging-")
        .suffix(".png")
        .tempfile()
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    PngEncoder::new(temporary.as_file_mut())
        .write_image(rgba, width, height, ExtendedColorType::Rgba8)
        .map_err(|_| TerminalStagingError::InvalidClipboardData)?;
    temporary
        .as_file_mut()
        .flush()
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    let (_, path) = temporary
        .keep()
        .map_err(|_| TerminalStagingError::LocalSourceUnavailable)?;
    Ok(StagingSourceEntry {
        path,
        display_name: "clipboard.png".into(),
        extension: Some("png".into()),
        cleanup_after: true,
    })
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
        let width = 8_193_u32;
        let rgba = vec![255_u8; usize::try_from(u64::from(width) * 4).expect("bytes")];
        let entry = spool_rgba_image(width, 1, &rgba).expect("spool");
        assert_eq!(entry.extension.as_deref(), Some("png"));
        assert!(entry.cleanup_after);
        assert!(std::fs::metadata(&entry.path).expect("metadata").len() > 8);
        std::fs::remove_file(entry.path).expect("cleanup");
    }
}
