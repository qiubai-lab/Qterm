#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub legacy: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CredentialError {
    InvalidMasterPassword,
    WeakMasterPassword,
    AlreadyInitialized,
    NotInitialized,
    Locked,
    CredentialNotFound,
    CorruptVault,
    UnsupportedVaultVersion,
    StorageUnavailable,
    CryptoFailure,
    InvalidCredential,
    InvalidRecoveryFile,
    RecoveryFileMismatch,
    RecoveryFileStorageUnavailable,
}
use crate::domain::auth::{SecretBytes, SecretText};

const MAX_CREDENTIAL_ID_LENGTH: usize = 128;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct CredentialId(String);

impl CredentialId {
    pub fn parse(value: impl Into<String>) -> Result<Self, CredentialError> {
        let value = value.into();
        if value.is_empty()
            || value.len() > MAX_CREDENTIAL_ID_LENGTH
            || value
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
        {
            return Err(CredentialError::InvalidCredential);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CredentialKind {
    Password,
    PrivateKey,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CredentialSummary {
    pub id: CredentialId,
    pub name: String,
    pub kind: CredentialKind,
    pub detail: Option<String>,
}

pub enum CredentialMaterial {
    Password(SecretText),
    PrivateKey {
        data: SecretBytes,
        passphrase: Option<SecretText>,
    },
}

pub struct RecoveryKeyFile(SecretBytes);

impl RecoveryKeyFile {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(SecretBytes::new(bytes))
    }

    pub fn expose(&self) -> &[u8] {
        self.0.expose()
    }
}

impl std::fmt::Debug for RecoveryKeyFile {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("RecoveryKeyFile([REDACTED])")
    }
}

impl std::fmt::Debug for CredentialMaterial {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Password(_) => formatter.write_str("CredentialMaterial::Password([REDACTED])"),
            Self::PrivateKey { passphrase, .. } => formatter
                .debug_struct("CredentialMaterial::PrivateKey")
                .field("data", &"[REDACTED]")
                .field("has_passphrase", &passphrase.is_some())
                .finish(),
        }
    }
}
