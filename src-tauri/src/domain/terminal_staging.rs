use std::{fmt, path::Path};

pub const STAGING_DIRECTORY_MODE: u32 = 0o700;
pub const STAGING_FILE_MODE: u32 = 0o600;
pub const STAGING_HOME_TTL_SECS: u64 = 24 * 60 * 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardPayloadKind {
    FileList,
    Text,
    Image,
    Empty,
}

pub fn select_clipboard_payload_kind(
    has_files: bool,
    text: Option<&str>,
    has_image: bool,
) -> ClipboardPayloadKind {
    if has_files {
        ClipboardPayloadKind::FileList
    } else if text.is_some_and(|value| !value.is_empty()) {
        ClipboardPayloadKind::Text
    } else if has_image {
        ClipboardPayloadKind::Image
    } else {
        ClipboardPayloadKind::Empty
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TerminalStagingError {
    ClipboardUnavailable,
    InvalidClipboardData,
    LocalSourceUnavailable,
    SessionNotFound,
    SessionNotConnected,
    TerminalUnavailable,
    TemporaryDirectoryUnavailable,
    UploadFailed,
    TaskNotFound,
}

impl fmt::Display for TerminalStagingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::ClipboardUnavailable => "clipboard payload unavailable",
            Self::InvalidClipboardData => "clipboard payload is invalid",
            Self::LocalSourceUnavailable => "clipboard file source is unavailable",
            Self::SessionNotFound => "session not found",
            Self::SessionNotConnected => "session is not connected",
            Self::TerminalUnavailable => "terminal staging is unavailable",
            Self::TemporaryDirectoryUnavailable => "remote staging directory is unavailable",
            Self::UploadFailed => "terminal staging upload failed",
            Self::TaskNotFound => "terminal staging task not found",
        })
    }
}

impl std::error::Error for TerminalStagingError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalStagingEvent {
    Preparing,
    Scanning {
        item_count: usize,
    },
    Started {
        total_bytes: u64,
        item_count: usize,
        display_name: String,
    },
    Progress {
        transferred_bytes: u64,
        total_bytes: u64,
    },
    Completed {
        remote_paths: Vec<String>,
    },
    Cancelled,
    Failed,
}

pub fn validate_rgba_layout(
    width: u32,
    height: u32,
    byte_len: usize,
) -> Result<(), TerminalStagingError> {
    if width == 0 || height == 0 {
        return Err(TerminalStagingError::InvalidClipboardData);
    }
    let expected = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or(TerminalStagingError::InvalidClipboardData)?;
    if expected != byte_len {
        return Err(TerminalStagingError::InvalidClipboardData);
    }
    Ok(())
}

pub fn safe_staging_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    if extension.is_empty()
        || extension.len() > 16
        || !extension
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(extension.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_lists_override_text_and_text_overrides_raw_images() {
        assert_eq!(
            select_clipboard_payload_kind(true, Some("C:/photo.png"), true),
            ClipboardPayloadKind::FileList
        );
        assert_eq!(
            select_clipboard_payload_kind(false, Some("plain text"), true),
            ClipboardPayloadKind::Text
        );
        assert_eq!(
            select_clipboard_payload_kind(false, Some(""), true),
            ClipboardPayloadKind::Image
        );
        assert_eq!(
            select_clipboard_payload_kind(false, None, false),
            ClipboardPayloadKind::Empty
        );
    }

    #[test]
    fn rgba_validation_has_no_previous_dimension_or_pixel_ceiling() {
        let old_limit_exceeding_width = 8_193_u32;
        let bytes = usize::try_from(u64::from(old_limit_exceeding_width) * 4).expect("bytes");
        assert!(validate_rgba_layout(old_limit_exceeding_width, 1, bytes).is_ok());
        let pixels_above_old_limit = 20_000_000_u64;
        let bytes_above_old_limit = usize::try_from(pixels_above_old_limit * 4).expect("bytes");
        assert!(validate_rgba_layout(5_000, 4_000, bytes_above_old_limit).is_ok());
        assert_eq!(
            validate_rgba_layout(0, 1, 0),
            Err(TerminalStagingError::InvalidClipboardData)
        );
        assert_eq!(
            validate_rgba_layout(2, 1, 4),
            Err(TerminalStagingError::InvalidClipboardData)
        );
    }

    #[test]
    fn staging_extensions_are_short_ascii_and_do_not_expose_names() {
        assert_eq!(
            safe_staging_extension(Path::new("Photo.JPEG")),
            Some("jpeg".into())
        );
        assert_eq!(
            safe_staging_extension(Path::new("archive.tar.gz")),
            Some("gz".into())
        );
        assert_eq!(
            safe_staging_extension(Path::new("file.very-long-extension")),
            None
        );
        assert_eq!(safe_staging_extension(Path::new("file.图")), None);
    }
}
