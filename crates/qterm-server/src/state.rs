use crate::{
    auth::Auth,
    config::Config,
    error::{ApiError, Result},
};
use qterm_core::{
    application::{
        credential_lifecycle::CredentialLifecycle, profile_service::ProfileService,
        workspace_service::WorkspaceService,
    },
    infrastructure::{
        persistence::{
            json_credential_vault::JsonCredentialVault,
            json_known_host_repository::JsonKnownHostRepository,
            json_profile_repository::JsonProfileRepository,
            json_remote_shell_cache::JsonRemoteShellCache,
            json_workspace_repository::JsonWorkspaceRepository,
        },
        ssh::client::SshSessionManager,
    },
};
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    sync::{Arc, Mutex},
};

pub struct ServerState {
    pub workspace_runtime: Mutex<crate::workspace_runtime::Runtime>,
    pub retained: Mutex<HashMap<String, Arc<crate::retained_session::RetainedSession>>>,
    pub screen_worker: Arc<crate::screen_worker::ScreenWorker>,
    pub config: Config,
    pub settings: crate::settings::ServerSettings,
    pub auth: Auth,
    pub vault_gate: tokio::sync::Mutex<()>,
    pub profiles: ProfileService<JsonProfileRepository>,
    pub workspaces: WorkspaceService<JsonWorkspaceRepository>,
    pub workspace_revision: Mutex<u64>,
    pub vault: Arc<CredentialLifecycle<JsonCredentialVault>>,
    pub credential_workflow:
        Mutex<qterm_core::application::credential_workflow::CredentialWorkflowState>,
    pub sessions: Arc<SshSessionManager>,
    pub local_sessions: Arc<qterm_core::infrastructure::local::pty::LocalSessionManager>,
    pub owners: Mutex<HashMap<String, String>>,
    pub pending_recovery: Mutex<Option<crate::vault::PendingRecovery>>,
    pub downloads: Mutex<HashMap<String, crate::transfers::Download>>,
    pub transfers: Arc<tokio::sync::Semaphore>,
    pub transfer_tasks: crate::transfer_lifecycle::Transfers,
    pub sockets: Arc<tokio::sync::Semaphore>,
    pub access_sockets: Arc<tokio::sync::Semaphore>,
    _data_lock: File,
}
impl ServerState {
    pub fn new(mut config: Config) -> std::result::Result<Arc<Self>, String> {
        std::fs::create_dir_all(&config.data).map_err(|_| "Cannot create data directory")?;
        config.data =
            std::fs::canonicalize(&config.data).map_err(|_| "Cannot resolve data directory")?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(config.data.join("server.lock"))
            .map_err(|_| "Cannot open data lock")?;
        fs2::FileExt::try_lock_exclusive(&lock).map_err(|_| "Data directory is already in use")?;
        for name in ["data", "device", "cache", "cache/transfers"] {
            std::fs::create_dir_all(config.data.join(name))
                .map_err(|_| "Cannot initialize storage")?;
        }
        // The exclusive process lock makes stale transfer cleanup safe after a crash.
        for entry in std::fs::read_dir(config.data.join("cache/transfers"))
            .map_err(|_| "Cannot read transfer cache")?
        {
            let entry = entry.map_err(|_| "Cannot read transfer cache")?;
            std::fs::remove_file(entry.path()).map_err(|_| "Cannot clean transfer cache")?;
        }
        Ok(Arc::new(Self {
            workspace_runtime: Default::default(),
            retained: Default::default(),
            screen_worker: Default::default(),
            settings: crate::settings::ServerSettings::new(&config.data),
            profiles: ProfileService::new(JsonProfileRepository::new(
                config.data.join("data/connections.json"),
            )),
            workspaces: WorkspaceService::new(JsonWorkspaceRepository::new(
                config.data.join("device/workspaces.json"),
            )),
            workspace_revision: Mutex::new(0),
            vault: Arc::new(CredentialLifecycle::new(JsonCredentialVault::new(
                config.data.join("data/secrets.vault"),
            ))),
            sessions: Arc::new(SshSessionManager::new(
                JsonKnownHostRepository::new(config.data.join("device/known-hosts.json")),
                JsonRemoteShellCache::new(config.data.join("cache/remote-shells.json")),
            )),
            downloads: Mutex::new(HashMap::new()),
            local_sessions: Default::default(),
            credential_workflow: Default::default(),
            transfers: Arc::new(tokio::sync::Semaphore::new(4)),
            transfer_tasks: Default::default(),
            auth: Auth::default(),
            vault_gate: tokio::sync::Mutex::new(()),
            owners: Mutex::new(HashMap::new()),
            pending_recovery: Mutex::new(None),
            sockets: Arc::new(tokio::sync::Semaphore::new(32)),
            access_sockets: Arc::new(tokio::sync::Semaphore::new(8)),
            config,
            _data_lock: lock,
        }))
    }
    pub fn authorize(&self, owner: &str, id: &str) -> Result<()> {
        if !self.auth.valid(owner) {
            return Err(ApiError::unauthorized());
        }
        if self
            .owners
            .lock()
            .unwrap()
            .get(id)
            .is_some_and(|value| value == owner || value == "single-user")
        {
            Ok(())
        } else {
            Err(ApiError::forbidden())
        }
    }
    pub fn close_all(&self) {
        for (_, session) in self.retained.lock().unwrap().drain() {
            session.stop();
        }
        for (id, _) in self.owners.lock().unwrap().drain() {
            let _ = self.sessions.close(&id);
            let _ = self.local_sessions.close(&id);
        }
        self.clear_login_secrets();
    }
    pub fn clear_login_secrets(&self) {
        *self.pending_recovery.lock().unwrap() = None;
        *self.credential_workflow.lock().unwrap() = Default::default();
        self.downloads.lock().unwrap().clear();
        self.transfer_tasks.clear();
    }
}
