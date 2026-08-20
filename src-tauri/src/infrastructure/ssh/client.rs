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
            HostEndpoint, HostKeyCheck, PresentedHostKey, SessionEvent, SessionFailure,
            SessionState, SessionStateMachine, TerminalSize,
        },
        transfer::{RemotePath, TransferEvent},
    },
    infrastructure::{
        persistence::json_known_host_repository::JsonKnownHostRepository,
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
    pub endpoint: HostEndpoint,
    pub username: String,
    pub auth: AuthRequest,
    pub purpose: SessionPurpose,
    pub profile_id: Option<String>,
    pub terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
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
    sessions: Mutex<HashMap<String, Arc<SessionEntry>>>,
    finished: Mutex<VecDeque<String>>,
}

impl SshSessionManager {
    pub fn new(repository: JsonKnownHostRepository) -> Self {
        Self {
            host_keys: Arc::new(HostKeyService::new(repository)),
            sessions: Mutex::new(HashMap::new()),
            finished: Mutex::new(VecDeque::new()),
        }
    }

    pub fn connect(self: &Arc<Self>, request: SessionConnectRequest, events: EventSink) -> String {
        let id = Uuid::new_v4().to_string();
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        let (control_sender, control_receiver) = mpsc::channel(128);
        let entry = Arc::new(SessionEntry::new(
            request.endpoint.clone(),
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
        let manager = Arc::clone(self);
        let task_id = id.clone();
        tauri::async_runtime::spawn(async move {
            run_session(entry, host_keys, request, cancel_receiver, control_receiver).await;
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
            .accept(&entry.endpoint, &pending.key)
            .is_err()
        {
            entry.fail(SessionFailure::KnownHostsUnavailable);
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
    endpoint: HostEndpoint,
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
        endpoint: HostEndpoint,
        purpose: SessionPurpose,
        profile_id: Option<String>,
        events: EventSink,
        cancel: oneshot::Sender<()>,
        control: mpsc::Sender<SessionControl>,
    ) -> Self {
        Self {
            endpoint,
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
        if self.transition(SessionState::Failed) {
            self.emit(SessionEvent::Failed(failure));
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

struct ClientHandler {
    entry: Arc<SessionEntry>,
    host_keys: Arc<KnownHostService>,
    remote_forwards: RemoteForwardMap,
    forward_tasks: ForwardTaskRegistry,
    forward_permits: ForwardPermits,
}

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, public_key: &PublicKey) -> Result<bool, Self::Error> {
        let presented = PresentedHostKey::new(
            public_key.algorithm().to_string(),
            public_key.to_openssh().map_err(russh::Error::from)?,
            public_key.fingerprint(HashAlg::Sha256).to_string(),
        );
        match self.host_keys.check(&self.entry.endpoint, &presented) {
            Ok(HostKeyCheck::Trusted) => Ok(true),
            Ok(HostKeyCheck::Changed {
                trusted_fingerprint,
            }) => {
                self.entry.emit(SessionEvent::HostKeyChanged {
                    trusted_fingerprint,
                    presented_fingerprint: presented.fingerprint().to_owned(),
                });
                self.entry.fail(SessionFailure::HostKeyChanged);
                Ok(false)
            }
            Ok(HostKeyCheck::Unknown) => {
                self.entry.transition(SessionState::AwaitingHostKey);
                self.entry.emit(SessionEvent::HostKeyConfirmationRequired {
                    algorithm: presented.algorithm().to_owned(),
                    fingerprint: presented.fingerprint().to_owned(),
                });
                let (sender, receiver) = oneshot::channel();
                self.entry.set_pending(PendingHostKey {
                    key: presented,
                    decision: sender,
                });
                match tokio::time::timeout(HOST_KEY_DECISION_TIMEOUT, receiver).await {
                    Ok(Ok(HostKeyDecision::Accept)) => Ok(true),
                    Ok(Ok(HostKeyDecision::Reject)) => {
                        self.entry.fail(SessionFailure::HostKeyRejected);
                        Ok(false)
                    }
                    Ok(Ok(HostKeyDecision::Cancel)) => Ok(false),
                    _ => {
                        self.entry.take_pending();
                        self.entry.fail(SessionFailure::HostKeyDecisionTimeout);
                        Ok(false)
                    }
                }
            }
            Err(_) => {
                self.entry.fail(SessionFailure::KnownHostsUnavailable);
                Ok(false)
            }
        }
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if let Some((rule_id, target_host, target_port)) =
            remote_target(&self.remote_forwards, connected_address, connected_port)
        {
            let Ok(permit) = Arc::clone(&self.forward_permits).try_acquire_owned() else {
                reply.reject(ChannelOpenFailure::ResourceShortage).await;
                return Ok(());
            };
            reply.accept().await;
            spawn_forward_task(&self.forward_tasks, rule_id, async move {
                let _permit = permit;
                pump_forwarded_channel(channel, target_host, target_port).await;
            });
        } else {
            reply
                .reject(ChannelOpenFailure::AdministrativelyProhibited)
                .await;
        }
        Ok(())
    }
}

async fn run_session(
    entry: Arc<SessionEntry>,
    host_keys: Arc<KnownHostService>,
    request: SessionConnectRequest,
    mut cancel: oneshot::Receiver<()>,
    mut controls: mpsc::Receiver<SessionControl>,
) {
    let remote_forwards = RemoteForwardMap::default();
    let forward_tasks = ForwardTaskRegistry::default();
    let forward_permits = new_forward_permits();
    let (direct_sender, direct_receiver) = mpsc::channel(MAX_ACTIVE_FORWARD_CONNECTIONS);
    let network_runtime = NetworkForwardRuntime {
        direct_sender,
        direct_receiver,
        remote_forwards,
        forward_tasks,
        forward_permits,
    };
    let config = Arc::new(Config {
        inactivity_timeout: Some(Duration::from_secs(300)),
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        nodelay: true,
        ..Config::default()
    });
    let address = (request.endpoint.host().to_owned(), request.endpoint.port());
    let handler = ClientHandler {
        entry: Arc::clone(&entry),
        host_keys,
        remote_forwards: Arc::clone(&network_runtime.remote_forwards),
        forward_tasks: Arc::clone(&network_runtime.forward_tasks),
        forward_permits: Arc::clone(&network_runtime.forward_permits),
    };
    let connection =
        tokio::time::timeout(CONNECT_TIMEOUT, client::connect(config, address, handler));
    let mut handle = tokio::select! {
        result = connection => match result {
            Ok(Ok(handle)) => handle,
            _ => {
                if entry.state() == SessionState::Closing {
                    entry.transition(SessionState::Closed);
                } else if entry.state() != SessionState::Failed {
                    entry.fail(SessionFailure::ConnectionFailed);
                }
                return;
            }
        },
        _ = &mut cancel => {
            entry.transition(SessionState::Closed);
            return;
        }
    };

    if !entry.transition(SessionState::Authenticating) {
        return;
    }
    let authentication = authenticate(&mut handle, request.username, request.auth);
    tokio::select! {
        result = authentication => match result {
            Ok(_) => {}
            Err(error) => {
                entry.fail(SessionFailure::Authentication(error));
                return;
            }
        },
        _ = &mut cancel => {
            entry.transition(SessionState::Closing);
        }
    }

    if entry.state() != SessionState::Authenticating {
        let _ = handle
            .disconnect(Disconnect::ByApplication, "session closed", "en")
            .await;
        entry.transition(SessionState::Closed);
        return;
    }

    if request.purpose == SessionPurpose::Files {
        entry.transition(SessionState::Connected);
        while entry.state() == SessionState::Connected {
            tokio::select! {
                _ = &mut cancel => {
                    entry.transition(SessionState::Closing);
                }
                control = controls.recv() => match control {
                    Some(SessionControl::StartTransfer { id, request, events, cancel }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                let transfer_entry = Arc::clone(&entry);
                                tauri::async_runtime::spawn(async move {
                                    run_transfer(channel.into_stream(), request, events, cancel).await;
                                    transfer_entry.finish_transfer(&id);
                                });
                            }
                            _ => {
                                events(TransferEvent::Failed);
                                entry.finish_transfer(&id);
                            }
                        }
                    }
                    Some(SessionControl::ListDirectory { path, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = list_remote_directory(channel.into_stream(), path).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => {
                                let _ = reply.send(Err(()));
                            }
                        }
                    }
                    Some(SessionControl::ReadFile { path, limit, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = read_remote_file(channel.into_stream(), path, limit).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::WriteTextFile { path, text, expected_revision, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = write_remote_text_file(channel.into_stream(), path, text, expected_revision).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::MutateEntry { request, reply }) => {
                        match handle.channel_open_session().await {
                            Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                                tauri::async_runtime::spawn(async move {
                                    let result = mutate_remote_entry(channel.into_stream(), request).await;
                                    let _ = reply.send(result);
                                });
                            }
                            _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                        }
                    }
                    Some(SessionControl::Write(_) | SessionControl::Resize(_) | SessionControl::StartNetworkRule { .. } | SessionControl::StopNetworkRule { .. }) => {}
                    None => {
                        entry.transition(SessionState::Closing);
                    }
                }
            }
        }
        let _ = handle
            .disconnect(Disconnect::ByApplication, "file session closed", "en")
            .await;
        entry.transition(SessionState::Closed);
        return;
    }

    if request.purpose == SessionPurpose::Network {
        run_network_session(
            &entry,
            &mut handle,
            &mut cancel,
            &mut controls,
            network_runtime,
        )
        .await;
        return;
    }

    let terminal = match handle.channel_open_session().await {
        Ok(channel) => channel,
        Err(_) => {
            entry.fail(SessionFailure::ConnectionFailed);
            return;
        }
    };
    if terminal
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .is_err()
        || terminal.request_shell(false).await.is_err()
    {
        entry.fail(SessionFailure::ConnectionFailed);
        return;
    }
    let (mut terminal_read, terminal_write) = terminal.split();
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut cancel => {
                entry.transition(SessionState::Closing);
            }
            control = controls.recv() => match control {
                Some(SessionControl::Write(data)) => {
                    if terminal_write.data_bytes(data).await.is_err() {
                        entry.fail(SessionFailure::ConnectionFailed);
                    }
                }
                Some(SessionControl::Resize(size)) => {
                    if terminal_write.window_change(size.columns, size.rows, 0, 0).await.is_err() {
                        entry.fail(SessionFailure::ConnectionFailed);
                    }
                }
                Some(SessionControl::StartTransfer { id, request, events, cancel }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            let transfer_entry = Arc::clone(&entry);
                            tauri::async_runtime::spawn(async move {
                                run_transfer(channel.into_stream(), request, events, cancel).await;
                                transfer_entry.finish_transfer(&id);
                            });
                        }
                        _ => {
                            events(TransferEvent::Failed);
                            entry.finish_transfer(&id);
                        }
                    }
                }
                Some(SessionControl::ListDirectory { path, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = list_remote_directory(channel.into_stream(), path).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => {
                            let _ = reply.send(Err(()));
                        }
                    }
                }
                Some(SessionControl::ReadFile { path, limit, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = read_remote_file(channel.into_stream(), path, limit).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::WriteTextFile { path, text, expected_revision, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = write_remote_text_file(channel.into_stream(), path, text, expected_revision).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::MutateEntry { request, reply }) => {
                    match handle.channel_open_session().await {
                        Ok(channel) if channel.request_subsystem(true, "sftp").await.is_ok() => {
                            tauri::async_runtime::spawn(async move {
                                let result = mutate_remote_entry(channel.into_stream(), request).await;
                                let _ = reply.send(result);
                            });
                        }
                        _ => { let _ = reply.send(Err(SessionControlError::FileUnavailable)); }
                    }
                }
                Some(SessionControl::StartNetworkRule { reply, .. }) | Some(SessionControl::StopNetworkRule { reply, .. }) => {
                    let _ = reply.send(Err(SessionControlError::NetworkUnavailable));
                }
                None => {
                    entry.transition(SessionState::Closing);
                }
            },
            message = terminal_read.wait() => match message {
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    (request.terminal_output)(data.to_vec());
                }
                Some(ChannelMsg::Eof | ChannelMsg::Close) | None => {
                    entry.transition(SessionState::Closing);
                }
                _ => {}
            }
        }
    }
    let _ = terminal_write.eof().await;
    let _ = terminal_write.close().await;
    let _ = handle
        .disconnect(Disconnect::ByApplication, "session closed", "en")
        .await;
    entry.transition(SessionState::Closed);
}

enum RunningNetworkRule {
    Listener(RunningListener),
    Remote { bind_host: String, bind_port: u16 },
}

struct NetworkForwardRuntime {
    direct_sender: mpsc::Sender<DirectConnection>,
    direct_receiver: mpsc::Receiver<DirectConnection>,
    remote_forwards: RemoteForwardMap,
    forward_tasks: ForwardTaskRegistry,
    forward_permits: ForwardPermits,
}

async fn run_network_session(
    entry: &Arc<SessionEntry>,
    handle: &mut client::Handle<ClientHandler>,
    cancel: &mut oneshot::Receiver<()>,
    controls: &mut mpsc::Receiver<SessionControl>,
    mut runtime: NetworkForwardRuntime,
) {
    let mut rules: HashMap<String, RunningNetworkRule> = HashMap::new();
    entry.transition(SessionState::Connected);
    while entry.state() == SessionState::Connected {
        tokio::select! {
            _ = &mut *cancel => { entry.transition(SessionState::Closing); }
            control = controls.recv() => match control {
                Some(SessionControl::StartNetworkRule { rule_id, kind, reply }) => {
                    if rules.contains_key(&rule_id) {
                        let _ = reply.send(Ok(()));
                        continue;
                    }
                    let result = match &kind {
                        ForwardRuleKind::Local { .. } | ForwardRuleKind::Socks5 { .. } => {
                            start_listener(&rule_id, &kind, runtime.direct_sender.clone()).await
                                .map(RunningNetworkRule::Listener)
                                .map_err(|_| SessionControlError::NetworkUnavailable)
                        }
                        ForwardRuleKind::Remote { bind_host, bind_port, target_host, target_port } => {
                            match handle.tcpip_forward(bind_host.clone(), (*bind_port).into()).await {
                                Ok(_) => {
                                    runtime.remote_forwards
                                        .lock()
                                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                                        .insert((bind_host.clone(), (*bind_port).into()), (rule_id.clone(), target_host.clone(), *target_port));
                                    Ok(RunningNetworkRule::Remote { bind_host: bind_host.clone(), bind_port: *bind_port })
                                }
                                Err(_) => Err(SessionControlError::NetworkUnavailable),
                            }
                        }
                    };
                    match result {
                        Ok(running) => { rules.insert(rule_id, running); let _ = reply.send(Ok(())); }
                        Err(error) => { let _ = reply.send(Err(error)); }
                    }
                }
                Some(SessionControl::StopNetworkRule { rule_id, reply }) => {
                    let result = match rules.remove(&rule_id) {
                        Some(RunningNetworkRule::Listener(listener)) => {
                            listener.stop();
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            Ok(())
                        }
                        Some(RunningNetworkRule::Remote { bind_host, bind_port }) => {
                            runtime.remote_forwards
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner())
                                .remove(&(bind_host.clone(), bind_port.into()));
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            handle.cancel_tcpip_forward(bind_host, bind_port.into()).await
                                .map_err(|_| SessionControlError::NetworkUnavailable)
                        }
                        None => {
                            abort_forward_tasks(&runtime.forward_tasks, &rule_id);
                            Ok(())
                        },
                    };
                    let _ = reply.send(result);
                }
                Some(SessionControl::Write(_) | SessionControl::Resize(_) | SessionControl::StartTransfer { .. } | SessionControl::ListDirectory { .. } | SessionControl::ReadFile { .. } | SessionControl::WriteTextFile { .. } | SessionControl::MutateEntry { .. }) => {}
                None => { entry.transition(SessionState::Closing); }
            },
            connection = runtime.direct_receiver.recv() => {
                let Some(mut connection) = connection else { continue };
                if !rules.contains_key(&connection.rule_id) {
                    continue;
                }
                let Ok(permit) = Arc::clone(&runtime.forward_permits).try_acquire_owned() else {
                    if connection.socks5 {
                        let _ = acknowledge_socks5(&mut connection.stream, false).await;
                    }
                    continue;
                };
                let opened = tokio::time::timeout(CONNECT_TIMEOUT, handle.channel_open_direct_tcpip(
                    connection.target_host.clone(),
                    connection.target_port.into(),
                    connection.originator_host.clone(),
                    connection.originator_port.into(),
                )).await;
                match opened {
                    Ok(Ok(channel)) => {
                        if connection.socks5 && acknowledge_socks5(&mut connection.stream, true).await.is_err() {
                            continue;
                        }
                        spawn_forward_task(&runtime.forward_tasks, connection.rule_id, async move {
                            let _permit = permit;
                            let _ = pump_tcp_channel(connection.stream, channel).await;
                        });
                    }
                    _ => {
                        if connection.socks5 {
                            let _ = acknowledge_socks5(&mut connection.stream, false).await;
                        }
                    }
                }
            }
        }
    }
    for (_, rule) in rules.drain() {
        match rule {
            RunningNetworkRule::Listener(listener) => listener.stop(),
            RunningNetworkRule::Remote {
                bind_host,
                bind_port,
            } => {
                let _ = handle
                    .cancel_tcpip_forward(bind_host, bind_port.into())
                    .await;
            }
        }
    }
    for rule_id in runtime
        .forward_tasks
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .keys()
        .cloned()
        .collect::<Vec<_>>()
    {
        abort_forward_tasks(&runtime.forward_tasks, &rule_id);
    }
    runtime
        .remote_forwards
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
    let _ = handle
        .disconnect(Disconnect::ByApplication, "network session closed", "en")
        .await;
    entry.transition(SessionState::Closed);
}

async fn run_transfer<S>(
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

async fn list_remote_directory<S>(stream: S, path: RemotePath) -> Result<DirectoryListing, ()>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream).await.map_err(|_| ())?;
    let canonical = sftp.canonicalize(path.as_str()).await.map_err(|_| ())?;
    let directory = sftp.read_dir(canonical.clone()).await.map_err(|_| ())?;
    let entries = directory
        .map(|entry| {
            let metadata = entry.metadata();
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs());
            FileEntry {
                name: entry.file_name(),
                path: entry.path(),
                is_directory: metadata.is_dir(),
                is_symlink: metadata.is_symlink(),
                size: metadata.len(),
                modified_at,
                permission_mode: metadata.permissions.map(|mode| mode & 0o7777),
            }
        })
        .collect();
    let _ = sftp.close().await;
    Ok(DirectoryListing::new(canonical, entries))
}

