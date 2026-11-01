use super::*;

mod files;
mod staging;
mod upload;

use files::delete_remote_entry;
pub(super) use files::{
    list_remote_directory, mutate_remote_entry, read_remote_file, write_remote_text_file,
};
pub(super) use staging::{cleanup_clipboard_directories, run_terminal_staging};
#[cfg(test)]
pub(super) use upload::scan_local_upload_entries;
use upload::{
    LocalUploadFile, TransferOutcome, download_directory, download_file, remote_child_path,
    safe_remote_component, upload_entries, upload_file,
};

pub(super) async fn run_transfer<S>(
    stream: S,
    request: TransferRequest,
    events: TransferSink,
    mut cancel: oneshot::Receiver<()>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = match SftpSession::new(stream).await {
        Ok(session) => session,
        Err(_) => {
            events(TransferEvent::Failed);
            return;
        }
    };
    let result = match request {
        TransferRequest::Upload {
            local_path,
            remote_path,
        } => upload_file(&sftp, local_path, remote_path, &events, &mut cancel).await,
        TransferRequest::UploadEntries {
            local_paths,
            remote_directory,
        } => upload_entries(&sftp, local_paths, remote_directory, &events, &mut cancel).await,
        TransferRequest::Download {
            remote_path,
            local_path,
        } => download_file(&sftp, remote_path, local_path, &events, &mut cancel).await,
        TransferRequest::DownloadDirectory {
            remote_path,
            local_path,
        } => download_directory(&sftp, remote_path, local_path, &events, &mut cancel).await,
    };
    match result {
        Ok(TransferOutcome::Completed) => events(TransferEvent::Completed),
        Ok(TransferOutcome::Cancelled) => events(TransferEvent::Cancelled),
        Err(()) => events(TransferEvent::Failed),
    }
    let _ = sftp.close().await;
}
