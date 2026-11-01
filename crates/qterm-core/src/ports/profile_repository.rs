use std::{error::Error, fmt};

use crate::domain::{
    credential::CredentialId,
    profile::{ConnectionProfile, JumpRouteError, ProfileGroup, ProfileGroupId, ProfileId},
};

pub trait ProfileRepository: Send + Sync {
    fn list(&self) -> Result<Vec<ConnectionProfile>, ProfileRepositoryError>;
    fn list_groups(&self) -> Result<Vec<ProfileGroup>, ProfileRepositoryError>;
    fn insert(&self, profile: ConnectionProfile) -> Result<(), ProfileRepositoryError>;
    fn insert_many(&self, profiles: Vec<ConnectionProfile>) -> Result<(), ProfileRepositoryError> {
        for profile in profiles {
            self.insert(profile)?;
        }
        Ok(())
    }
    fn update(&self, profile: ConnectionProfile) -> Result<(), ProfileRepositoryError>;
    fn delete(&self, id: &ProfileId) -> Result<(), ProfileRepositoryError>;
    fn clear_credential_references(&self, id: &CredentialId) -> Result<(), ProfileRepositoryError>;
    fn clear_all_credential_references(&self) -> Result<(), ProfileRepositoryError>;
    fn clear_unsupported_storage(&self) -> Result<(), ProfileRepositoryError>;
    fn insert_group(&self, group: ProfileGroup) -> Result<(), ProfileRepositoryError>;
    fn update_group(&self, group: ProfileGroup) -> Result<(), ProfileRepositoryError>;
    fn delete_group(&self, id: &ProfileGroupId) -> Result<(), ProfileRepositoryError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProfileRepositoryError {
    AlreadyExists,
    NotFound,
    GroupAlreadyExists,
    GroupNotFound,
    ReferencedAsJump,
    InvalidJumpRoute(JumpRouteError),
    CorruptData,
    UnsupportedSchemaVersion(u64),
    SensitiveField,
    StorageIsCurrent,
    Io,
}

impl fmt::Display for ProfileRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::AlreadyExists => "profile already exists",
            Self::NotFound => "profile was not found",
            Self::GroupAlreadyExists => "profile group already exists",
            Self::GroupNotFound => "profile group was not found",
            Self::ReferencedAsJump => "profile is referenced as a jump",
            Self::InvalidJumpRoute(_) => "profile jump route is invalid",
            Self::CorruptData => "profile storage is corrupt",
            Self::UnsupportedSchemaVersion(_) => "profile storage schema is not supported",
            Self::SensitiveField => "profile storage contains a forbidden sensitive field",
            Self::StorageIsCurrent => "profile storage is already current",
            Self::Io => "profile storage is unavailable",
        };
        formatter.write_str(message)
    }
}

impl Error for ProfileRepositoryError {}