async fn read_remote_file<S>(
    stream: S,
    path: RemotePath,
    limit: u64,
) -> Result<FileDocument, SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let result = read_remote_document(&sftp, path.as_str(), limit).await;
    let _ = sftp.close().await;
    result
}

async fn read_remote_document(
    sftp: &SftpSession,
    path: &str,
    limit: u64,
) -> Result<FileDocument, SessionControlError> {
    let metadata = sftp
        .symlink_metadata(path)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if metadata.len() > limit {
        return Err(SessionControlError::FileTooLarge);
    }
    if !metadata.is_regular() {
        return Err(SessionControlError::FileUnavailable);
    }
    let bytes = sftp
        .read(path)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if bytes.len() as u64 > limit {
        return Err(SessionControlError::FileTooLarge);
    }
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    Ok(FileDocument {
        revision: content_revision(&bytes),
        bytes,
        modified_at,
    })
}

async fn write_remote_text_file<S>(
    stream: S,
    path: RemotePath,
    text: String,
    expected_revision: String,
) -> Result<FileDocument, SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    use crate::domain::files::MAX_TEXT_FILE_BYTES;

    if text.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(SessionControlError::FileTooLarge);
    }
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let current = read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await?;
    if current.revision != expected_revision {
        let _ = sftp.close().await;
        return Err(SessionControlError::FileConflict);
    }
    let original_permissions = sftp
        .metadata(path.as_str())
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
        .permissions;
    let suffix = Uuid::new_v4();
    let temporary = format!("{}.terminal-demo-{suffix}.part", path.as_str());
    let backup = format!("{}.terminal-demo-{suffix}.backup", path.as_str());
    let mut temporary_file = match sftp.create(&temporary).await {
        Ok(file) => file,
        Err(_) => {
            let _ = sftp.close().await;
            return Err(SessionControlError::FileUnavailable);
        }
    };
    if original_permissions.is_some()
        && temporary_file
            .set_metadata(FileAttributes {
                permissions: original_permissions,
                ..FileAttributes::default()
            })
            .await
            .is_err()
    {
        let _ = temporary_file.close().await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if temporary_file.write_all(text.as_bytes()).await.is_err() {
        let _ = temporary_file.close().await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if temporary_file.close().await.is_err() {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    let latest = match read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await {
        Ok(document) => document,
        Err(error) => {
            let _ = sftp.remove_file(&temporary).await;
            let _ = sftp.close().await;
            return Err(error);
        }
    };
    if latest.revision != expected_revision {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileConflict);
    }
    if sftp.rename(path.as_str(), &backup).await.is_err() {
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    if sftp.rename(&temporary, path.as_str()).await.is_err() {
        let _ = sftp.rename(&backup, path.as_str()).await;
        let _ = sftp.remove_file(&temporary).await;
        let _ = sftp.close().await;
        return Err(SessionControlError::FileUnavailable);
    }
    let _ = sftp.remove_file(&backup).await;
    let saved = read_remote_document(&sftp, path.as_str(), MAX_TEXT_FILE_BYTES).await;
    let _ = sftp.close().await;
    saved
}

async fn mutate_remote_entry<S>(
    stream: S,
    request: RemoteMutation,
) -> Result<(), SessionControlError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let sftp = SftpSession::new(stream)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let result = match request {
        RemoteMutation::Create {
            directory,
            name,
            is_directory,
        } => create_remote_entry(&sftp, directory.as_str(), &name, is_directory).await,
        RemoteMutation::Copy { path, target_name } => {
            copy_remote_file(&sftp, path.as_str(), &target_name).await
        }
        RemoteMutation::Rename { path, target_name } => {
            rename_remote_entry(&sftp, path.as_str(), &target_name).await
        }
        RemoteMutation::Delete { path } => delete_remote_entry(&sftp, path.as_str()).await,
    };
    let _ = sftp.close().await;
    result
}

async fn create_remote_entry(
    sftp: &SftpSession,
    directory: &str,
    name: &str,
    is_directory: bool,
) -> Result<(), SessionControlError> {
    let target =
        remote_child_path(directory, name).map_err(|_| SessionControlError::FileUnavailable)?;
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    if is_directory {
        sftp.create_dir(target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    } else {
        sftp.create(target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?
            .close()
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    }
}

async fn copy_remote_file(
    sftp: &SftpSession,
    source: &str,
    target_name: &str,
) -> Result<(), SessionControlError> {
    let target = remote_sibling_path(source, target_name)?;
    let metadata = sftp
        .symlink_metadata(source)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if !metadata.is_regular() || metadata.is_symlink() {
        return Err(SessionControlError::FileUnavailable);
    }
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    let temporary = format!("{target}.terminal-demo-{}.part", Uuid::new_v4());
    let mut input = sftp
        .open(source)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let mut output = sftp
        .create(&temporary)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    let outcome = async {
        if metadata.permissions.is_some() {
            output
                .set_metadata(FileAttributes {
                    permissions: metadata.permissions,
                    ..FileAttributes::default()
                })
                .await
                .map_err(|_| SessionControlError::FileUnavailable)?;
        }
        tokio::io::copy(&mut input, &mut output)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        output
            .shutdown()
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        sftp.rename(&temporary, &target)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)
    }
    .await;
    if outcome.is_err() {
        let _ = output.shutdown().await;
        let _ = sftp.remove_file(&temporary).await;
    }
    outcome
}

async fn rename_remote_entry(
    sftp: &SftpSession,
    source: &str,
    target_name: &str,
) -> Result<(), SessionControlError> {
    let target = remote_sibling_path(source, target_name)?;
    if sftp
        .try_exists(&target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?
    {
        return Err(SessionControlError::FileConflict);
    }
    sftp.rename(source, target)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)
}

async fn delete_remote_entry(sftp: &SftpSession, root: &str) -> Result<(), SessionControlError> {
    use crate::domain::files::{MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES};

    let metadata = sftp
        .symlink_metadata(root)
        .await
        .map_err(|_| SessionControlError::FileUnavailable)?;
    if !metadata.is_dir() || metadata.is_symlink() {
        return sftp
            .remove_file(root)
            .await
            .map_err(|_| SessionControlError::FileUnavailable);
    }
    let mut stack = vec![(root.to_owned(), 0_usize)];
    let mut directories = Vec::new();
    let mut files = Vec::new();
    while let Some((directory, depth)) = stack.pop() {
        if depth > MAX_RECURSIVE_FILE_DEPTH {
            return Err(SessionControlError::FileUnavailable);
        }
        directories.push(directory.clone());
        let children = sftp
            .read_dir(&directory)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
        for child in children {
            if directories.len().saturating_add(files.len()) >= MAX_RECURSIVE_FILE_ENTRIES {
                return Err(SessionControlError::FileUnavailable);
            }
            let metadata = child.metadata();
            if metadata.is_dir() && !metadata.is_symlink() {
                stack.push((child.path(), depth + 1));
            } else {
                files.push(child.path());
            }
        }
    }
    for file in files {
        sftp.remove_file(file)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
    }
    for directory in directories.into_iter().rev() {
        sftp.remove_dir(directory)
            .await
            .map_err(|_| SessionControlError::FileUnavailable)?;
    }
    Ok(())
}

fn remote_sibling_path(source: &str, target_name: &str) -> Result<String, SessionControlError> {
    if target_name.trim().is_empty()
        || target_name == "."
        || target_name == ".."
        || target_name.len() > 255
        || target_name.contains(['/', '\\', '\0'])
        || target_name.chars().any(char::is_control)
    {
        return Err(SessionControlError::FileUnavailable);
    }
    match source.rsplit_once('/') {
        Some(("", _)) => Ok(format!("/{target_name}")),
        Some((parent, _)) => Ok(format!("{parent}/{target_name}")),
        None => Ok(target_name.to_owned()),
    }
}

enum TransferOutcome {
    Completed,
    Cancelled,
}

struct LocalUploadFile {
    local_path: PathBuf,
    remote_relative_path: String,
    size: u64,
}

struct LocalUploadPlan {
    roots: Vec<String>,
    directories: Vec<String>,
    files: Vec<LocalUploadFile>,
    total: u64,
}

async fn upload_entries(
    sftp: &SftpSession,
    local_paths: Vec<PathBuf>,
    remote_directory: RemotePath,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let Some(plan) = scan_local_upload_entries(local_paths, cancel).await? else {
        return Ok(TransferOutcome::Cancelled);
    };
    for root in &plan.roots {
        let target = remote_child_path(remote_directory.as_str(), root)?;
        if sftp.try_exists(&target).await.map_err(|_| ())? {
            return Err(());
        }
    }
    let mut created_roots = Vec::new();
    let result = async {
        for root in &plan.roots {
            created_roots.push(remote_child_path(remote_directory.as_str(), root)?);
        }
        for directory in &plan.directories {
            sftp.create_dir(remote_child_path(remote_directory.as_str(), directory)?)
                .await
                .map_err(|_| ())?;
        }
        events(TransferEvent::Started {
            total_bytes: plan.total,
        });
        let mut completed = 0_u64;
        for file in plan.files {
            let target = remote_child_path(remote_directory.as_str(), &file.remote_relative_path)?;
            let temporary = format!("{target}.terminal-demo-{}.part", Uuid::new_v4());
            let mut source = tokio::fs::File::open(&file.local_path)
                .await
                .map_err(|_| ())?;
            let mut destination = sftp.create(&temporary).await.map_err(|_| ())?;
            let outcome = copy_with_aggregate(
                &mut source,
                &mut destination,
                completed,
                plan.total,
                events,
                cancel,
            )
            .await;
            match outcome {
                Ok(TransferOutcome::Completed) => {
                    destination.shutdown().await.map_err(|_| ())?;
                    sftp.rename(&temporary, &target).await.map_err(|_| ())?;
                    completed = completed.saturating_add(file.size);
                }
                Ok(TransferOutcome::Cancelled) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Ok(TransferOutcome::Cancelled);
                }
                Err(()) => {
                    let _ = destination.shutdown().await;
                    let _ = sftp.remove_file(&temporary).await;
                    return Err(());
                }
            }
        }
        Ok(TransferOutcome::Completed)
    }
    .await;
    if !matches!(result, Ok(TransferOutcome::Completed)) {
        for root in created_roots.into_iter().rev() {
            let _ = delete_remote_entry(sftp, &root).await;
        }
    }
    result
}

async fn scan_local_upload_entries(
    local_paths: Vec<PathBuf>,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<Option<LocalUploadPlan>, ()> {
    use crate::domain::files::{MAX_RECURSIVE_FILE_DEPTH, MAX_RECURSIVE_FILE_ENTRIES};

    let mut roots = Vec::new();
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut total = 0_u64;
    let mut stack = Vec::new();
    for local_path in local_paths {
        let name = local_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| safe_remote_component(name))
            .ok_or(())?
            .to_owned();
        if roots.contains(&name) {
            return Err(());
        }
        let metadata = tokio::fs::symlink_metadata(&local_path)
            .await
            .map_err(|_| ())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        roots.push(name.clone());
        if metadata.is_dir() {
            directories.push(name.clone());
            stack.push((local_path, name, 0_usize));
        } else if metadata.is_file() {
            total = total.saturating_add(metadata.len());
            files.push(LocalUploadFile {
                local_path,
                remote_relative_path: name,
                size: metadata.len(),
            });
        } else {
            return Err(());
        }
    }
    while let Some((local_directory, remote_relative, depth)) = stack.pop() {
        if cancel.try_recv().is_ok() {
            return Ok(None);
        }
        if depth >= MAX_RECURSIVE_FILE_DEPTH {
            return Err(());
        }
        let mut children = tokio::fs::read_dir(local_directory).await.map_err(|_| ())?;
        while let Some(child) = children.next_entry().await.map_err(|_| ())? {
            if directories.len().saturating_add(files.len()) >= MAX_RECURSIVE_FILE_ENTRIES {
                return Err(());
            }
            let name = child
                .file_name()
                .to_str()
                .filter(|name| safe_remote_component(name))
                .ok_or(())?
                .to_owned();
            let child_relative = format!("{remote_relative}/{name}");
            let metadata = tokio::fs::symlink_metadata(child.path())
                .await
                .map_err(|_| ())?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                directories.push(child_relative.clone());
                stack.push((child.path(), child_relative, depth + 1));
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
                files.push(LocalUploadFile {
                    local_path: child.path(),
                    remote_relative_path: child_relative,
                    size: metadata.len(),
                });
            } else {
                return Err(());
            }
        }
    }
    Ok(Some(LocalUploadPlan {
        roots,
        directories,
        files,
        total,
    }))
}

