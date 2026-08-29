use crate::{
    domain::terminal_staging::{TerminalStagingError, TerminalStagingEvent},
    ports::terminal_staging::{
        ClipboardPayload, ClipboardPayloadSource, RemoteTerminalStagingStore, TerminalStagingSink,
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalClipboardPasteStart {
    Empty,
    Text(String),
    Transfer { task_id: String },
}

pub async fn start_terminal_clipboard_paste<S, R>(
    source: &S,
    remote: &R,
    session_id: &str,
    events: TerminalStagingSink,
) -> Result<TerminalClipboardPasteStart, TerminalStagingError>
where
    S: ClipboardPayloadSource,
    R: RemoteTerminalStagingStore,
{
    events(TerminalStagingEvent::Preparing);
    match source.read_payload().await? {
        ClipboardPayload::Empty => Ok(TerminalClipboardPasteStart::Empty),
        ClipboardPayload::Text(text) => Ok(TerminalClipboardPasteStart::Text(text)),
        ClipboardPayload::Entries(entries) => {
            let cleanup_paths = entries
                .iter()
                .filter(|entry| entry.cleanup_after)
                .map(|entry| entry.path.clone())
                .collect::<Vec<_>>();
            match remote.start(session_id, entries, events) {
                Ok(task_id) => Ok(TerminalClipboardPasteStart::Transfer { task_id }),
                Err(error) => {
                    for path in cleanup_paths {
                        let _ = std::fs::remove_file(path);
                    }
                    Err(error)
                }
            }
        }
    }
}

pub fn cancel_terminal_clipboard_paste<R>(
    remote: &R,
    session_id: &str,
    task_id: &str,
) -> Result<(), TerminalStagingError>
where
    R: RemoteTerminalStagingStore,
{
    remote.cancel(session_id, task_id)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::ports::terminal_staging::{StagingSourceEntry, TerminalStagingFuture};

    struct FakeSource(ClipboardPayload);

    impl ClipboardPayloadSource for FakeSource {
        fn read_payload(
            &self,
        ) -> TerminalStagingFuture<'_, Result<ClipboardPayload, TerminalStagingError>> {
            Box::pin(async { Ok(self.0.clone()) })
        }
    }

    #[derive(Default)]
    struct FakeRemote {
        starts: Mutex<Vec<(String, Vec<StagingSourceEntry>)>>,
        fail_start: bool,
    }

    impl RemoteTerminalStagingStore for FakeRemote {
        fn start(
            &self,
            session_id: &str,
            entries: Vec<StagingSourceEntry>,
            _events: TerminalStagingSink,
        ) -> Result<String, TerminalStagingError> {
            if self.fail_start {
                return Err(TerminalStagingError::UploadFailed);
            }
            self.starts
                .lock()
                .expect("starts")
                .push((session_id.into(), entries));
            Ok("task-1".into())
        }

        fn cancel(&self, _session_id: &str, _task_id: &str) -> Result<(), TerminalStagingError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn text_and_empty_payloads_perform_no_remote_file_write() {
        let remote = FakeRemote::default();
        let events = Arc::new(|_: TerminalStagingEvent| {});
        assert_eq!(
            start_terminal_clipboard_paste(
                &FakeSource(ClipboardPayload::Text("text".into())),
                &remote,
                "session-1",
                events.clone(),
            )
            .await,
            Ok(TerminalClipboardPasteStart::Text("text".into()))
        );
        assert_eq!(
            start_terminal_clipboard_paste(
                &FakeSource(ClipboardPayload::Empty),
                &remote,
                "session-1",
                events,
            )
            .await,
            Ok(TerminalClipboardPasteStart::Empty)
        );
        assert!(remote.starts.lock().expect("starts").is_empty());
    }

    #[tokio::test]
    async fn native_entries_start_an_opaque_remote_task() {
        let remote = FakeRemote::default();
        let entry = StagingSourceEntry {
            path: "C:/private/photo.png".into(),
            display_name: "photo.png".into(),
            extension: Some("png".into()),
            cleanup_after: false,
        };
        let result = start_terminal_clipboard_paste(
            &FakeSource(ClipboardPayload::Entries(vec![entry.clone()])),
            &remote,
            "session-1",
            Arc::new(|_: TerminalStagingEvent| {}),
        )
        .await;
        assert_eq!(
            result,
            Ok(TerminalClipboardPasteStart::Transfer {
                task_id: "task-1".into()
            })
        );
        assert_eq!(
            remote.starts.lock().expect("starts").as_slice(),
            &[("session-1".into(), vec![entry])]
        );
    }

    #[tokio::test]
    async fn generated_local_sources_are_removed_when_remote_start_fails() {
        let directory = tempfile::tempdir().expect("tempdir");
        let generated = directory.path().join("clipboard.png");
        std::fs::write(&generated, b"png").expect("fixture");
        let remote = FakeRemote {
            fail_start: true,
            ..FakeRemote::default()
        };
        let result = start_terminal_clipboard_paste(
            &FakeSource(ClipboardPayload::Entries(vec![StagingSourceEntry {
                path: generated.clone(),
                display_name: "clipboard.png".into(),
                extension: Some("png".into()),
                cleanup_after: true,
            }])),
            &remote,
            "session-1",
            Arc::new(|_: TerminalStagingEvent| {}),
        )
        .await;

        assert_eq!(result, Err(TerminalStagingError::UploadFailed));
        assert!(!generated.exists());
    }
}
