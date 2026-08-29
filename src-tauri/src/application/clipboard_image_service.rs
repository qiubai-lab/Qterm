use crate::{
    domain::clipboard_image::ClipboardImageError,
    ports::clipboard_image::{
        ClipboardImageSource, RemoteClipboardImageError, RemoteClipboardImageStore,
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipboardImagePasteResult {
    pub remote_path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardImagePasteError {
    Clipboard(ClipboardImageError),
    Remote(RemoteClipboardImageError),
}

pub async fn paste_remote_clipboard_image<S, R>(
    source: &S,
    remote: &R,
    session_id: &str,
) -> Result<ClipboardImagePasteResult, ClipboardImagePasteError>
where
    S: ClipboardImageSource,
    R: RemoteClipboardImageStore,
{
    let image = source
        .read_image()
        .await
        .map_err(ClipboardImagePasteError::Clipboard)?;
    let width = image.width();
    let height = image.height();
    let remote_path = remote
        .store_image(session_id, image.into_png())
        .await
        .map_err(ClipboardImagePasteError::Remote)?;
    Ok(ClipboardImagePasteResult {
        remote_path,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::{
        domain::clipboard_image::ClipboardImage,
        ports::clipboard_image::{ClipboardImageFuture, RemoteClipboardImageError},
    };

    struct FakeSource(Result<ClipboardImage, ClipboardImageError>);

    impl ClipboardImageSource for FakeSource {
        fn read_image(
            &self,
        ) -> ClipboardImageFuture<'_, Result<ClipboardImage, ClipboardImageError>> {
            Box::pin(async { self.0.clone() })
        }
    }

    #[derive(Default)]
    struct FakeRemote {
        writes: Arc<Mutex<Vec<(String, usize)>>>,
    }

    impl RemoteClipboardImageStore for FakeRemote {
        fn store_image<'a>(
            &'a self,
            session_id: &'a str,
            png: Vec<u8>,
        ) -> ClipboardImageFuture<'a, Result<String, RemoteClipboardImageError>> {
            Box::pin(async move {
                self.writes
                    .lock()
                    .expect("writes")
                    .push((session_id.to_owned(), png.len()));
                Ok("/tmp/.qterm-clipboard-session/image.png".into())
            })
        }
    }

    fn image() -> ClipboardImage {
        ClipboardImage::new(2, 1, vec![137, 80, 78, 71, 13, 10, 26, 10]).expect("image")
    }

    #[tokio::test]
    async fn uploads_validated_png_and_returns_only_path_and_dimensions() {
        let remote = FakeRemote::default();
        let result = paste_remote_clipboard_image(&FakeSource(Ok(image())), &remote, "session-1")
            .await
            .expect("paste");
        assert_eq!(
            result.remote_path,
            "/tmp/.qterm-clipboard-session/image.png"
        );
        assert_eq!((result.width, result.height), (2, 1));
        assert_eq!(
            remote.writes.lock().expect("writes").as_slice(),
            &[("session-1".into(), 8)]
        );
    }

    #[tokio::test]
    async fn clipboard_failure_performs_no_remote_write() {
        let remote = FakeRemote::default();
        let result = paste_remote_clipboard_image(
            &FakeSource(Err(ClipboardImageError::TooLarge)),
            &remote,
            "session-1",
        )
        .await;
        assert_eq!(
            result,
            Err(ClipboardImagePasteError::Clipboard(
                ClipboardImageError::TooLarge
            ))
        );
        assert!(remote.writes.lock().expect("writes").is_empty());
    }
}