fn remote_child_path(parent: &str, child: &str) -> Result<String, ()> {
    if child
        .split('/')
        .any(|component| !safe_remote_component(component))
    {
        return Err(());
    }
    Ok(if parent == "/" {
        format!("/{child}")
    } else {
        format!("{}/{child}", parent.trim_end_matches('/'))
    })
}

fn safe_remote_component(name: &str) -> bool {
    !name.trim().is_empty()
        && name != "."
        && name != ".."
        && name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && !name.chars().any(char::is_control)
}

async fn upload_file(
    sftp: &SftpSession,
    local_path: PathBuf,
    remote_path: RemotePath,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let total = tokio::fs::metadata(&local_path)
        .await
        .map_err(|_| ())?
        .len();
    let mut source = tokio::fs::File::open(local_path).await.map_err(|_| ())?;
    if sftp
        .try_exists(remote_path.as_str())
        .await
        .map_err(|_| ())?
    {
        return Err(());
    }
    let temporary_path = format!("{}.terminal-demo.part", remote_path.as_str());
    let mut destination = sftp.create(temporary_path.clone()).await.map_err(|_| ())?;
    events(TransferEvent::Started { total_bytes: total });
    let outcome = copy_with_progress(&mut source, &mut destination, total, events, cancel).await;
    match outcome {
        Ok(TransferOutcome::Completed) => {
            destination.shutdown().await.map_err(|_| ())?;
            sftp.rename(temporary_path.clone(), remote_path.as_str())
                .await
                .map_err(|_| ())?;
            Ok(TransferOutcome::Completed)
        }
        Ok(TransferOutcome::Cancelled) => {
            drop(destination);
            let _ = sftp.remove_file(temporary_path).await;
            Ok(TransferOutcome::Cancelled)
        }
        Err(()) => {
            drop(destination);
            let _ = sftp.remove_file(temporary_path).await;
            Err(())
        }
    }
}

