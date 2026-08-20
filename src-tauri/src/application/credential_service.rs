use crate::{
    domain::{
        auth::{SecretBytes, SecretText},
        credential::{
            CredentialError, CredentialId, CredentialMaterial, CredentialSummary, RecoveryKeyFile,
            VaultStatus,
        },
    },
    ports::credential_vault::CredentialVault,
};

pub struct CredentialService<V> {
    vault: V,
}

impl<V: CredentialVault> CredentialService<V> {
    pub fn new(vault: V) -> Self {
        Self { vault }
    }
    pub fn status(&self) -> Result<VaultStatus, CredentialError> {
        self.vault.status()
    }
    pub fn prepare_initial_recovery(&self) -> Result<RecoveryKeyFile, CredentialError> {
        self.vault.prepare_initial_recovery()
    }
    pub fn initialize(
        &self,
        password: SecretText,
        recovery_file: RecoveryKeyFile,
    ) -> Result<(), CredentialError> {
        self.vault.initialize(password, recovery_file)
    }
    pub fn unlock(&self, password: SecretText) -> Result<(), CredentialError> {
        self.vault.unlock(password)
    }
    pub fn change_master_password(
        &self,
        old_password: SecretText,
        new_password: SecretText,
    ) -> Result<(), CredentialError> {
        self.vault
            .change_master_password(old_password, new_password)
    }
    pub fn prepare_recovery_reset(
        &self,
        current_recovery_file: RecoveryKeyFile,
    ) -> Result<RecoveryKeyFile, CredentialError> {
        self.vault.prepare_recovery_reset(current_recovery_file)
    }
    pub fn reset_master_password(
        &self,
        current_recovery_file: RecoveryKeyFile,
        replacement_recovery_file: RecoveryKeyFile,
        new_password: SecretText,
    ) -> Result<(), CredentialError> {
        self.vault.reset_master_password(
            current_recovery_file,
            replacement_recovery_file,
            new_password,
        )
    }
    pub fn lock(&self) {
        self.vault.lock();
    }
    pub fn clear(&self) -> Result<(), CredentialError> {
        self.vault.clear()
    }
    pub fn list(&self) -> Result<Vec<CredentialSummary>, CredentialError> {
        self.vault.list()
    }
    pub fn create_password(
        &self,
        name: String,
        password: SecretText,
    ) -> Result<CredentialSummary, CredentialError> {
        let name = normalize_name(name)?;
        let id = CredentialId::parse(uuid::Uuid::new_v4().to_string())?;
        self.vault.save_password(id, name, password)
    }
    pub fn import_private_key(
        &self,
        name: String,
        key: SecretBytes,
        passphrase: Option<SecretText>,
        algorithm: String,
    ) -> Result<CredentialSummary, CredentialError> {
        let name = normalize_name(name)?;
        let id = CredentialId::parse(uuid::Uuid::new_v4().to_string())?;
        self.vault
            .save_private_key(id, name, key, passphrase, algorithm)
    }
    pub fn load(&self, id: &str) -> Result<CredentialMaterial, CredentialError> {
        self.vault.load(&CredentialId::parse(id.to_owned())?)
    }
    pub fn delete(&self, id: &str) -> Result<(), CredentialError> {
        self.vault.delete(&CredentialId::parse(id.to_owned())?)
    }
}

fn normalize_name(name: String) -> Result<String, CredentialError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err(CredentialError::InvalidCredential);
    }
    Ok(name.to_owned())
}
