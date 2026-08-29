use std::{future::Future, pin::Pin};

use crate::domain::clipboard_image::{ClipboardImage, ClipboardImageError};

pub type ClipboardImageFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait ClipboardImageSource: Send + Sync {
    fn read_image(&self) -> ClipboardImageFuture<'_, Result<ClipboardImage, ClipboardImageError>>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoteClipboardImageError {
    SessionNotFound,
    SessionNotConnected,
    TerminalUnavailable,
    SftpUnavailable,
    TemporaryDirectoryUnavailable,
    UploadFailed,
}

pub trait RemoteClipboardImageStore: Send + Sync {
    fn store_image<'a>(
        &'a self,
        session_id: &'a str,
        png: Vec<u8>,
    ) -> ClipboardImageFuture<'a, Result<String, RemoteClipboardImageError>>;
}
