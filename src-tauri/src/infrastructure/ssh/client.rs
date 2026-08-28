mod handler;
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
    list_remote_directory, mutate_remote_entry, read_remote_file, run_transfer,
    write_remote_text_file,
};

use std::{
    collections::{HashMap, VecDeque},
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
            HostEndpoint, HostKeyCheck, PresentedHostKey, RouteNodeMetadata, RouteNodeRole,
            RouteStage, SessionEvent, SessionFailure, SessionState, SessionStateMachine,
            TerminalSize,
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

impl SshSessionManager {
    pub fn new(repository: JsonKnownHostRepository, shell_cache: JsonRemoteShellCache) -> Self {
        Self {
            host_keys: Arc::new(HostKeyService::new(repository)),
            shell_cache: Arc::new(shell_cache),
            sessions: Mutex::new(HashMap::new()),
            finished: Mutex::new(VecDeque::new()),
        }
    }

    pub fn connect(self: &Arc<Self>, request: SessionConnectRequest, events: EventSink) -> String {
        let id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        let (control_sender, control_receiver) = mpsc::channel(128);
        let route_length = request.route.len();
        let entry = Arc::new(SessionEntry::new(
            request
                .route
                .last()
                .map(|node| node.metadata(route_length - 1, route_length))
                .expect("validated session route"),
            request.purpose,
            request.profile_id.clone(),
            events,
            cancel_sender,
            control_sender,
        ));
        entry.emit(SessionEvent::StateChanged(SessionState::Connecting));
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id.clone(), Arc::clone(&entry));

        let host_keys = Arc::clone(&self.host_keys);
        let shell_cache = Arc::clone(&self.shell_cache);
        let manager = Arc::clone(self);
        let task_id = id.clone();
        tauri::async_runtime::spawn(async move {
            run_session(
                entry,
                host_keys,
                shell_cache,
                request,
                cancel_receiver,
                control_receiver,
            )
            .await;
            manager.finish(&task_id);
        });
        id
    }

    pub fn accept_host_key(&self, id: &str) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        let pending = entry
            .take_pending()
            .ok_or(SessionControlError::NoHostKeyDecision)?;
        if self
            .host_keys
            .accept(&pending.endpoint, &pending.key)
            .is_err()
        {
            entry.fail_at(
                SessionFailure::KnownHostsUnavailable,
                pending.node,
                RouteStage::VerifyHostKey,
            );
            let _ = pending.decision.send(HostKeyDecision::Cancel);
            return Err(SessionControlError::KnownHostsUnavailable);
        }
        pending
            .decision
            .send(HostKeyDecision::Accept)
            .map_err(|_| SessionControlError::SessionFinished)
    }

    pub fn reject_host_key(&self, id: &str) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        let pending = entry
            .take_pending()
            .ok_or(SessionControlError::NoHostKeyDecision)?;
        pending
            .decision
            .send(HostKeyDecision::Reject)
            .map_err(|_| SessionControlError::SessionFinished)
    }

    pub fn close(&self, id: &str) -> Result<(), SessionControlError> {
        match self.entry(id) {
            Ok(entry) => {
                entry.begin_close();
                Ok(())
            }
            Err(SessionControlError::SessionNotFound)
                if self
                    .finished
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .iter()
                    .any(|finished| finished == id) =>
            {
                Ok(())
            }
            Err(error) => Err(error),
        }
    }

    pub fn close_profile_network_sessions(&self, profile_id: &str) -> usize {
        let entries = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .filter(|entry| {
                entry.purpose == SessionPurpose::Network
                    && entry.profile_id.as_deref() == Some(profile_id)
            })
            .cloned()
            .collect::<Vec<_>>();
        for entry in &entries {
            entry.begin_close();
        }
        entries.len()
    }

    pub fn close_all_network_sessions(&self) -> usize {
        let entries = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .filter(|entry| entry.purpose == SessionPurpose::Network)
            .cloned()
            .collect::<Vec<_>>();
        for entry in &entries {
            entry.begin_close();
        }
        entries.len()
    }

    pub fn write(&self, id: &str, data: Vec<u8>) -> Result<(), SessionControlError> {
        if data.is_empty() || data.len() > 64 * 1024 {
            return Err(SessionControlError::InvalidTerminalInput);
        }
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Terminal {
            return Err(SessionControlError::TerminalUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        entry
            .control
            .try_send(SessionControl::Write(data))
            .map_err(|_| SessionControlError::ControlQueueUnavailable)
    }

    pub fn resize(&self, id: &str, size: TerminalSize) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Terminal {
            return Err(SessionControlError::TerminalUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        entry
            .control
            .try_send(SessionControl::Resize(size))
            .map_err(|_| SessionControlError::ControlQueueUnavailable)
    }

    pub async fn start_network_rule(
        &self,
        id: &str,
        rule_id: String,
        rule_profile_id: &str,
        kind: ForwardRuleKind,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Network {
            return Err(SessionControlError::NetworkUnavailable);
        }
        if entry.profile_id.as_deref() != Some(rule_profile_id) {
            return Err(SessionControlError::NetworkUnavailable);
        }
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::StartNetworkRule {
                rule_id,
                kind,
                reply,
            })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::SessionFinished)?
    }

    pub async fn stop_network_rule(
        &self,
        id: &str,
        rule_id: String,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(id)?;
        if entry.purpose != SessionPurpose::Network {
            return Err(SessionControlError::NetworkUnavailable);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::StopNetworkRule { rule_id, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::SessionFinished)?
    }

    pub fn start_transfer(
        &self,
        session_id: &str,
        request: TransferRequest,
        events: TransferSink,
    ) -> Result<String, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        entry.register_transfer(id.clone(), cancel_sender);
        if entry
            .control
            .try_send(SessionControl::StartTransfer {
                id: id.clone(),
                request,
                events,
                cancel: cancel_receiver,
            })
            .is_err()
        {
            entry.cancel_transfer(&id);
            return Err(SessionControlError::ControlQueueUnavailable);
        }
        Ok(id)
    }

    pub fn cancel_transfer(
        &self,
        session_id: &str,
        transfer_id: &str,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(session_id)?;
        entry
            .cancel_transfer(transfer_id)
            .ok_or(SessionControlError::TransferNotFound)
    }

    pub async fn list_directory(
        &self,
        session_id: &str,
        path: RemotePath,
    ) -> Result<DirectoryListing, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::ListDirectory { path, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::DirectoryUnavailable)?
            .map_err(|_| SessionControlError::DirectoryUnavailable)
    }

    pub async fn read_file(
        &self,
        session_id: &str,
        path: RemotePath,
        limit: u64,
    ) -> Result<FileDocument, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::ReadFile { path, limit, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }

    pub async fn write_text_file(
        &self,
        session_id: &str,
        path: RemotePath,
        text: String,
        expected_revision: String,
    ) -> Result<FileDocument, SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::WriteTextFile {
                path,
                text,
                expected_revision,
                reply,
            })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }

    pub async fn copy_file(
        &self,
        session_id: &str,
        path: RemotePath,
        target_name: String,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Copy { path, target_name })
            .await
    }

    pub async fn create_entry(
        &self,
        session_id: &str,
        directory: RemotePath,
        name: String,
        is_directory: bool,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(
            session_id,
            RemoteMutation::Create {
                directory,
                name,
                is_directory,
            },
        )
        .await
    }

    pub async fn rename_entry(
        &self,
        session_id: &str,
        path: RemotePath,
        target_name: String,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Rename { path, target_name })
            .await
    }

    pub async fn delete_entry(
        &self,
        session_id: &str,
        path: RemotePath,
    ) -> Result<(), SessionControlError> {
        self.mutate_entry(session_id, RemoteMutation::Delete { path })
            .await
    }

    async fn mutate_entry(
        &self,
        session_id: &str,
        request: RemoteMutation,
    ) -> Result<(), SessionControlError> {
        let entry = self.entry(session_id)?;
        if entry.state() != SessionState::Connected {
            return Err(SessionControlError::SessionNotConnected);
        }
        let (reply, response) = oneshot::channel();
        entry
            .control
            .try_send(SessionControl::MutateEntry { request, reply })
            .map_err(|_| SessionControlError::ControlQueueUnavailable)?;
        response
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
    }

    fn entry(&self, id: &str) -> Result<Arc<SessionEntry>, SessionControlError> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
            .cloned()
            .ok_or(SessionControlError::SessionNotFound)
    }

    fn finish(&self, id: &str) {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
        let mut finished = self
            .finished
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        finished.push_back(id.to_owned());
        if finished.len() > 256 {
            finished.pop_front();
        }
    }
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
