use qterm_sync_core::{Catalog, Push, Snapshot};
use serde::{Deserialize, Serialize};
use std::future::Future;

pub type SyncResult<T> = Result<T, String>;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SyncSettings {
    pub enabled: bool,
    pub server_url: String,
    pub allow_insecure_http: bool,
    pub token_id: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SyncCheckpoint {
    pub endpoint: String,
    pub baseline: Option<Snapshot>,
    pub pending: Option<PendingApply>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PendingApply {
    pub before: Catalog,
    pub agreed: Snapshot,
}

pub trait SyncLocalStore: Send + Sync {
    fn catalog(&self) -> SyncResult<Catalog>;
    fn apply(&self, expected: &Catalog, desired: &Catalog) -> SyncResult<()>;
}

pub trait SyncDeviceStore: Send + Sync {
    fn settings(&self) -> SyncResult<SyncSettings>;
    fn save_settings(&self, settings: &SyncSettings, token: Option<&str>) -> SyncResult<()>;
    fn checkpoint(&self) -> SyncResult<SyncCheckpoint>;
    fn save_checkpoint(&self, checkpoint: &SyncCheckpoint) -> SyncResult<()>;
    fn token(&self, settings: &SyncSettings) -> SyncResult<zeroize::Zeroizing<String>>;
}

pub trait SyncRemote: Send + Sync {
    fn validate_settings(&self, settings: &mut SyncSettings) -> SyncResult<()>;
    fn fetch(
        &self,
        settings: &SyncSettings,
        token: &str,
    ) -> impl Future<Output = SyncResult<Snapshot>> + Send;
    fn push(
        &self,
        settings: &SyncSettings,
        token: &str,
        request: Push,
    ) -> impl Future<Output = SyncResult<Snapshot>> + Send;
}
