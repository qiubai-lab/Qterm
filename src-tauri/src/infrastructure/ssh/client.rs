mod git;
mod handler;
mod manager_control;
mod manager_core;
mod manager_files;
mod manager_ports;
mod network;
mod session;
mod shell_integration;
mod transfer;

use handler::ClientHandler;
use network::{NetworkForwardRuntime, run_network_session};
use session::run_session;
#[cfg(test)]
use transfer::scan_local_upload_entries;
use transfer::{
    cleanup_clipboard_directories, list_remote_directory, mutate_remote_entry, read_remote_file,
    run_terminal_staging, run_transfer, write_remote_text_file,
};

use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use russh::{
    Channel, ChannelMsg, ChannelOpenFailure, Disconnect,
    client::{self, ChannelOpenHandle, Config, Handler, Msg},
    keys::{HashAlg, PublicKey},
};
use russh_sftp::{client::SftpSession, protocol::FileAttributes};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use crate::{
    application::host_key_service::HostKeyService,
    domain::{
        auth::AuthRequest,
        files::{DirectoryListing, FileDocument, FileEntry, content_revision},
        network::ForwardRuleKind,
        session::{
            HostEndpoint, HostKeyCheck, InitialDirectory, PresentedHostKey, RouteNodeMetadata,
            RouteNodeRole, RouteStage, SessionEvent, SessionFailure, SessionState,
            SessionStateMachine, TerminalSize,
        },
        terminal_staging::{
            STAGING_DIRECTORY_MODE, STAGING_FILE_MODE, STAGING_HOME_TTL_SECS, TerminalStagingError,
            TerminalStagingEvent,
        },
        transfer::{RemotePath, TransferEvent},
    },
    infrastructure::{
        persistence::{
            json_known_host_repository::JsonKnownHostRepository,
            json_remote_shell_cache::JsonRemoteShellCache,
        },
        ssh::{
            auth::authenticate,
            forwarding::{
                DirectConnection, ForwardPermits, ForwardTaskRegistry,
                MAX_ACTIVE_FORWARD_CONNECTIONS, RemoteForwardMap, RunningListener,
                abort_forward_tasks, acknowledge_socks5, new_forward_permits,
                pump_forwarded_channel, pump_tcp_channel, remote_target, spawn_forward_task,
                start_listener,
            },
        },
    },
    ports::remote_git_executor::RemoteGitExecutor,
    ports::terminal_staging::{
        RemoteTerminalStagingStore, StagingSourceEntry, TerminalStagingSink,
    },
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const HOST_KEY_DECISION_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_DIRECTORY_DOWNLOAD_ENTRIES: usize = 100_000;
const MAX_DIRECTORY_DOWNLOAD_DEPTH: usize = 128;

pub struct SessionConnectRequest {
    pub route: Vec<SessionRouteNode>,
    pub purpose: SessionPurpose,
    pub profile_id: Option<String>,
    pub terminal_size: Option<TerminalSize>,
    pub initial_directory: Option<InitialDirectory>,
    pub terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
    pub remote_shell_integration_enabled: bool,
}

pub struct SessionRouteNode {
    pub profile_id: String,
    pub name: String,
    pub endpoint: HostEndpoint,
    pub username: String,
    pub auth: AuthRequest,
}

impl SessionRouteNode {
    fn metadata(&self, index: usize, total: usize) -> RouteNodeMetadata {
        RouteNodeMetadata {
            profile_id: self.profile_id.clone(),
            name: self.name.clone(),
            endpoint: self.endpoint.clone(),
            index,
            total,
            role: if index + 1 == total {
                RouteNodeRole::Target
            } else {
                RouteNodeRole::Jump
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionPurpose {
    Terminal,
    Files,
    Network,
    Git,
}

type EventSink = Arc<dyn Fn(SessionEvent) + Send + Sync>;
type TransferSink = Arc<dyn Fn(TransferEvent) + Send + Sync>;
type KnownHostService = HostKeyService<JsonKnownHostRepository>;

pub struct SshSessionManager {
    host_keys: Arc<KnownHostService>,
    shell_cache: Arc<JsonRemoteShellCache>,
    sessions: Mutex<HashMap<String, Arc<SessionEntry>>>,
    finished: Mutex<VecDeque<String>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionControlError {
    SessionNotFound,
    NoHostKeyDecision,
    KnownHostsUnavailable,
    SessionFinished,
    SessionNotConnected,
    InvalidTerminalInput,
    TerminalUnavailable,
    ControlQueueUnavailable,
    TransferNotFound,
    DirectoryUnavailable,
    FileUnavailable,
    FileTooLarge,
    FileConflict,
    NetworkUnavailable,
}

pub enum TransferRequest {
    Upload {
        local_path: PathBuf,
        remote_path: RemotePath,
    },
    UploadEntries {
        local_paths: Vec<PathBuf>,
        remote_directory: RemotePath,
    },
    Download {
        remote_path: RemotePath,
        local_path: PathBuf,
    },
    DownloadDirectory {
        remote_path: RemotePath,
        local_path: PathBuf,
    },
}

struct SessionEntry {
    target: RouteNodeMetadata,
    purpose: SessionPurpose,
    profile_id: Option<String>,
    state: Mutex<SessionStateMachine>,
    pending: Mutex<Option<PendingHostKey>>,
    cancel: Mutex<Option<oneshot::Sender<()>>>,
    control: mpsc::Sender<SessionControl>,
    transfers: Mutex<HashMap<String, oneshot::Sender<()>>>,
    clipboard_directories: Mutex<HashSet<String>>,
    clipboard_uploads: Mutex<HashMap<String, Option<oneshot::Sender<()>>>>,
    events: EventSink,
}

impl SessionEntry {
    fn new(
        target: RouteNodeMetadata,
        purpose: SessionPurpose,
        profile_id: Option<String>,
        events: EventSink,
        cancel: oneshot::Sender<()>,
        control: mpsc::Sender<SessionControl>,
    ) -> Self {
        Self {
            target,
            purpose,
            profile_id,
            state: Mutex::new(SessionStateMachine::new()),
            pending: Mutex::new(None),
            cancel: Mutex::new(Some(cancel)),
            control,
            transfers: Mutex::new(HashMap::new()),
            clipboard_directories: Mutex::new(HashSet::new()),
            clipboard_uploads: Mutex::new(HashMap::new()),
            events,
        }
    }

    fn emit(&self, event: SessionEvent) {
        (self.events)(event);
    }

    fn transition(&self, next: SessionState) -> bool {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.transition(next).is_ok() {
            drop(state);
            self.emit(SessionEvent::StateChanged(next));
            true
        } else {
            false
        }
    }

    fn state(&self) -> SessionState {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .state()
    }

    fn fail(&self, failure: SessionFailure) {
        self.fail_at(failure, self.target.clone(), RouteStage::StartSession);
    }

    fn fail_at(&self, failure: SessionFailure, node: RouteNodeMetadata, stage: RouteStage) {
        if self.transition(SessionState::Failed) {
            self.emit(SessionEvent::Failed {
                failure,
                node: Some(node),
                stage: Some(stage),
            });
        }
    }

    fn begin_close(&self) {
        if !matches!(self.state(), SessionState::Closed | SessionState::Failed) {
            self.transition(SessionState::Closing);
        }
        if let Some(pending) = self.take_pending() {
            let _ = pending.decision.send(HostKeyDecision::Cancel);
        }
        if let Some(cancel) = self
            .cancel
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
        {
            let _ = cancel.send(());
        }
        let transfers = std::mem::take(
            &mut *self
                .transfers
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        );
        for (_, cancel) in transfers {
            let _ = cancel.send(());
        }
        let clipboard_uploads = std::mem::take(
            &mut *self
                .clipboard_uploads
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        );
        for (_, cancel) in clipboard_uploads {
            if let Some(cancel) = cancel {
                let _ = cancel.send(());
            }
        }
    }

    fn set_pending(&self, pending: PendingHostKey) {
        *self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pending);
    }

    fn take_pending(&self) -> Option<PendingHostKey> {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }

    fn register_transfer(&self, id: String, cancel: oneshot::Sender<()>) {
        self.transfers
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id, cancel);
    }

    fn cancel_transfer(&self, id: &str) -> Option<()> {
        self.transfers
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id)
            .map(|cancel| {
                let _ = cancel.send(());
            })
    }

    fn finish_transfer(&self, id: &str) {
        self.transfers
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
    }

    fn clipboard_directories(&self) -> HashSet<String> {
        self.clipboard_directories
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn register_clipboard_directory(&self, directory: String) {
        self.clipboard_directories
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(directory);
    }

    fn register_clipboard_upload(&self, id: String, cancel: oneshot::Sender<()>) {
        self.clipboard_uploads
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id, Some(cancel));
    }

    fn has_clipboard_uploads(&self) -> bool {
        !self
            .clipboard_uploads
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty()
    }

    fn cancel_clipboard_upload(&self, id: &str) -> bool {
        let mut uploads = self
            .clipboard_uploads
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(cancel) = uploads.get_mut(id) else {
            return false;
        };
        if let Some(cancel) = cancel.take() {
            let _ = cancel.send(());
        }
        true
    }

    fn finish_clipboard_upload(&self, id: &str) {
        self.clipboard_uploads
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
    }
}

struct PendingHostKey {
    endpoint: HostEndpoint,
    node: RouteNodeMetadata,
    key: PresentedHostKey,
    decision: oneshot::Sender<HostKeyDecision>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HostKeyDecision {
    Accept,
    Reject,
    Cancel,
}

enum SessionControl {
    Write(Vec<u8>),
    Resize(TerminalSize),
    StoreTerminalStaging {
        upload_id: String,
        session_token: String,
        sources: Vec<StagingSourceEntry>,
        events: TerminalStagingSink,
        cancel: oneshot::Receiver<()>,
    },
    StartTransfer {
        id: String,
        request: TransferRequest,
        events: TransferSink,
        cancel: oneshot::Receiver<()>,
    },
    ListDirectory {
        path: RemotePath,
        reply: oneshot::Sender<Result<DirectoryListing, ()>>,
    },
    ReadFile {
        path: RemotePath,
        limit: u64,
        reply: oneshot::Sender<Result<FileDocument, SessionControlError>>,
    },
    WriteTextFile {
        path: RemotePath,
        text: String,
        expected_revision: String,
        reply: oneshot::Sender<Result<FileDocument, SessionControlError>>,
    },
    MutateEntry {
        request: RemoteMutation,
        reply: oneshot::Sender<Result<(), SessionControlError>>,
    },
    StartNetworkRule {
        rule_id: String,
        kind: ForwardRuleKind,
        reply: oneshot::Sender<Result<(), SessionControlError>>,
    },
    StopNetworkRule {
        rule_id: String,
        reply: oneshot::Sender<Result<(), SessionControlError>>,
    },
    RunGit {
        action: crate::domain::git::RemoteGitAction,
        reply:
            oneshot::Sender<Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError>>,
    },
    RunGitCommitFiles {
        repository: String,
        oid: String,
        reply: oneshot::Sender<
            Result<Vec<crate::domain::git::GitCommitFile>, crate::domain::git::GitError>,
        >,
    },
    RunGitCommitFileDiff {
        repository: String,
        oid: String,
        path: String,
        reply: oneshot::Sender<
            Result<crate::domain::git::GitCommitFileDiff, crate::domain::git::GitError>,
        >,
    },
    RunGitConflictDetail {
        repository: String,
        path: String,
        reply: oneshot::Sender<
            Result<crate::domain::git::GitConflictDetail, crate::domain::git::GitError>,
        >,
    },
    RunGitChangeDiff {
        repository: String,
        path: String,
        staged: bool,
        reply: oneshot::Sender<
            Result<crate::domain::git::GitChangeDiff, crate::domain::git::GitError>,
        >,
    },
    RunGitResolveConflict {
        repository: String,
        path: String,
        resolution: crate::domain::git::GitConflictResolution,
        reply:
            oneshot::Sender<Result<crate::domain::git::GitSnapshot, crate::domain::git::GitError>>,
    },
}

enum RemoteMutation {
    Create {
        directory: RemotePath,
        name: String,
        is_directory: bool,
    },
    Copy {
        path: RemotePath,
        target_name: String,
    },
    Rename {
        path: RemotePath,
        target_name: String,
    },
    Delete {
        path: RemotePath,
    },
}

#[cfg(test)]
mod tests;
