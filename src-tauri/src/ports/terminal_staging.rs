use std::{future::Future, path::PathBuf, pin::Pin, sync::Arc};

use crate::domain::terminal_staging::{TerminalStagingError, TerminalStagingEvent};

pub type TerminalStagingFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
pub type TerminalStagingSink = Arc<dyn Fn(TerminalStagingEvent) + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StagingSourceEntry {
    pub path: PathBuf,
    pub display_name: String,
    pub extension: Option<String>,
    pub cleanup_after: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClipboardPayload {
    Empty,
    Text(String),
    Entries(Vec<StagingSourceEntry>),
}

pub trait ClipboardPayloadSource: Send + Sync {
    fn read_payload(
        &self,
    ) -> TerminalStagingFuture<'_, Result<ClipboardPayload, TerminalStagingError>>;
}

pub trait RemoteTerminalStagingStore: Send + Sync {
    fn start(
        &self,
        session_id: &str,
        entries: Vec<StagingSourceEntry>,
        events: TerminalStagingSink,
    ) -> Result<String, TerminalStagingError>;

    fn cancel(&self, session_id: &str, task_id: &str) -> Result<(), TerminalStagingError>;
}
