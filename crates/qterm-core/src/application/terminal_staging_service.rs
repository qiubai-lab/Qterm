use crate::{
    domain::terminal_staging::{
        LocalTerminalPathStyle, TerminalStagingError, TerminalStagingEvent,
        format_local_terminal_paths,
    },
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

    #[tokio::test]
    async fn local_entries_become_paste_text_without_deleting_any_source() {
        let directory = tempfile::tempdir().expect("tempdir");
        let existing = directory.path().join("existing model.bin");
        let generated = directory.path().join("generated.png");
        std::fs::write(&existing, b"model").expect("existing fixture");
        std::fs::write(&generated, b"png").expect("generated fixture");

        let result = prepare_local_terminal_clipboard_paste(
            &FakeSource(ClipboardPayload::Entries(vec![
                StagingSourceEntry {
                    path: existing.clone(),
                    display_name: "existing model.bin".into(),
                    extension: Some("bin".into()),
                    cleanup_after: false,
                },
                StagingSourceEntry {
                    path: generated.clone(),
                    display_name: "clipboard.png".into(),
                    extension: Some("png".into()),
                    cleanup_after: true,
                },
            ])),
            LocalTerminalPathStyle::Posix,
        )
        .await
        .expect("local paste");

        let LocalTerminalClipboardPaste::Paths {
            text,
            display_name,
            item_count,
        } = result
        else {
            panic!("expected local paths");
        };
        assert!(text.contains("existing model.bin"));
        assert!(text.contains("generated.png"));
        assert_eq!(display_name, "2 个项目");
        assert_eq!(item_count, 2);
        assert!(existing.exists());
        assert!(generated.exists());
    }

    #[tokio::test]
    async fn local_text_and_empty_payloads_preserve_the_existing_paste_modes() {
        assert_eq!(
            prepare_local_terminal_clipboard_paste(
                &FakeSource(ClipboardPayload::Text("plain text".into())),
                LocalTerminalPathStyle::Posix,
            )
            .await,
            Ok(LocalTerminalClipboardPaste::Text("plain text".into()))
        );
        assert_eq!(
            prepare_local_terminal_clipboard_paste(
                &FakeSource(ClipboardPayload::Empty),
                LocalTerminalPathStyle::Posix,
            )
            .await,
            Ok(LocalTerminalClipboardPaste::Empty)
        );
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LocalTerminalClipboardPaste {
    Empty,
    Text(String),
    Paths {
        text: String,
        display_name: String,
        item_count: usize,
    },
}

pub async fn prepare_local_terminal_clipboard_paste<S>(
    source: &S,
    style: LocalTerminalPathStyle,
) -> Result<LocalTerminalClipboardPaste, TerminalStagingError>
where
    S: ClipboardPayloadSource,
{
    match source.read_payload().await? {
        ClipboardPayload::Empty => Ok(LocalTerminalClipboardPaste::Empty),
        ClipboardPayload::Text(text) => Ok(LocalTerminalClipboardPaste::Text(text)),
        ClipboardPayload::Entries(entries) => {
            let item_count = entries.len();
            if item_count == 0 {
                return Ok(LocalTerminalClipboardPaste::Empty);
            }
            let text = format_local_terminal_paths(
                entries.iter().map(|entry| entry.path.as_path()),
                style,
            )?;
            let display_name = if item_count == 1 {
                entries[0].display_name.clone()
            } else {
                format!("{item_count} 个项目")
            };
            Ok(LocalTerminalClipboardPaste::Paths {
                text,
                display_name,
                item_count,
            })
        }
    }
}
