use crate::domain::shell_integration::{RemoteShell, RemoteShellCacheError, RemoteShellTarget};

pub trait RemoteShellCacheRepository: Send + Sync {
    fn load(
        &self,
        target: &RemoteShellTarget,
    ) -> Result<Option<RemoteShell>, RemoteShellCacheError>;
    fn save(
        &self,
        target: &RemoteShellTarget,
        shell: RemoteShell,
    ) -> Result<(), RemoteShellCacheError>;
}
