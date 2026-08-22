use crate::domain::{
    auth::{SecretBytes, SecretText},
    credential::{
        CredentialError, CredentialId, CredentialMaterial, CredentialSummary, RecoveryKeyFile,
        VaultStatus,
    },
};

pub trait CredentialVault: Send + Sync {
    fn status(&self) -> Result<VaultStatus, CredentialError>;
    fn prepare_initial_recovery(&self) -> Result<RecoveryKeyFile, CredentialError>;
    fn initialize(
        &self,
        master_password: SecretText,
        recovery_file: RecoveryKeyFile,
    ) -> Result<(), CredentialError>;
    fn unlock(&self, master_password: SecretText) -> Result<(), CredentialError>;
    fn change_master_password(
        &self,
        old_password: SecretText,
        new_password: SecretText,
    ) -> Result<(), CredentialError>;
    fn prepare_recovery_reset(
        &self,
        current_recovery_file: RecoveryKeyFile,
    ) -> Result<RecoveryKeyFile, CredentialError>;
    fn reset_master_password(
        &self,
        current_recovery_file: RecoveryKeyFile,
        replacement_recovery_file: RecoveryKeyFile,
        new_password: SecretText,
    ) -> Result<(), CredentialError>;
    fn lock(&self);
    fn clear(&self) -> Result<(), CredentialError>;
    fn list(&self) -> Result<Vec<CredentialSummary>, CredentialError>;
    fn save_password(
        &self,
        id: CredentialId,
        name: String,
        password: SecretText,
    ) -> Result<CredentialSummary, CredentialError>;
    fn save_private_key(
        &self,
        id: CredentialId,
        name: String,
        key: SecretBytes,
        passphrase: Option<SecretText>,
        algorithm: String,
    ) -> Result<CredentialSummary, CredentialError>;
    fn rename(&self, id: &CredentialId, name: String)
    -> Result<CredentialSummary, CredentialError>;
    fn load(&self, id: &CredentialId) -> Result<CredentialMaterial, CredentialError>;
    fn delete(&self, id: &CredentialId) -> Result<(), CredentialError>;
}