async fn download_file(
    sftp: &SftpSession,
    remote_path: RemotePath,
    local_path: PathBuf,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    let mut source = sftp.open(remote_path.as_str()).await.map_err(|_| ())?;
    let total = source.metadata().await.map_err(|_| ())?.size.unwrap_or(0);
    let temporary_path = local_path.with_extension(format!(
        "{}.terminal-demo.part",
        local_path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
    ));
    let mut destination = tokio::fs::File::create(&temporary_path)
        .await
        .map_err(|_| ())?;
    events(TransferEvent::Started { total_bytes: total });
    let outcome = copy_with_progress(&mut source, &mut destination, total, events, cancel).await;
    match outcome {
        Ok(TransferOutcome::Completed) => {
            destination.flush().await.map_err(|_| ())?;
            drop(destination);
            tokio::fs::rename(&temporary_path, local_path)
                .await
                .map_err(|_| ())?;
            Ok(TransferOutcome::Completed)
        }
        Ok(TransferOutcome::Cancelled) => {
            drop(destination);
            let _ = tokio::fs::remove_file(temporary_path).await;
            Ok(TransferOutcome::Cancelled)
        }
        Err(()) => {
            drop(destination);
            let _ = tokio::fs::remove_file(temporary_path).await;
            Err(())
        }
    }
}

