//! Versioned portable catalog. No secrets, device paths or runtime state.
mod merge;
mod validation;
pub use merge::{Conflict, Merge, Resolution, merge};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const PROTOCOL: u32 = 1;
pub const MAX_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_CATALOG_BYTES: usize = 1024 * 1024;
pub const MAX_ITEMS: usize = 2048;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Catalog {
    pub groups: BTreeMap<String, Group>,
    pub profiles: BTreeMap<String, Profile>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Group {
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_preference: AuthPreference,
    pub group_id: Option<String>,
    pub jump_profile_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthPreference {
    Manual,
    Password,
    PrivateKey,
    SshAgent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Snapshot {
    pub protocol: u32,
    pub server_id: String,
    pub revision: u64,
    pub catalog: Catalog,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Push {
    pub protocol: u32,
    pub server_id: String,
    pub base_revision: u64,
    pub catalog: Catalog,
}

impl Profile {
    pub fn same_auth_target(&self, other: &Self) -> bool {
        self.host == other.host
            && self.port == other.port
            && self.username == other.username
            && self.auth_preference == other.auth_preference
    }
}
