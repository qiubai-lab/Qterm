mod crypto;
use crypto::*;
use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
};

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use argon2::{Algorithm, Argon2, Params, Version};
use atomic_write_file::AtomicWriteFile;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::{
    domain::{
        auth::{SecretBytes, SecretText},
        credential::{
            CredentialError, CredentialId, CredentialKind, CredentialMaterial, CredentialSummary,
            RecoveryKeyFile, VaultStatus,
        },
    },
    ports::credential_vault::CredentialVault,
};

const VERSION: u64 = 3;
const RECOVERY_FILE_VERSION: u64 = 1;
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const MAX_RECOVERY_FILE_BYTES: usize = 4 * 1024;
const MAX_ITEMS: usize = 2_048;
const MAX_KEY_BYTES: usize = 1024 * 1024;
const KEY_BYTES: usize = 32;
const SALT_BYTES: usize = 16;
const NONCE_BYTES: usize = 12;
const CHECK: &[u8] = b"qterm-credential-vault-v3";
const RECOVERY_PURPOSE: &str = "qterm-vault-recovery";

#[derive(Clone)]
pub struct JsonCredentialVault {
    path: PathBuf,
    default_kdf: KdfRecord,
    state: Arc<Mutex<Runtime>>,
}

#[derive(Default)]
struct Runtime {
    data_key: Option<Zeroizing<Vec<u8>>>,
}

impl JsonCredentialVault {
    pub(crate) fn fork_at(&self, path: PathBuf) -> Self {
        let fork = Self::new(path);
        fork.runtime().data_key = self.runtime().data_key.clone();
        fork
    }

    pub fn new(path: PathBuf) -> Self {
        Self::with_kdf(path, 65_536, 3, 4)
    }
    fn with_kdf(path: PathBuf, memory_kib: u32, iterations: u32, parallelism: u32) -> Self {
        Self {
            path,
            default_kdf: KdfRecord {
                algorithm: "argon2id".into(),
                memory_kib,
                iterations,
                parallelism,
                salt: String::new(),
            },
            state: Arc::new(Mutex::new(Runtime::default())),
        }
    }
    #[cfg(test)]
    pub(crate) fn new_for_test(path: PathBuf) -> Self {
        Self::with_kdf(path, 1_024, 1, 1)
    }
    fn runtime(&self) -> MutexGuard<'_, Runtime> {
        self.state.lock().unwrap_or_else(|value| value.into_inner())
    }
    fn raw(&self) -> Result<Vec<u8>, CredentialError> {
        let metadata = fs::metadata(&self.path).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                CredentialError::NotInitialized
            } else {
                CredentialError::StorageUnavailable
            }
        })?;
        if !metadata.is_file() || metadata.len() > MAX_BYTES {
            return Err(CredentialError::CorruptVault);
        }
        fs::read(&self.path).map_err(|_| CredentialError::StorageUnavailable)
    }
    fn document(&self) -> Result<Document, CredentialError> {
        let raw = self.raw()?;
        let value: serde_json::Value =
            serde_json::from_slice(&raw).map_err(|_| CredentialError::CorruptVault)?;
        let version = value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .ok_or(CredentialError::CorruptVault)?;
        if version != VERSION {
            return Err(CredentialError::UnsupportedVaultVersion);
        }
        let document: Document =
            serde_json::from_value(value).map_err(|_| CredentialError::CorruptVault)?;
        validate_document(&document)?;
        Ok(document)
    }
    fn stored_version(&self) -> Result<Option<u64>, CredentialError> {
        match fs::metadata(&self.path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(CredentialError::StorageUnavailable),
            Ok(metadata) if !metadata.is_file() || metadata.len() > MAX_BYTES => {
                return Err(CredentialError::CorruptVault);
            }
            Ok(_) => {}
        }
        let raw = fs::read(&self.path).map_err(|_| CredentialError::StorageUnavailable)?;
        let value: serde_json::Value =
            serde_json::from_slice(&raw).map_err(|_| CredentialError::CorruptVault)?;
        value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .map(Some)
            .ok_or(CredentialError::CorruptVault)
    }
    fn write(&self, document: &Document) -> Result<(), CredentialError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| CredentialError::StorageUnavailable)?;
        }
        let mut bytes =
            serde_json::to_vec_pretty(document).map_err(|_| CredentialError::StorageUnavailable)?;
        bytes.push(b'\n');
        let mut file =
            AtomicWriteFile::open(&self.path).map_err(|_| CredentialError::StorageUnavailable)?;
        file.write_all(&bytes)
            .map_err(|_| CredentialError::StorageUnavailable)?;
        file.commit()
            .map_err(|_| CredentialError::StorageUnavailable)
    }
    fn save_material(
        &self,
        id: CredentialId,
        name: String,
        kind: KindRecord,
        detail: Option<String>,
        plain: &[u8],
    ) -> Result<CredentialSummary, CredentialError> {
        let runtime = self.runtime();
        let key = runtime.data_key.as_deref().ok_or(CredentialError::Locked)?;
        let mut document = self.document()?;
        if document
            .credentials
            .iter()
            .any(|item| item.id == id.as_str())
        {
            return Err(CredentialError::InvalidCredential);
        }
        let mut used = vec![nonce_bytes(&document.check)?];
        used.extend(
            document
                .credentials
                .iter()
                .filter_map(|item| nonce_bytes(&item.encrypted).ok()),
        );
        let encrypted = encrypt(
            key,
            plain,
            credential_aad(&document.vault_id, id.as_str(), kind.as_str()).as_bytes(),
            &used,
        )?;
        let record = CredentialRecord {
            id: id.as_str().into(),
            name,
            kind,
            detail,
            encrypted,
        };
        let summary = record.clone().summary()?;
        document.credentials.push(record);
        self.write(&document)?;
        Ok(summary)
    }
}

