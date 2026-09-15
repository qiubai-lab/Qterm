use std::{
    io::{Cursor, Write},
    path::PathBuf,
};

use atomic_write_file::AtomicWriteFile;
use image::{ImageFormat, ImageReader, Limits};

const MAX_PNG_BYTES: usize = 64 * 1024 * 1024;
const MAX_PIXELS: u64 = 16_000_000;
const MAX_DIMENSION: u32 = 16_384;

#[derive(Debug)]
pub(crate) enum ImageExportError {
    InvalidImage,
    Unavailable,
}

pub(crate) struct TerminalPng(Vec<u8>);

impl TerminalPng {
    pub(crate) fn validate(bytes: Vec<u8>) -> Result<Self, ImageExportError> {
        if bytes.len() > MAX_PNG_BYTES {
            return Err(ImageExportError::InvalidImage);
        }
        let reader = || ImageReader::with_format(Cursor::new(&bytes), ImageFormat::Png);
        let (width, height) = reader()
            .into_dimensions()
            .map_err(|_| ImageExportError::InvalidImage)?;
        if width == 0
            || height == 0
            || width.max(height) > MAX_DIMENSION
            || u64::from(width) * u64::from(height) > MAX_PIXELS
        {
            return Err(ImageExportError::InvalidImage);
        }
        let mut limits = Limits::default();
        limits.max_image_width = Some(MAX_DIMENSION);
        limits.max_image_height = Some(MAX_DIMENSION);
        limits.max_alloc = Some(128 * 1024 * 1024);
        let mut decoder = reader();
        decoder.limits(limits);
        decoder
            .decode()
            .map_err(|_| ImageExportError::InvalidImage)?;
        Ok(Self(bytes))
    }

    pub(crate) fn save_selected(
        self,
        path: Option<PathBuf>,
    ) -> Result<Option<String>, ImageExportError> {
        let Some(path) = path else {
            return Ok(None);
        };
        let mut file = AtomicWriteFile::open(&path).map_err(|_| ImageExportError::Unavailable)?;
        file.write_all(&self.0)
            .map_err(|_| ImageExportError::Unavailable)?;
        file.commit().map_err(|_| ImageExportError::Unavailable)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ExtendedColorType, ImageEncoder, codecs::png::PngEncoder};

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut result = Vec::new();
        PngEncoder::new(&mut result)
            .write_image(
                &vec![0; (width * height * 4) as usize],
                width,
                height,
                ExtendedColorType::Rgba8,
            )
            .unwrap();
        result
    }

    #[test]
    fn saves_exact_png_and_replaces_only_the_selected_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("terminal.png");
        std::fs::write(&path, b"previous").unwrap();
        let bytes = png(4, 2);
        let saved = TerminalPng::validate(bytes.clone())
            .unwrap()
            .save_selected(Some(path.clone()))
            .unwrap();
        assert_eq!(saved, Some(path.to_string_lossy().into_owned()));
        assert_eq!(std::fs::read(path).unwrap(), bytes);
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn cancellation_returns_no_path_and_save_failures_are_retryable() {
        assert!(
            TerminalPng::validate(png(1, 1))
                .unwrap()
                .save_selected(None)
                .unwrap()
                .is_none()
        );
        let directory = tempfile::tempdir().unwrap();
        let missing = directory.path().join("missing/terminal.png");
        assert!(matches!(
            TerminalPng::validate(png(1, 1))
                .unwrap()
                .save_selected(Some(missing)),
            Err(ImageExportError::Unavailable)
        ));
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejects_invalid_truncated_and_oversized_pngs() {
        assert!(TerminalPng::validate(b"not png".to_vec()).is_err());
        let mut truncated = png(2, 2);
        truncated.truncate(40);
        assert!(TerminalPng::validate(truncated).is_err());
        assert!(TerminalPng::validate(png(MAX_DIMENSION + 1, 1)).is_err());
        assert!(TerminalPng::validate(png(4001, 4000)).is_err());
    }
}
