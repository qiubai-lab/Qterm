use base64::{Engine, engine::general_purpose::STANDARD};
use webview2_com::{CapturePreviewCompletedHandler, Microsoft::Web::WebView2::Win32::*};
use windows::Win32::{
    System::Com::{IStream, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET},
    UI::Shell::SHCreateMemStream,
};

const MAX_BYTES: u64 = 16 * 1024 * 1024;

pub(super) async fn capture(view: &tauri::Webview) -> Result<String, String> {
    let size = view.size().map_err(|_| "网页已关闭")?;
    if u64::from(size.width) * u64::from(size.height) > MAX_BYTES {
        return Err("网页预览尺寸过大".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_webview(move |native| {
        let send = std::sync::Arc::new(std::sync::Mutex::new(Some(send)));
        let callback = send.clone();
        let result = (|| unsafe {
            let stream = SHCreateMemStream(None).ok_or_else(windows::core::Error::from_win32)?;
            let output = stream.clone();
            native.controller().CoreWebView2()?.CapturePreview(
                COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                &stream,
                &CapturePreviewCompletedHandler::create(Box::new(move |result| {
                    let result = result
                        .map_err(|_| "网页预览暂不可用".to_owned())
                        .and_then(|_| read_preview(&output));
                    if let Some(send) = callback.lock().unwrap_or_else(|p| p.into_inner()).take() {
                        let _ = send.send(result);
                    }
                    Ok(())
                })),
            )
        })();
        if result.is_err()
            && let Some(send) = send.lock().unwrap_or_else(|p| p.into_inner()).take()
        {
            let _ = send.send(Err("网页预览暂不可用".to_owned()));
        }
    })
    .map_err(|_| "无法访问网页预览")?;
    tokio::time::timeout(std::time::Duration::from_millis(1500), receive)
        .await
        .map_err(|_| "网页预览超时".to_owned())?
        .map_err(|_| "网页预览已取消".to_owned())?
}

unsafe fn read_preview(stream: &IStream) -> Result<String, String> {
    unsafe {
        let mut stat = STATSTG::default();
        stream
            .Stat(&mut stat, STATFLAG_NONAME)
            .map_err(|_| "无法读取预览")?;
        if stat.cbSize == 0 || stat.cbSize > MAX_BYTES {
            return Err("网页预览尺寸无效".into());
        }
        stream
            .Seek(0, STREAM_SEEK_SET, None)
            .map_err(|_| "无法读取预览")?;
        let mut bytes = vec![0_u8; stat.cbSize as usize];
        let mut read = 0;
        stream
            .Read(
                bytes.as_mut_ptr().cast(),
                bytes.len() as u32,
                Some(&mut read),
            )
            .ok()
            .map_err(|_| "无法读取预览")?;
        if read as usize != bytes.len() {
            return Err("网页预览不完整".into());
        }
        Ok(STANDARD.encode(&bytes))
    }
}
