use crate::{
    domain::session::{HostEndpoint, HostKeyCheck, PresentedHostKey, classify_host_key},
    ports::known_host_repository::{KnownHostRepository, KnownHostRepositoryError},
};

pub struct HostKeyService<R> {
    repository: R,
}

impl<R: KnownHostRepository> HostKeyService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub fn check(
        &self,
        endpoint: &HostEndpoint,
        presented: &PresentedHostKey,
    ) -> Result<HostKeyCheck, KnownHostRepositoryError> {
        let trusted = self.repository.find(endpoint)?;
        Ok(classify_host_key(trusted.as_ref(), presented))
    }

    pub fn accept(
        &self,
        endpoint: &HostEndpoint,
        presented: &PresentedHostKey,
    ) -> Result<(), KnownHostRepositoryError> {
        self.repository.trust(endpoint, presented)
    }
}
