use std::fmt;

pub const MAX_CLIPBOARD_IMAGE_DIMENSION: u32 = 8_192;
pub const MAX_CLIPBOARD_IMAGE_PIXELS: u64 = 16_777_216;
pub const MAX_CLIPBOARD_IMAGE_PNG_BYTES: usize = 20 * 1024 * 1024;
pub const CLIPBOARD_DIRECTORY_MODE: u32 = 0o700;
pub const CLIPBOARD_FILE_MODE: u32 = 0o600;
pub const CLIPBOARD_HOME_TTL_SECS: u64 = 24 * 60 * 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardImageError {
    Unavailable,
    InvalidDimensions,
    TooManyPixels,
    TooLarge,
    InvalidPixelData,
    EncodingFailed,
}

impl fmt::Display for ClipboardImageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Unavailable => "clipboard image unavailable",
            Self::InvalidDimensions => "clipboard image dimensions are invalid",
            Self::TooManyPixels => "clipboard image has too many pixels",
            Self::TooLarge => "clipboard image PNG is too large",
            Self::InvalidPixelData => "clipboard image pixels are invalid",
            Self::EncodingFailed => "clipboard image encoding failed",
        })
    }
}

impl std::error::Error for ClipboardImageError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipboardImage {
    width: u32,
    height: u32,
    png: Vec<u8>,
}

impl ClipboardImage {
    pub fn new(width: u32, height: u32, png: Vec<u8>) -> Result<Self, ClipboardImageError> {
        validate_dimensions(width, height)?;
        if png.len() > MAX_CLIPBOARD_IMAGE_PNG_BYTES {
            return Err(ClipboardImageError::TooLarge);
        }
        if !png.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
            return Err(ClipboardImageError::EncodingFailed);
        }
        Ok(Self { width, height, png })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn into_png(self) -> Vec<u8> {
        self.png
    }
}

pub fn validate_dimensions(width: u32, height: u32) -> Result<(), ClipboardImageError> {
    if width == 0
        || height == 0
        || width > MAX_CLIPBOARD_IMAGE_DIMENSION
        || height > MAX_CLIPBOARD_IMAGE_DIMENSION
    {
        return Err(ClipboardImageError::InvalidDimensions);
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(ClipboardImageError::TooManyPixels)?;
    if pixels > MAX_CLIPBOARD_IMAGE_PIXELS {
        return Err(ClipboardImageError::TooManyPixels);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_bytes(size: usize) -> Vec<u8> {
        let mut bytes = vec![0; size.max(8)];
        bytes[..8].copy_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);
        bytes
    }

    #[test]
    fn accepts_a_valid_screenshot_and_preserves_metadata() {
        let image = ClipboardImage::new(1_920, 1_080, png_bytes(128)).expect("valid image");
        assert_eq!(image.width(), 1_920);
        assert_eq!(image.height(), 1_080);
        assert_eq!(image.into_png().len(), 128);
    }

    #[test]
    fn rejects_zero_oversized_dimensions_and_pixel_count() {
        assert_eq!(
            validate_dimensions(0, 1),
            Err(ClipboardImageError::InvalidDimensions)
        );
        assert_eq!(
            validate_dimensions(8_193, 1),
            Err(ClipboardImageError::InvalidDimensions)
        );
        assert_eq!(
            validate_dimensions(8_192, 8_192),
            Err(ClipboardImageError::TooManyPixels)
        );
        assert!(validate_dimensions(4_096, 4_096).is_ok());
    }

    #[test]
    fn rejects_non_png_and_encoded_payloads_over_the_limit() {
        assert_eq!(
            ClipboardImage::new(1, 1, vec![0; 8]),
            Err(ClipboardImageError::EncodingFailed)
        );
        assert_eq!(
            ClipboardImage::new(1, 1, png_bytes(MAX_CLIPBOARD_IMAGE_PNG_BYTES + 1)),
            Err(ClipboardImageError::TooLarge)
        );
    }
}
