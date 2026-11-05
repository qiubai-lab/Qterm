use crate::domain::session::{HostEndpoint, PresentedHostKey};

pub trait KnownHostRepository: Send + Sync {
    fn find(
        &self,
        endpoint: &HostEndpoint,
    ) -> Result<Option<PresentedHostKey>, KnownHostRepositoryError>;
    fn forget(
        &self,
        endpoint: &HostEndpoint,
        fingerprint: &str,
    ) -> Result<bool, KnownHostRepositoryError>;
    fn trust(
        &self,
        endpoint: &HostEndpoint,
        key: &PresentedHostKey,
    ) -> Result<(), KnownHostRepositoryError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KnownHostRepositoryError {
    Io,
    CorruptData,
    UnsupportedSchemaVersion,
}