impl CredentialVault for JsonCredentialVault {
    fn status(&self) -> Result<VaultStatus, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        match self.stored_version()? {
            None => Ok(VaultStatus {
                initialized: false,
                unlocked: false,
                legacy: false,
            }),
            Some(VERSION) => {
                self.document()?;
                Ok(VaultStatus {
                    initialized: true,
                    unlocked: self.runtime().data_key.is_some(),
                    legacy: false,
                })
            }
            Some(version) if version < VERSION => Ok(VaultStatus {
                initialized: false,
                unlocked: false,
                legacy: true,
            }),
            Some(_) => Err(CredentialError::UnsupportedVaultVersion),
        }
    }
    fn prepare_initial_recovery(&self) -> Result<RecoveryKeyFile, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        recovery_file(uuid::Uuid::new_v4().to_string(), 1)
    }
    fn initialize(
        &self,
        master_password: SecretText,
        recovery_file: RecoveryKeyFile,
    ) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        if master_password.expose().chars().count() < 12 {
            return Err(CredentialError::WeakMasterPassword);
        }
        if self.path.exists() {
            return Err(CredentialError::AlreadyInitialized);
        }
        let mut salt = [0; SALT_BYTES];
        getrandom::fill(&mut salt).map_err(|_| CredentialError::CryptoFailure)?;
        let mut kdf = self.default_kdf.clone();
        kdf.salt = BASE64.encode(salt);
        let kek = derive(master_password.expose(), &kdf)?;
        let recovery = decode_recovery_file(&recovery_file)?;
        if recovery.generation != 1 {
            return Err(CredentialError::InvalidRecoveryFile);
        }
        let recovery_key = recovery.key()?;
        let data_key = random_key()?;
        let vault_id = recovery.vault_id;
        let document = Document {
            schema_version: VERSION,
            vault_id: vault_id.clone(),
            recovery_generation: recovery.generation,
            kdf,
            wrapped_data_key: encrypt(
                &kek,
                &data_key,
                password_wrap_aad(&vault_id).as_bytes(),
                &[],
            )?,
            recovery_wrapped_data_key: encrypt(
                &recovery_key,
                &data_key,
                recovery_wrap_aad(&vault_id, recovery.generation).as_bytes(),
                &[],
            )?,
            check: encrypt(&data_key, CHECK, check_aad(&vault_id).as_bytes(), &[])?,
            credentials: vec![],
        };
        self.write(&document)?;
        self.runtime().data_key = Some(data_key);
        Ok(())
    }
    fn unlock(&self, master_password: SecretText) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let document = self.document()?;
        let kek = derive(master_password.expose(), &document.kdf)?;
        let data_key = decrypt(
            &kek,
            &document.wrapped_data_key,
            password_wrap_aad(&document.vault_id).as_bytes(),
        )
        .map_err(|_| CredentialError::InvalidMasterPassword)?;
        if data_key.len() != KEY_BYTES {
            return Err(CredentialError::CorruptVault);
        }
        let check = decrypt(
            &data_key,
            &document.check,
            check_aad(&document.vault_id).as_bytes(),
        )
        .map_err(|_| CredentialError::InvalidMasterPassword)?;
        if check.as_slice() != CHECK {
            return Err(CredentialError::InvalidMasterPassword);
        }
        self.runtime().data_key = Some(data_key);
        Ok(())
    }
    fn change_master_password(
        &self,
        old_password: SecretText,
        new_password: SecretText,
    ) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        if new_password.expose().chars().count() < 12 {
            return Err(CredentialError::WeakMasterPassword);
        }
        let mut document = self.document()?;
        let old_kek = derive(old_password.expose(), &document.kdf)?;
        let data_key = decrypt(
            &old_kek,
            &document.wrapped_data_key,
            password_wrap_aad(&document.vault_id).as_bytes(),
        )
        .map_err(|_| CredentialError::InvalidMasterPassword)?;
        if data_key.len() != KEY_BYTES {
            return Err(CredentialError::CorruptVault);
        }
        let check = decrypt(
            &data_key,
            &document.check,
            check_aad(&document.vault_id).as_bytes(),
        )
        .map_err(|_| CredentialError::InvalidMasterPassword)?;
        if check.as_slice() != CHECK {
            return Err(CredentialError::InvalidMasterPassword);
        }

        let mut salt = [0; SALT_BYTES];
        getrandom::fill(&mut salt).map_err(|_| CredentialError::CryptoFailure)?;
        let mut new_kdf = self.default_kdf.clone();
        new_kdf.salt = BASE64.encode(salt);
        let new_kek = derive(new_password.expose(), &new_kdf)?;
        let wrapped_data_key = encrypt(
            &new_kek,
            &data_key,
            password_wrap_aad(&document.vault_id).as_bytes(),
            &[],
        )?;
        document.kdf = new_kdf;
        document.wrapped_data_key = wrapped_data_key;
        self.write(&document)?;
        self.runtime().data_key = Some(data_key);
        Ok(())
    }
    fn prepare_recovery_reset(
        &self,
        current_recovery_file: RecoveryKeyFile,
    ) -> Result<RecoveryKeyFile, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let document = self.document()?;
        let recovery = verify_recovery_file(&document, &current_recovery_file)?;
        let data_key = decrypt_recovery_data_key(&document, &recovery)?;
        verify_data_key(&document, &data_key)?;
        let next_generation = document
            .recovery_generation
            .checked_add(1)
            .ok_or(CredentialError::CorruptVault)?;
        recovery_file(document.vault_id, next_generation)
    }
    fn reset_master_password(
        &self,
        current_recovery_file: RecoveryKeyFile,
        replacement_recovery_file: RecoveryKeyFile,
        new_password: SecretText,
    ) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        if new_password.expose().chars().count() < 12 {
            return Err(CredentialError::WeakMasterPassword);
        }
        let mut document = self.document()?;
        let current = verify_recovery_file(&document, &current_recovery_file)?;
        let data_key = decrypt_recovery_data_key(&document, &current)?;
        verify_data_key(&document, &data_key)?;

        let replacement = decode_recovery_file(&replacement_recovery_file)?;
        if replacement.vault_id != document.vault_id
            || replacement.generation
                != document
                    .recovery_generation
                    .checked_add(1)
                    .ok_or(CredentialError::CorruptVault)?
        {
            return Err(CredentialError::RecoveryFileMismatch);
        }
        let replacement_key = replacement.key()?;
        let mut salt = [0; SALT_BYTES];
        getrandom::fill(&mut salt).map_err(|_| CredentialError::CryptoFailure)?;
        let mut new_kdf = self.default_kdf.clone();
        new_kdf.salt = BASE64.encode(salt);
        let new_kek = derive(new_password.expose(), &new_kdf)?;
        document.kdf = new_kdf;
        document.wrapped_data_key = encrypt(
            &new_kek,
            &data_key,
            password_wrap_aad(&document.vault_id).as_bytes(),
            &[],
        )?;
        document.recovery_generation = replacement.generation;
        document.recovery_wrapped_data_key = encrypt(
            &replacement_key,
            &data_key,
            recovery_wrap_aad(&document.vault_id, replacement.generation).as_bytes(),
            &[],
        )?;
        self.write(&document)?;
        self.runtime().data_key = Some(data_key);
        Ok(())
    }
    fn lock(&self) {
        let _storage = super::configuration_gate::lock();
        self.runtime().data_key = None;
    }
    fn clear(&self) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let mut runtime = self.runtime();
        match fs::remove_file(&self.path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(CredentialError::StorageUnavailable),
        }
        runtime.data_key = None;
        Ok(())
    }
    fn list(&self) -> Result<Vec<CredentialSummary>, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        self.document()?
            .credentials
            .into_iter()
            .map(CredentialRecord::summary)
            .collect()
    }
    fn save_password(
        &self,
        id: CredentialId,
        name: String,
        password: SecretText,
    ) -> Result<CredentialSummary, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        if password.expose().is_empty() {
            return Err(CredentialError::InvalidCredential);
        }
        self.save_material(
            id,
            name,
            KindRecord::Password,
            None,
            password.expose().as_bytes(),
        )
    }
    fn save_private_key(
        &self,
        id: CredentialId,
        name: String,
        key: SecretBytes,
        passphrase: Option<SecretText>,
        algorithm: String,
    ) -> Result<CredentialSummary, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        if key.expose().is_empty() || key.expose().len() > MAX_KEY_BYTES {
            return Err(CredentialError::InvalidCredential);
        }
        let payload = encode_key(key.expose(), passphrase.as_ref())?;
        self.save_material(id, name, KindRecord::PrivateKey, Some(algorithm), &payload)
    }
    fn rename(
        &self,
        id: &CredentialId,
        name: String,
    ) -> Result<CredentialSummary, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let runtime = self.runtime();
        runtime.data_key.as_deref().ok_or(CredentialError::Locked)?;
        let mut document = self.document()?;
        let record = document
            .credentials
            .iter_mut()
            .find(|item| item.id == id.as_str())
            .ok_or(CredentialError::CredentialNotFound)?;
        record.name = name;
        let summary = record.clone().summary()?;
        self.write(&document)?;
        Ok(summary)
    }
    fn load(&self, id: &CredentialId) -> Result<CredentialMaterial, CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let runtime = self.runtime();
        let key = runtime.data_key.as_deref().ok_or(CredentialError::Locked)?;
        let document = self.document()?;
        let record = document
            .credentials
            .iter()
            .find(|item| item.id == id.as_str())
            .ok_or(CredentialError::CredentialNotFound)?;
        let plain = decrypt(
            key,
            &record.encrypted,
            credential_aad(&document.vault_id, &record.id, record.kind.as_str()).as_bytes(),
        )
        .map_err(|_| CredentialError::CorruptVault)?;
        match record.kind {
            KindRecord::Password => String::from_utf8(plain.to_vec())
                .map(SecretText::new)
                .map(CredentialMaterial::Password)
                .map_err(|_| CredentialError::CorruptVault),
            KindRecord::PrivateKey => {
                let (data, passphrase) = decode_key(&plain)?;
                Ok(CredentialMaterial::PrivateKey { data, passphrase })
            }
        }
    }
    fn delete(&self, id: &CredentialId) -> Result<(), CredentialError> {
        let _storage = super::configuration_gate::lock();
        if super::configuration_gate::pending(&self.path) {
            return Err(CredentialError::StorageUnavailable);
        }
        let runtime = self.runtime();
        runtime.data_key.as_deref().ok_or(CredentialError::Locked)?;
        let mut document = self.document()?;
        let before = document.credentials.len();
        document.credentials.retain(|item| item.id != id.as_str());
        if before == document.credentials.len() {
            return Err(CredentialError::CredentialNotFound);
        }
        self.write(&document)
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct KdfRecord {
    algorithm: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Document {
    schema_version: u64,
    vault_id: String,
    recovery_generation: u64,
    kdf: KdfRecord,
    wrapped_data_key: Encrypted,
    recovery_wrapped_data_key: Encrypted,
    check: Encrypted,
    credentials: Vec<CredentialRecord>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RecoveryDocument {
    schema_version: u64,
    purpose: String,
    vault_id: String,
    generation: u64,
    recovery_key: String,
}

impl RecoveryDocument {
    fn key(&self) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
        let key = BASE64
            .decode(&self.recovery_key)
            .map_err(|_| CredentialError::InvalidRecoveryFile)?;
        if key.len() != KEY_BYTES {
            return Err(CredentialError::InvalidRecoveryFile);
        }
        Ok(Zeroizing::new(key))
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CredentialRecord {
    id: String,
    name: String,
    kind: KindRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(flatten)]
    encrypted: Encrypted,
}
impl CredentialRecord {
    fn summary(self) -> Result<CredentialSummary, CredentialError> {
        Ok(CredentialSummary {
            id: CredentialId::parse(self.id)?,
            name: self.name,
            kind: self.kind.into(),
            detail: self.detail,
        })
    }
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum KindRecord {
    Password,
    PrivateKey,
}
impl KindRecord {
    fn as_str(self) -> &'static str {
        match self {
            Self::Password => "password",
            Self::PrivateKey => "privateKey",
        }
    }
}
impl From<KindRecord> for CredentialKind {
    fn from(value: KindRecord) -> Self {
        match value {
            KindRecord::Password => Self::Password,
            KindRecord::PrivateKey => Self::PrivateKey,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Encrypted {
    nonce: String,
    ciphertext: String,
}
#[cfg(test)]
mod tests;
