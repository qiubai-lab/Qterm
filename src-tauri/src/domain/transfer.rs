use std::fmt;

const MAX_REMOTE_PATH_BYTES: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemotePath(String);

impl RemotePath {
    pub fn new(value: impl Into<String>) -> Result<Self, TransferValidationError> {
        let value = value.into();
        if value.trim().is_empty() || value.len() > MAX_REMOTE_PATH_BYTES || value.contains('\0') {
            return Err(TransferValidationError);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransferValidationError;

impl fmt::Display for TransferValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("invalid remote file path")
    }
}

impl std::error::Error for TransferValidationError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TransferEvent {
    Started {
        total_bytes: u64,
    },
    Progress {
        transferred_bytes: u64,
        total_bytes: u64,
    },
    Completed,
    Cancelled,
    Failed,
}

#[cfg(test)]
mod tests {
    use super::RemotePath;

    #[test]
    fn remote_paths_reject_empty_nul_and_unbounded_values() {
        assert!(RemotePath::new("/tmp/archive.tar").is_ok());
        assert!(RemotePath::new("  ").is_err());
        assert!(RemotePath::new("/tmp/a\0b").is_err());
        assert!(RemotePath::new("x".repeat(4097)).is_err());
    }
}
