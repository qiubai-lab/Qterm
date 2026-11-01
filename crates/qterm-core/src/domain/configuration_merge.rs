use crate::domain::{
    credential::{CredentialMaterial, CredentialSummary},
    network::ForwardRule,
    profile::{ConnectionProfile, ProfileGroup},
};

pub type MergeResult<T> = Result<T, &'static str>;

#[derive(Clone, Copy, Default)]
pub struct MergeOptions {
    pub connections: bool,
    pub network: bool,
    pub credentials: bool,
}

#[derive(Default)]
pub struct MergeCatalog {
    pub groups: Vec<ProfileGroup>,
    pub profiles: Vec<ConnectionProfile>,
    pub rules: Vec<ForwardRule>,
    pub credentials: Vec<(CredentialSummary, CredentialMaterial)>,
}

#[derive(Clone)]
pub struct MergeDetail {
    pub category: &'static str,
    pub name: String,
    pub outcome: &'static str,
    pub target_name: String,
    pub note: String,
}

#[derive(Default)]
pub struct MergePlan {
    pub additions: MergeCatalog,
    pub details: Vec<MergeDetail>,
}

impl MergePlan {
    pub fn changed(&self) -> bool {
        let c = &self.additions;
        !c.groups.is_empty()
            || !c.profiles.is_empty()
            || !c.rules.is_empty()
            || !c.credentials.is_empty()
    }
}

#[derive(Clone, Default)]
pub struct MergeCategoryStatus {
    pub count: usize,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct MergeScan {
    pub source: String,
    pub connections: MergeCategoryStatus,
    pub network: MergeCategoryStatus,
    pub credentials: MergeCategoryStatus,
}