struct RemoteDownloadFile {
    remote_path: String,
    relative_path: PathBuf,
    size: u64,
}

async fn download_directory(
    sftp: &SftpSession,
    remote_path: RemotePath,
    local_path: PathBuf,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()> {
    if tokio::fs::try_exists(&local_path).await.map_err(|_| ())? {
        return Err(());
    }
    let Some((directories, files, total)) =
        scan_remote_directory(sftp, remote_path.as_str(), cancel).await?
    else {
        return Ok(TransferOutcome::Cancelled);
    };
    tokio::fs::create_dir(&local_path).await.map_err(|_| ())?;
    let result = async {
        for directory in directories {
            tokio::fs::create_dir_all(local_path.join(directory))
                .await
                .map_err(|_| ())?;
        }
        events(TransferEvent::Started { total_bytes: total });
        let mut completed = 0_u64;
        for file in files {
            let target = local_path.join(&file.relative_path);
            let file_name = target
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or(())?;
            let temporary = target.with_file_name(format!("{file_name}.terminal-demo.part"));
            let mut source = sftp.open(&file.remote_path).await.map_err(|_| ())?;
            let mut destination = tokio::fs::File::create(&temporary).await.map_err(|_| ())?;
            match copy_with_aggregate(
                &mut source,
                &mut destination,
                completed,
                total,
                events,
                cancel,
            )
            .await?
            {
                TransferOutcome::Completed => {
                    destination.flush().await.map_err(|_| ())?;
                    drop(destination);
                    tokio::fs::rename(&temporary, &target)
                        .await
                        .map_err(|_| ())?;
                    completed = completed.saturating_add(file.size);
                }
                TransferOutcome::Cancelled => {
                    drop(destination);
                    let _ = tokio::fs::remove_file(temporary).await;
                    return Ok(TransferOutcome::Cancelled);
                }
            }
        }
        Ok(TransferOutcome::Completed)
    }
    .await;
    if !matches!(result, Ok(TransferOutcome::Completed)) {
        let _ = tokio::fs::remove_dir_all(&local_path).await;
    }
    result
}

async fn scan_remote_directory(
    sftp: &SftpSession,
    root: &str,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<Option<(Vec<PathBuf>, Vec<RemoteDownloadFile>, u64)>, ()> {
    let metadata = sftp.symlink_metadata(root).await.map_err(|_| ())?;
    if !metadata.is_dir() || metadata.is_symlink() {
        return Err(());
    }
    let mut stack = vec![(root.to_owned(), PathBuf::new())];
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut total = 0_u64;
    while let Some((remote_directory, relative_directory)) = stack.pop() {
        if cancel.try_recv().is_ok() {
            return Ok(None);
        }
        let entries = sftp.read_dir(&remote_directory).await.map_err(|_| ())?;
        for entry in entries {
            let name = entry.file_name();
            if name.is_empty()
                || name == "."
                || name == ".."
                || Path::new(&name).components().count() != 1
            {
                return Err(());
            }
            let metadata = entry.metadata();
            if metadata.is_symlink() {
                continue;
            }
            let relative_path = relative_directory.join(&name);
            if relative_path.components().count() > MAX_DIRECTORY_DOWNLOAD_DEPTH
                || directories.len().saturating_add(files.len()) >= MAX_DIRECTORY_DOWNLOAD_ENTRIES
            {
                return Err(());
            }
            if metadata.is_dir() {
                directories.push(relative_path.clone());
                stack.push((entry.path(), relative_path));
            } else if metadata.is_regular() {
                total = total.saturating_add(metadata.len());
                files.push(RemoteDownloadFile {
                    remote_path: entry.path(),
                    relative_path,
                    size: metadata.len(),
                });
            }
        }
    }
    Ok(Some((directories, files, total)))
}

async fn copy_with_aggregate<R, W>(
    source: &mut R,
    destination: &mut W,
    completed: u64,
    total: u64,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut current = 0_u64;
    loop {
        let read = tokio::select! {
            _ = &mut *cancel => return Ok(TransferOutcome::Cancelled),
            result = source.read(&mut buffer) => result.map_err(|_| ())?,
        };
        if read == 0 {
            return Ok(TransferOutcome::Completed);
        }
        destination
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ())?;
        current += read as u64;
        events(TransferEvent::Progress {
            transferred_bytes: completed.saturating_add(current),
            total_bytes: total,
        });
    }
}

async fn copy_with_progress<R, W>(
    source: &mut R,
    destination: &mut W,
    total: u64,
    events: &TransferSink,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<TransferOutcome, ()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut transferred = 0_u64;
    loop {
        let read = tokio::select! {
            _ = &mut *cancel => return Ok(TransferOutcome::Cancelled),
            result = source.read(&mut buffer) => result.map_err(|_| ())?,
        };
        if read == 0 {
            return Ok(TransferOutcome::Completed);
        }
        destination
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ())?;
        transferred += read as u64;
        events(TransferEvent::Progress {
            transferred_bytes: transferred,
            total_bytes: total,
        });
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        process::{Child, Command, Stdio},
        sync::{Arc, Mutex},
        thread,
        time::Duration,
    };

    use tempfile::tempdir;
    use tokio::sync::{mpsc, oneshot};

    use super::{
        HostKeyDecision, PendingHostKey, SessionConnectRequest, SessionEntry, SessionPurpose,
        SshSessionManager, TransferRequest, scan_local_upload_entries,
    };
    use crate::{
        domain::{
            auth::{AuthRequest, SecretText},
            network::ForwardRuleKind,
            session::{HostEndpoint, PresentedHostKey, SessionEvent, SessionFailure, SessionState},
            transfer::{RemotePath, TransferEvent},
        },
        infrastructure::persistence::json_known_host_repository::JsonKnownHostRepository,
    };

    #[test]
    fn unknown_session_controls_are_rejected() {
        let directory = tempdir().expect("temp directory");
        let manager = Arc::new(SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("known-hosts.json"),
        )));
        assert!(manager.close("missing").is_err());
        assert!(manager.accept_host_key("missing").is_err());
        assert!(manager.reject_host_key("missing").is_err());

        manager.finish("finished");
        assert!(manager.close("finished").is_ok());
    }

    #[test]
    fn closing_during_host_key_confirmation_is_not_reported_as_rejection() {
        let (cancel_sender, _cancel_receiver) = oneshot::channel();
        let (control_sender, _control_receiver) = mpsc::channel(1);
        let entry = SessionEntry::new(
            HostEndpoint::new("example.com", 22).expect("endpoint"),
            SessionPurpose::Terminal,
            None,
            Arc::new(|_| {}),
            cancel_sender,
            control_sender,
        );
        entry.transition(SessionState::AwaitingHostKey);
        let (decision_sender, mut decision_receiver) = oneshot::channel();
        entry.set_pending(PendingHostKey {
            key: PresentedHostKey::new("ssh-ed25519".into(), "key".into(), "SHA256:x".into()),
            decision: decision_sender,
        });

        entry.begin_close();

        assert_eq!(entry.state(), SessionState::Closing);
        assert_eq!(
            decision_receiver.try_recv().expect("close decision"),
            HostKeyDecision::Cancel
        );
    }

    #[test]
    fn files_sessions_reject_terminal_write_and_resize_controls() {
        let directory = tempdir().expect("temp directory");
        let manager = SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("known-hosts.json"),
        ));
        let (cancel_sender, _cancel_receiver) = oneshot::channel();
        let (control_sender, _control_receiver) = mpsc::channel(1);
        let entry = Arc::new(SessionEntry::new(
            HostEndpoint::new("example.com", 22).expect("endpoint"),
            SessionPurpose::Files,
            None,
            Arc::new(|_| {}),
            cancel_sender,
            control_sender,
        ));
        manager
            .sessions
            .lock()
            .expect("sessions")
            .insert("files-1".into(), entry);

        assert_eq!(
            manager.write("files-1", b"pwd\r".to_vec()),
            Err(super::SessionControlError::TerminalUnavailable)
        );
        assert_eq!(
            manager.resize(
                "files-1",
                crate::domain::session::TerminalSize::new(80, 24).expect("size")
            ),
            Err(super::SessionControlError::TerminalUnavailable)
        );
    }

    #[tokio::test]
    async fn network_sessions_reject_rules_from_another_profile() {
        let directory = tempdir().expect("temp directory");
        let manager = SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("known-hosts.json"),
        ));
        let (cancel_sender, _cancel_receiver) = oneshot::channel();
        let (control_sender, _control_receiver) = mpsc::channel(1);
        let entry = Arc::new(SessionEntry::new(
            HostEndpoint::new("example.com", 22).expect("endpoint"),
            SessionPurpose::Network,
            Some("profile-1".into()),
            Arc::new(|_| {}),
            cancel_sender,
            control_sender,
        ));
        entry.transition(SessionState::Connected);
        manager
            .sessions
            .lock()
            .expect("sessions")
            .insert("network-1".into(), entry);

        assert_eq!(
            manager
                .start_network_rule(
                    "network-1",
                    "rule-1".into(),
                    "profile-2",
                    ForwardRuleKind::socks5("127.0.0.1", 1080).expect("rule"),
                )
                .await,
            Err(super::SessionControlError::NetworkUnavailable)
        );
    }

    #[tokio::test]
    async fn failed_tcp_connection_emits_a_terminal_failure_and_can_be_closed_again() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("reserve port");
        let port = listener.local_addr().expect("local address").port();
        drop(listener);
        let directory = tempdir().expect("temp directory");
        let manager = Arc::new(SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("known-hosts.json"),
        )));
        let events = Arc::new(Mutex::new(Vec::new()));
        let event_sink = Arc::clone(&events);
        let id = manager.connect(
            super::SessionConnectRequest {
                endpoint: HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
                username: "test".into(),
                auth: AuthRequest::Password(SecretText::new("temporary".into())),
                purpose: SessionPurpose::Terminal,
                profile_id: None,
                terminal_output: Arc::new(|_| {}),
            },
            Arc::new(move |event| {
                event_sink
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .push(event);
            }),
        );

        // Windows may keep a recently released loopback port in a pending connect
        // state until the configured connection timeout expires.
        for _ in 0..640 {
            if events
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .iter()
                .any(|event| {
                    matches!(
                        event,
                        SessionEvent::Failed(SessionFailure::ConnectionFailed)
                    )
                })
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }

        assert!(
            events
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .iter()
                .any(|event| matches!(
                    event,
                    SessionEvent::Failed(SessionFailure::ConnectionFailed)
                ))
        );
        assert!(manager.close(&id).is_ok());
    }

    #[tokio::test]
    async fn dropped_directory_scan_aggregates_regular_files_and_nested_directories() {
        let directory = tempdir().expect("temporary upload directory");
        let root = directory.path().join("bundle");
        tokio::fs::create_dir_all(root.join("nested"))
            .await
            .expect("nested directory");
        tokio::fs::write(root.join("a.txt"), b"abc")
            .await
            .expect("root file");
        tokio::fs::write(root.join("nested/b.txt"), b"12345")
            .await
            .expect("nested file");
        let (_cancel_sender, mut cancel) = oneshot::channel();

        let plan = scan_local_upload_entries(vec![root], &mut cancel)
            .await
            .expect("scan upload")
            .expect("not cancelled");
        assert_eq!(plan.roots, vec!["bundle"]);
        assert!(plan.directories.iter().any(|path| path == "bundle/nested"));
        assert_eq!(plan.files.len(), 2);
        assert_eq!(plan.total, 8);
    }

    #[test]
    #[ignore = "requires local OpenSSH sshd and sftp-server executables"]
    fn local_openssh_exercises_terminal_transfer_and_file_editing() {
        let directory = tempdir().expect("temporary integration directory");
        let port = TcpListener::bind(("127.0.0.1", 0))
            .expect("reserve local port")
            .local_addr()
            .expect("local address")
            .port();
        let client_key = directory.path().join("client-key");
        let host_key = directory.path().join("host-key");
        generate_ed25519_key(&client_key);
        generate_ed25519_key(&host_key);
        fs::copy(
            client_key.with_extension("pub"),
            directory.path().join("authorized_keys"),
        )
        .expect("authorized key");
        let config = directory.path().join("sshd_config");
        fs::write(
            &config,
            format!(
                "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nLogLevel ERROR\nSubsystem sftp /usr/libexec/sftp-server\n",
                host_key.display(),
                directory.path().join("sshd.pid").display(),
                directory.path().join("authorized_keys").display(),
            ),
        )
        .expect("sshd config");
        let server = Command::new("/usr/sbin/sshd")
            .args(["-D", "-e", "-f"])
            .arg(&config)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start local sshd");
        let mut server = SshdGuard(server);
        wait_for_sshd(&mut server.0, port);

        let manager = Arc::new(SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("known-hosts.json"),
        )));
        let (event_sender, event_receiver) = std::sync::mpsc::channel();
        let (terminal_sender, terminal_receiver) = std::sync::mpsc::channel();
        let session_id = manager.connect(
            SessionConnectRequest {
                endpoint: HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
                username: std::env::var("USER").expect("current username"),
                auth: AuthRequest::PrivateKey {
                    path: client_key.clone(),
                    passphrase: None,
                },
                purpose: SessionPurpose::Terminal,
                profile_id: None,
                terminal_output: Arc::new(move |data| {
                    let _ = terminal_sender.send(data);
                }),
            },
            Arc::new(move |event| {
                let _ = event_sender.send(event);
            }),
        );
        loop {
            match event_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("session event")
            {
                SessionEvent::HostKeyConfirmationRequired { .. } => manager
                    .accept_host_key(&session_id)
                    .expect("accept temporary host key"),
                SessionEvent::StateChanged(SessionState::Connected) => break,
                SessionEvent::Failed(failure) => panic!("connection failed: {failure:?}"),
                _ => {}
            }
        }

        manager
            .write(&session_id, b"printf 'MVP_TERMINAL_OK\\n'\r".to_vec())
            .expect("write terminal command");
        let mut output = Vec::new();
        while !String::from_utf8_lossy(&output).contains("MVP_TERMINAL_OK") {
            output.extend(
                terminal_receiver
                    .recv_timeout(Duration::from_secs(10))
                    .expect("terminal output"),
            );
        }

        while terminal_receiver.try_recv().is_ok() {}
        let (second_event_sender, second_event_receiver) = std::sync::mpsc::channel();
        let (second_terminal_sender, second_terminal_receiver) = std::sync::mpsc::channel();
        let second_session_id = manager.connect(
            SessionConnectRequest {
                endpoint: HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
                username: std::env::var("USER").expect("current username"),
                auth: AuthRequest::PrivateKey {
                    path: client_key,
                    passphrase: None,
                },
                purpose: SessionPurpose::Terminal,
                profile_id: None,
                terminal_output: Arc::new(move |data| {
                    let _ = second_terminal_sender.send(data);
                }),
            },
            Arc::new(move |event| {
                let _ = second_event_sender.send(event);
            }),
        );
        loop {
            match second_event_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("second session event")
            {
                SessionEvent::HostKeyConfirmationRequired { .. } => manager
                    .accept_host_key(&second_session_id)
                    .expect("accept second host key"),
                SessionEvent::StateChanged(SessionState::Connected) => break,
                SessionEvent::Failed(failure) => panic!("second connection failed: {failure:?}"),
                _ => {}
            }
        }
        manager
            .write(
                &second_session_id,
                b"printf 'SECOND_SESSION_ONLY\n'\r".to_vec(),
            )
            .expect("write second terminal command");
        let mut second_output = Vec::new();
        while !String::from_utf8_lossy(&second_output).contains("SECOND_SESSION_ONLY") {
            second_output.extend(
                second_terminal_receiver
                    .recv_timeout(Duration::from_secs(10))
                    .expect("second terminal output"),
            );
        }
        std::thread::sleep(Duration::from_millis(100));
        let first_session_tail: Vec<u8> = terminal_receiver.try_iter().flatten().collect();
        assert!(!String::from_utf8_lossy(&first_session_tail).contains("SECOND_SESSION_ONLY"));

        let source = directory.path().join("upload-source.txt");
        let remote = directory.path().join("remote.txt");
        fs::write(&source, b"sftp-round-trip").expect("source file");
        let upload_events = run_test_transfer(
            &manager,
            &session_id,
            TransferRequest::Upload {
                local_path: source,
                remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
            },
        );
        assert!(
            upload_events
                .iter()
                .any(|event| matches!(event, TransferEvent::Progress { .. }))
        );
        assert!(matches!(
            upload_events.last(),
            Some(TransferEvent::Completed)
        ));
        assert_eq!(
            fs::read(&remote).expect("uploaded file"),
            b"sftp-round-trip"
        );
        let listing = tauri::async_runtime::block_on(manager.list_directory(
            &session_id,
            RemotePath::new(directory.path().to_string_lossy()).expect("directory path"),
        ))
        .expect("list remote directory");
        assert!(
            listing
                .entries
                .iter()
                .any(|entry| entry.name == "remote.txt"
                    && !entry.is_directory
                    && entry.permission_mode.is_some())
        );

        let replacement = directory.path().join("replacement.txt");
        fs::write(&replacement, b"must-not-overwrite").expect("replacement source");
        let overwrite_events = run_test_transfer(
            &manager,
            &session_id,
            TransferRequest::Upload {
                local_path: replacement,
                remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
            },
        );
        assert!(matches!(
            overwrite_events.last(),
            Some(TransferEvent::Failed)
        ));
        assert_eq!(
            fs::read(&remote).expect("preserved remote file"),
            b"sftp-round-trip"
        );

        let cancelled_source = directory.path().join("cancelled-source.bin");
        fs::write(&cancelled_source, vec![7_u8; 4 * 1024 * 1024]).expect("cancel source");
        let cancelled_remote = directory.path().join("cancelled.bin");
        let (cancel_sender, cancel_receiver) = std::sync::mpsc::channel();
        let cancelled_id = manager
            .start_transfer(
                &session_id,
                TransferRequest::Upload {
                    local_path: cancelled_source,
                    remote_path: RemotePath::new(cancelled_remote.to_string_lossy())
                        .expect("remote path"),
                },
                Arc::new(move |event| {
                    let _ = cancel_sender.send(event);
                }),
            )
            .expect("start cancellable transfer");
        manager
            .cancel_transfer(&session_id, &cancelled_id)
            .expect("cancel transfer");
        loop {
            let event = cancel_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("cancel event");
            if matches!(event, TransferEvent::Cancelled) {
                break;
            }
            assert!(!matches!(
                event,
                TransferEvent::Completed | TransferEvent::Failed
            ));
        }
        assert!(!cancelled_remote.exists());
        assert!(
            !directory
                .path()
                .join("cancelled.bin.terminal-demo.part")
                .exists()
        );

        let download = directory.path().join("download.txt");
        let download_events = run_test_transfer(
            &manager,
            &session_id,
            TransferRequest::Download {
                remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
                local_path: download.clone(),
            },
        );
        assert!(matches!(
            download_events.last(),
            Some(TransferEvent::Completed)
        ));
        assert_eq!(
            fs::read(download).expect("downloaded file"),
            b"sftp-round-trip"
        );

        let editable = directory.path().join("editable.md");
        fs::write(&editable, b"before").expect("editable source");
        assert!(
            Command::new("chmod")
                .args(["640"])
                .arg(&editable)
                .status()
                .expect("set editable permissions")
                .success()
        );
        let editable_path = RemotePath::new(editable.to_string_lossy()).expect("editable path");
        let document = tauri::async_runtime::block_on(manager.read_file(
            &session_id,
            editable_path.clone(),
            1024,
        ))
        .expect("read remote text");
        let saved = tauri::async_runtime::block_on(manager.write_text_file(
            &session_id,
            editable_path.clone(),
            "after".into(),
            document.revision,
        ))
        .expect("save remote text");
        assert_eq!(saved.bytes, b"after");
        let editable_mode = Command::new("stat")
            .args(["-c", "%a"])
            .arg(&editable)
            .output()
            .expect("read editable permissions");
        assert!(editable_mode.status.success());
        assert_eq!(String::from_utf8_lossy(&editable_mode.stdout).trim(), "640");
        assert!(
            fs::read_dir(directory.path())
                .expect("temporary integration directory")
                .all(|entry| {
                    let name = entry.expect("directory entry").file_name();
                    let name = name.to_string_lossy();
                    !name.contains("editable.md.terminal-demo-")
                })
        );
        tauri::async_runtime::block_on(manager.create_entry(
            &session_id,
            RemotePath::new(directory.path().to_string_lossy()).expect("create parent"),
            "created-empty.txt".into(),
            false,
        ))
        .expect("create remote file");
        tauri::async_runtime::block_on(manager.create_entry(
            &session_id,
            RemotePath::new(directory.path().to_string_lossy()).expect("create parent"),
            "created-folder".into(),
            true,
        ))
        .expect("create remote folder");
        assert_eq!(
            fs::metadata(directory.path().join("created-empty.txt"))
                .expect("created file")
                .len(),
            0
        );
        assert!(directory.path().join("created-folder").is_dir());
        tauri::async_runtime::block_on(manager.copy_file(
            &session_id,
            editable_path.clone(),
            "editable-copy.md".into(),
        ))
        .expect("copy remote file");
        assert_eq!(
            fs::read(directory.path().join("editable-copy.md")).expect("copied remote file"),
            b"after"
        );
        tauri::async_runtime::block_on(
            manager.rename_entry(
                &session_id,
                RemotePath::new(directory.path().join("editable-copy.md").to_string_lossy())
                    .expect("copy path"),
                "editable-renamed.md".into(),
            ),
        )
        .expect("rename remote file");
        tauri::async_runtime::block_on(
            manager.delete_entry(
                &session_id,
                RemotePath::new(
                    directory
                        .path()
                        .join("editable-renamed.md")
                        .to_string_lossy(),
                )
                .expect("renamed path"),
            ),
        )
        .expect("delete remote file");
        assert!(!directory.path().join("editable-renamed.md").exists());
        fs::write(&editable, b"external").expect("external edit");
        assert_eq!(
            tauri::async_runtime::block_on(manager.write_text_file(
                &session_id,
                editable_path,
                "stale".into(),
                saved.revision,
            )),
            Err(super::SessionControlError::FileConflict)
        );

        let remote_tree = directory.path().join("remote-tree");
        fs::create_dir_all(remote_tree.join("nested")).expect("remote tree");
        fs::write(remote_tree.join("root.txt"), b"root").expect("root file");
        fs::write(remote_tree.join("nested/child.txt"), b"child").expect("child file");
        let local_tree = directory.path().join("downloaded-tree");
        let directory_events = run_test_transfer(
            &manager,
            &session_id,
            TransferRequest::DownloadDirectory {
                remote_path: RemotePath::new(remote_tree.to_string_lossy())
                    .expect("remote tree path"),
                local_path: local_tree.clone(),
            },
        );
        assert!(matches!(
            directory_events.last(),
            Some(TransferEvent::Completed)
        ));
        assert_eq!(
            fs::read(local_tree.join("root.txt")).expect("downloaded root"),
            b"root"
        );
        assert_eq!(
            fs::read(local_tree.join("nested/child.txt")).expect("downloaded child"),
            b"child"
        );

        let upload_sources = directory.path().join("upload-sources");
        let upload_bundle = upload_sources.join("bundle");
        fs::create_dir_all(upload_bundle.join("nested")).expect("upload source tree");
        fs::write(upload_bundle.join("root.txt"), b"upload-root").expect("upload root");
        fs::write(upload_bundle.join("nested/child.txt"), b"upload-child").expect("upload child");
        let remote_uploads = directory.path().join("remote-uploads");
        fs::create_dir(&remote_uploads).expect("remote upload directory");
        let upload_tree_events = run_test_transfer(
            &manager,
            &session_id,
            TransferRequest::UploadEntries {
                local_paths: vec![upload_bundle],
                remote_directory: RemotePath::new(remote_uploads.to_string_lossy())
                    .expect("remote upload path"),
            },
        );
        assert!(matches!(
            upload_tree_events.last(),
            Some(TransferEvent::Completed)
        ));
        assert_eq!(
            fs::read(remote_uploads.join("bundle/root.txt")).expect("uploaded root"),
            b"upload-root"
        );
        assert_eq!(
            fs::read(remote_uploads.join("bundle/nested/child.txt")).expect("uploaded child"),
            b"upload-child"
        );
        manager
            .close(&second_session_id)
            .expect("close second session");
        manager.close(&session_id).expect("close session");
    }

    #[test]
    #[ignore = "requires local OpenSSH sshd executable with TCP forwarding enabled"]
    fn local_openssh_exercises_local_remote_and_socks5_forwarding() {
        let directory = tempdir().expect("temporary integration directory");
        let ssh_port = reserve_loopback_port();
        let client_key = directory.path().join("network-client-key");
        let host_key = directory.path().join("network-host-key");
        generate_ed25519_key(&client_key);
        generate_ed25519_key(&host_key);
        fs::copy(
            client_key.with_extension("pub"),
            directory.path().join("network_authorized_keys"),
        )
        .expect("authorized key");
        let config = directory.path().join("network_sshd_config");
        fs::write(
            &config,
            format!(
                "Port {ssh_port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nAllowTcpForwarding yes\nGatewayPorts clientspecified\nLogLevel ERROR\n",
                host_key.display(),
                directory.path().join("network-sshd.pid").display(),
                directory.path().join("network_authorized_keys").display(),
            ),
        )
        .expect("sshd config");
        let server = Command::new("/usr/sbin/sshd")
            .args(["-D", "-e", "-f"])
            .arg(&config)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start local sshd");
        let mut server = SshdGuard(server);
        wait_for_sshd(&mut server.0, ssh_port);

        let echo_listener = TcpListener::bind(("127.0.0.1", 0)).expect("echo listener");
        let echo_port = echo_listener.local_addr().expect("echo address").port();
        let echo_thread = thread::spawn(move || {
            for _ in 0..3 {
                let (mut stream, _) = echo_listener.accept().expect("echo connection");
                let mut bytes = [0_u8; 32];
                let count = stream.read(&mut bytes).expect("echo read");
                stream.write_all(&bytes[..count]).expect("echo write");
            }
        });

        let manager = Arc::new(SshSessionManager::new(JsonKnownHostRepository::new(
            directory.path().join("network-known-hosts.json"),
        )));
        let (event_sender, event_receiver) = std::sync::mpsc::channel();
        let session_id = manager.connect(
            SessionConnectRequest {
                endpoint: HostEndpoint::new("127.0.0.1", ssh_port.into()).expect("endpoint"),
                username: std::env::var("USER").expect("current username"),
                auth: AuthRequest::PrivateKey {
                    path: client_key,
                    passphrase: None,
                },
                purpose: SessionPurpose::Network,
                profile_id: Some("profile-network".into()),
                terminal_output: Arc::new(|_| {}),
            },
            Arc::new(move |event| {
                let _ = event_sender.send(event);
            }),
        );
        loop {
            match event_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("network session event")
            {
                SessionEvent::HostKeyConfirmationRequired { .. } => manager
                    .accept_host_key(&session_id)
                    .expect("accept temporary host key"),
                SessionEvent::StateChanged(SessionState::Connected) => break,
                SessionEvent::Failed(failure) => panic!("connection failed: {failure:?}"),
                _ => {}
            }
        }

        let local_port = reserve_loopback_port();
        tauri::async_runtime::block_on(
            manager.start_network_rule(
                &session_id,
                "local".into(),
                "profile-network",
                ForwardRuleKind::local(
                    "127.0.0.1",
                    u32::from(local_port),
                    "127.0.0.1",
                    u32::from(echo_port),
                )
                .expect("local rule"),
            ),
        )
        .expect("start local forwarding");
        assert_echo(local_port, b"local");

        let socks_port = reserve_loopback_port();
        tauri::async_runtime::block_on(manager.start_network_rule(
            &session_id,
            "socks".into(),
            "profile-network",
            ForwardRuleKind::socks5("127.0.0.1", u32::from(socks_port)).expect("socks rule"),
        ))
        .expect("start socks forwarding");
        let mut socks = TcpStream::connect(("127.0.0.1", socks_port)).expect("connect socks");
        socks.write_all(&[5, 1, 0]).expect("socks greeting");
        let mut greeting = [0_u8; 2];
        socks
            .read_exact(&mut greeting)
            .expect("socks greeting reply");
        assert_eq!(greeting, [5, 0]);
        let mut request = vec![5, 1, 0, 1, 127, 0, 0, 1];
        request.extend_from_slice(&echo_port.to_be_bytes());
        socks.write_all(&request).expect("socks connect");
        let mut reply = [0_u8; 10];
        socks.read_exact(&mut reply).expect("socks connect reply");
        assert_eq!(reply[1], 0);
        socks.write_all(b"socks").expect("socks payload");
        let mut socks_echo = [0_u8; 5];
        socks.read_exact(&mut socks_echo).expect("socks echo");
        assert_eq!(&socks_echo, b"socks");
        drop(socks);

        let remote_port = reserve_loopback_port();
        tauri::async_runtime::block_on(
            manager.start_network_rule(
                &session_id,
                "remote".into(),
                "profile-network",
                ForwardRuleKind::remote(
                    "127.0.0.1",
                    u32::from(remote_port),
                    "127.0.0.1",
                    u32::from(echo_port),
                )
                .expect("remote rule"),
            ),
        )
        .expect("start remote forwarding");
        assert_echo(remote_port, b"remote");

        for rule_id in ["local", "socks", "remote"] {
            tauri::async_runtime::block_on(manager.stop_network_rule(&session_id, rule_id.into()))
                .expect("stop forwarding");
        }
        tauri::async_runtime::block_on(manager.stop_network_rule(&session_id, "remote".into()))
            .expect("repeated stop is idempotent");
        manager.close(&session_id).expect("close network session");
        echo_thread.join().expect("echo thread");
    }

    struct SshdGuard(Child);

    impl Drop for SshdGuard {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    fn generate_ed25519_key(path: &std::path::Path) {
        assert!(
            Command::new("ssh-keygen")
                .args(["-q", "-t", "ed25519", "-N", "", "-f"])
                .arg(path)
                .status()
                .expect("run ssh-keygen")
                .success()
        );
    }

    fn reserve_loopback_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0))
            .expect("reserve port")
            .local_addr()
            .expect("local address")
            .port()
    }

    fn assert_echo(port: u16, payload: &[u8]) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect forwarding");
        stream.write_all(payload).expect("write payload");
        let mut echoed = vec![0_u8; payload.len()];
        stream.read_exact(&mut echoed).expect("read echo");
        assert_eq!(echoed, payload);
    }

    fn wait_for_sshd(server: &mut Child, port: u16) {
        for _ in 0..40 {
            if let Some(status) = server.try_wait().expect("sshd status") {
                let mut message = String::new();
                if let Some(mut stderr) = server.stderr.take() {
                    let _ = std::io::Read::read_to_string(&mut stderr, &mut message);
                }
                panic!("sshd exited with {status}: {message}");
            }
            if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        panic!("sshd did not start");
    }

    fn run_test_transfer(
        manager: &Arc<SshSessionManager>,
        session_id: &str,
        request: TransferRequest,
    ) -> Vec<TransferEvent> {
        let (sender, receiver) = std::sync::mpsc::channel();
        manager
            .start_transfer(
                session_id,
                request,
                Arc::new(move |event| {
                    let _ = sender.send(event);
                }),
            )
            .expect("start transfer");
        let mut events = Vec::new();
        loop {
            let event = receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("transfer event");
            let terminal = matches!(
                event,
                TransferEvent::Completed | TransferEvent::Cancelled | TransferEvent::Failed
            );
            events.push(event);
            if terminal {
                return events;
            }
        }
    }
}
