use std::{error::Error, fmt};

use crate::domain::workspace::WorkspaceDocument;

pub trait WorkspaceRepository: Send + Sync {
    fn load(&self) -> Result<Option<WorkspaceDocument>, WorkspaceRepositoryError>;
    fn save(&self, document: &WorkspaceDocument) -> Result<(), WorkspaceRepositoryError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkspaceRepositoryError {
    CorruptData,
    UnsupportedSchemaVersion(u64),
    SensitiveField,
    Io,
}

impl fmt::Display for WorkspaceRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::CorruptData => "workspace storage is corrupt",
            Self::UnsupportedSchemaVersion(_) => "workspace schema is unsupported",
            Self::SensitiveField => "workspace storage contains sensitive data",
            Self::Io => "workspace storage is unavailable",
        })
    }
}

impl Error for WorkspaceRepositoryError {}
