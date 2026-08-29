use std::io::Write;

use image::{ExtendedColorType, ImageEncoder, codecs::png::PngEncoder};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::{
    domain::clipboard_image::{
        ClipboardImage, ClipboardImageError, MAX_CLIPBOARD_IMAGE_PNG_BYTES, validate_dimensions,
    },
    ports::clipboard_image::{ClipboardImageFuture, ClipboardImageSource},
};

pub struct NativeClipboardImageSource {
    app: AppHandle,
}

impl NativeClipboardImageSource {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl ClipboardImageSource for NativeClipboardImageSource {
    fn read_image(&self) -> ClipboardImageFuture<'_, Result<ClipboardImage, ClipboardImageError>> {
        let app = self.app.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || read_and_encode(&app))
                .await
                .map_err(|_| ClipboardImageError::Unavailable)?
        })
    }
}

fn read_and_encode(app: &AppHandle) -> Result<ClipboardImage, ClipboardImageError> {
    let image = app
        .clipboard()
        .read_image()
        .map_err(|_| ClipboardImageError::Unavailable)?
        .to_owned();
    let width = image.width();
    let height = image.height();
    encode_rgba(width, height, image.rgba())
}

fn encode_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<ClipboardImage, ClipboardImageError> {
    validate_dimensions(width, height)?;
    let expected = usize::try_from(u64::from(width) * u64::from(height) * 4)
        .map_err(|_| ClipboardImageError::InvalidPixelData)?;
    if rgba.len() != expected {
        return Err(ClipboardImageError::InvalidPixelData);
    }
    let mut png = LimitedVecWriter::new(MAX_CLIPBOARD_IMAGE_PNG_BYTES);
    if PngEncoder::new(&mut png)
        .write_image(rgba, width, height, ExtendedColorType::Rgba8)
        .is_err()
    {
        return Err(if png.exceeded {
            ClipboardImageError::TooLarge
        } else {
            ClipboardImageError::EncodingFailed
        });
    }
    ClipboardImage::new(width, height, png.into_inner())
}

struct LimitedVecWriter {
    bytes: Vec<u8>,
    limit: usize,
    exceeded: bool,
}

impl LimitedVecWriter {
    fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
            exceeded: false,
        }
    }

    fn into_inner(self) -> Vec<u8> {
        self.bytes
    }
}

impl Write for LimitedVecWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        if buffer.len() > self.limit.saturating_sub(self.bytes.len()) {
            self.exceeded = true;
            return Err(std::io::Error::other(
                "encoded clipboard image exceeds limit",
            ));
        }
        self.bytes.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_rgba_as_a_valid_png_without_exposing_tauri_image_types() {
        let image = encode_rgba(2, 1, &[255, 0, 0, 255, 0, 255, 0, 255]).expect("encode");
        assert_eq!((image.width(), image.height()), (2, 1));
        assert!(
            image
                .into_png()
                .starts_with(&[137, 80, 78, 71, 13, 10, 26, 10])
        );
    }

    #[test]
    fn rejects_inconsistent_rgba_before_encoding() {
        assert_eq!(
            encode_rgba(2, 1, &[0; 4]),
            Err(ClipboardImageError::InvalidPixelData)
        );
        assert_eq!(
            encode_rgba(0, 1, &[]),
            Err(ClipboardImageError::InvalidDimensions)
        );
    }

    #[test]
    fn bounded_png_writer_never_grows_past_its_limit() {
        let mut writer = LimitedVecWriter::new(4);
        assert_eq!(writer.write(&[1, 2, 3]).expect("bounded write"), 3);
        assert!(writer.write(&[4, 5]).is_err());
        assert!(writer.exceeded);
        assert_eq!(writer.into_inner(), vec![1, 2, 3]);
    }
}
