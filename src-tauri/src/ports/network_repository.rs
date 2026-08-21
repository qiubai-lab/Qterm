use std::{error::Error, fmt};

use crate::domain::{
    network::{ForwardRule, NetworkRuleId},
    profile::ProfileId,
};

pub trait NetworkRepository: Send + Sync {
    fn list(&self) -> Result<Vec<ForwardRule>, NetworkRepositoryError>;
    fn insert(&self, rule: ForwardRule) -> Result<(), NetworkRepositoryError>;
    fn update(&self, rule: ForwardRule) -> Result<(), NetworkRepositoryError>;
    fn delete(&self, id: &NetworkRuleId) -> Result<(), NetworkRepositoryError>;
    fn delete_by_profile(&self, profile_id: &ProfileId) -> Result<usize, NetworkRepositoryError>;
    fn clear_storage(&self) -> Result<(), NetworkRepositoryError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetworkRepositoryError {
    AlreadyExists,
    NotFound,
    CorruptData,
    UnsupportedSchemaVersion(u64),
    SensitiveField,
    Io,
}

impl fmt::Display for NetworkRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::AlreadyExists => "network rule already exists",
            Self::NotFound => "network rule was not found",
            Self::CorruptData => "network rule storage is corrupt",
            Self::UnsupportedSchemaVersion(_) => "network rule schema is not supported",
            Self::SensitiveField => "network rule storage contains a sensitive field",
            Self::Io => "network rule storage is unavailable",
        })
    }
}

impl Error for NetworkRepositoryError {}
