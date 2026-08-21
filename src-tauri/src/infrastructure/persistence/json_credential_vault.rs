use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::{Mutex, MutexGuard},
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

pub struct JsonCredentialVault {
    path: PathBuf,
    default_kdf: KdfRecord,
    state: Mutex<Runtime>,
}

#[derive(Default)]
struct Runtime {
    data_key: Option<Zeroizing<Vec<u8>>>,
}

impl JsonCredentialVault {
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
            state: Mutex::new(Runtime::default()),
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
        recovery_file(uuid::Uuid::new_v4().to_string(), 1)
    }
    fn initialize(
        &self,
        master_password: SecretText,
        recovery_file: RecoveryKeyFile,
    ) -> Result<(), CredentialError> {
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
        self.runtime().data_key = None;
    }
    fn clear(&self) -> Result<(), CredentialError> {
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
        if key.expose().is_empty() || key.expose().len() > MAX_KEY_BYTES {
            return Err(CredentialError::InvalidCredential);
        }
        let payload = encode_key(key.expose(), passphrase.as_ref())?;
        self.save_material(id, name, KindRecord::PrivateKey, Some(algorithm), &payload)
    }
    fn load(&self, id: &CredentialId) -> Result<CredentialMaterial, CredentialError> {
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
fn random_key() -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    let mut key = Zeroizing::new(vec![0; KEY_BYTES]);
    getrandom::fill(&mut key).map_err(|_| CredentialError::CryptoFailure)?;
    Ok(key)
}
fn recovery_file(vault_id: String, generation: u64) -> Result<RecoveryKeyFile, CredentialError> {
    if uuid::Uuid::parse_str(&vault_id).is_err() || generation == 0 {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    let key = random_key()?;
    let document = RecoveryDocument {
        schema_version: RECOVERY_FILE_VERSION,
        purpose: RECOVERY_PURPOSE.into(),
        vault_id,
        generation,
        recovery_key: BASE64.encode(&key),
    };
    let mut bytes =
        serde_json::to_vec_pretty(&document).map_err(|_| CredentialError::CryptoFailure)?;
    bytes.push(b'\n');
    Ok(RecoveryKeyFile::new(bytes))
}

fn decode_recovery_file(value: &RecoveryKeyFile) -> Result<RecoveryDocument, CredentialError> {
    if value.expose().is_empty() || value.expose().len() > MAX_RECOVERY_FILE_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    let document: RecoveryDocument =
        serde_json::from_slice(value.expose()).map_err(|_| CredentialError::InvalidRecoveryFile)?;
    if document.schema_version != RECOVERY_FILE_VERSION
        || document.purpose != RECOVERY_PURPOSE
        || document.generation == 0
        || uuid::Uuid::parse_str(&document.vault_id).is_err()
    {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    document.key()?;
    Ok(document)
}

fn verify_recovery_file(
    document: &Document,
    value: &RecoveryKeyFile,
) -> Result<RecoveryDocument, CredentialError> {
    let recovery = decode_recovery_file(value)?;
    if recovery.vault_id != document.vault_id || recovery.generation != document.recovery_generation
    {
        return Err(CredentialError::RecoveryFileMismatch);
    }
    Ok(recovery)
}

fn decrypt_recovery_data_key(
    document: &Document,
    recovery: &RecoveryDocument,
) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    let key = recovery.key()?;
    decrypt(
        &key,
        &document.recovery_wrapped_data_key,
        recovery_wrap_aad(&document.vault_id, document.recovery_generation).as_bytes(),
    )
    .map_err(|_| CredentialError::InvalidRecoveryFile)
}

fn verify_data_key(document: &Document, data_key: &[u8]) -> Result<(), CredentialError> {
    if data_key.len() != KEY_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    let check = decrypt(
        data_key,
        &document.check,
        check_aad(&document.vault_id).as_bytes(),
    )
    .map_err(|_| CredentialError::InvalidRecoveryFile)?;
    if check.as_slice() != CHECK {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    Ok(())
}
fn derive(password: &str, kdf: &KdfRecord) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    if kdf.algorithm != "argon2id" {
        return Err(CredentialError::CorruptVault);
    }
    let salt = BASE64
        .decode(&kdf.salt)
        .map_err(|_| CredentialError::CorruptVault)?;
    if salt.len() != SALT_BYTES {
        return Err(CredentialError::CorruptVault);
    }
    let params = Params::new(
        kdf.memory_kib,
        kdf.iterations,
        kdf.parallelism,
        Some(KEY_BYTES),
    )
    .map_err(|_| CredentialError::CorruptVault)?;
    let mut key = Zeroizing::new(vec![0; KEY_BYTES]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|_| CredentialError::CryptoFailure)?;
    Ok(key)
}
fn encrypt(
    key: &[u8],
    plain: &[u8],
    aad: &[u8],
    used: &[Vec<u8>],
) -> Result<Encrypted, CredentialError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CredentialError::CryptoFailure)?;
    let mut nonce = [0; NONCE_BYTES];
    loop {
        getrandom::fill(&mut nonce).map_err(|_| CredentialError::CryptoFailure)?;
        if !used.iter().any(|value| value == nonce.as_slice()) {
            break;
        }
    }
    let nonce = Nonce::from(nonce);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plain, aad })
        .map_err(|_| CredentialError::CryptoFailure)?;
    Ok(Encrypted {
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    })
}
fn decrypt(
    key: &[u8],
    encrypted: &Encrypted,
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    let nonce = nonce_bytes(encrypted)?;
    let nonce = Nonce::try_from(nonce.as_slice()).map_err(|_| CredentialError::CorruptVault)?;
    let ciphertext = BASE64
        .decode(&encrypted.ciphertext)
        .map_err(|_| CredentialError::CorruptVault)?;
    Aes256Gcm::new_from_slice(key)
        .map_err(|_| CredentialError::CryptoFailure)?
        .decrypt(
            &nonce,
            Payload {
                msg: &ciphertext,
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| CredentialError::CryptoFailure)
}
fn nonce_bytes(encrypted: &Encrypted) -> Result<Vec<u8>, CredentialError> {
    let nonce = BASE64
        .decode(&encrypted.nonce)
        .map_err(|_| CredentialError::CorruptVault)?;
    if nonce.len() != NONCE_BYTES {
        return Err(CredentialError::CorruptVault);
    }
    Ok(nonce)
}
fn validate_document(document: &Document) -> Result<(), CredentialError> {
    if document.schema_version != VERSION {
        return Err(CredentialError::UnsupportedVaultVersion);
    }
    if uuid::Uuid::parse_str(&document.vault_id).is_err() || document.recovery_generation == 0 {
        return Err(CredentialError::CorruptVault);
    }
    validate_kdf(&document.kdf)?;
    validate_encrypted(&document.wrapped_data_key)?;
    validate_encrypted(&document.recovery_wrapped_data_key)?;
    validate_encrypted(&document.check)?;
    if document.credentials.len() > MAX_ITEMS {
        return Err(CredentialError::CorruptVault);
    }
    let mut ids = HashSet::new();
    let mut data_key_nonces = HashSet::from([nonce_bytes(&document.check)?]);
    for item in &document.credentials {
        CredentialId::parse(item.id.clone()).map_err(|_| CredentialError::CorruptVault)?;
        if item.name.trim().is_empty() || item.name.chars().count() > 80 || !ids.insert(&item.id) {
            return Err(CredentialError::CorruptVault);
        }
        validate_encrypted(&item.encrypted)?;
        if !data_key_nonces.insert(nonce_bytes(&item.encrypted)?) {
            return Err(CredentialError::CorruptVault);
        }
    }
    Ok(())
}
fn validate_kdf(kdf: &KdfRecord) -> Result<(), CredentialError> {
    if kdf.algorithm != "argon2id"
        || BASE64
            .decode(&kdf.salt)
            .map_or(true, |salt| salt.len() != SALT_BYTES)
    {
        return Err(CredentialError::CorruptVault);
    }
    Params::new(
        kdf.memory_kib,
        kdf.iterations,
        kdf.parallelism,
        Some(KEY_BYTES),
    )
    .map(|_| ())
    .map_err(|_| CredentialError::CorruptVault)
}
fn validate_encrypted(value: &Encrypted) -> Result<(), CredentialError> {
    nonce_bytes(value)?;
    if BASE64
        .decode(&value.ciphertext)
        .map_or(true, |data| data.len() < 16)
    {
        return Err(CredentialError::CorruptVault);
    }
    Ok(())
}
fn password_wrap_aad(vault_id: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:password-wrap")
}
fn recovery_wrap_aad(vault_id: &str, generation: u64) -> String {
    format!("qterm:vault:v3:{vault_id}:recovery:{generation}:wrap")
}
fn check_aad(vault_id: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:check")
}
fn credential_aad(vault_id: &str, id: &str, kind: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:credential:{id}:{kind}:secret")
}
fn encode_key(
    key: &[u8],
    passphrase: Option<&SecretText>,
) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    let key_len = u32::try_from(key.len()).map_err(|_| CredentialError::InvalidCredential)?;
    let pass = passphrase.map(SecretText::expose);
    let pass_len = pass
        .map(|value| u32::try_from(value.len()).map_err(|_| CredentialError::InvalidCredential))
        .transpose()?
        .unwrap_or(u32::MAX);
    let mut out = Zeroizing::new(Vec::with_capacity(8 + key.len() + pass.map_or(0, str::len)));
    out.extend_from_slice(&key_len.to_be_bytes());
    out.extend_from_slice(key);
    out.extend_from_slice(&pass_len.to_be_bytes());
    if let Some(pass) = pass {
        out.extend_from_slice(pass.as_bytes());
    }
    Ok(out)
}
fn decode_key(value: &[u8]) -> Result<(SecretBytes, Option<SecretText>), CredentialError> {
    if value.len() < 8 {
        return Err(CredentialError::CorruptVault);
    }
    let key_len = u32::from_be_bytes(
        value[0..4]
            .try_into()
            .map_err(|_| CredentialError::CorruptVault)?,
    ) as usize;
    if key_len == 0 || key_len > MAX_KEY_BYTES || value.len() < key_len + 8 {
        return Err(CredentialError::CorruptVault);
    }
    let offset = 4 + key_len;
    let pass_len = u32::from_be_bytes(
        value[offset..offset + 4]
            .try_into()
            .map_err(|_| CredentialError::CorruptVault)?,
    );
    let data = SecretBytes::new(value[4..offset].to_vec());
    let passphrase = if pass_len == u32::MAX {
        if value.len() != offset + 4 {
            return Err(CredentialError::CorruptVault);
        }
        None
    } else {
        let pass_len = pass_len as usize;
        if value.len() != offset + 4 + pass_len {
            return Err(CredentialError::CorruptVault);
        }
        Some(SecretText::new(
            String::from_utf8(value[offset + 4..].to_vec())
                .map_err(|_| CredentialError::CorruptVault)?,
        ))
    };
    Ok((data, passphrase))
}

#[cfg(test)]
mod tests {
    use super::JsonCredentialVault;
    use crate::{
        domain::{
            auth::{SecretBytes, SecretText},
            credential::{CredentialError, CredentialId, CredentialMaterial, RecoveryKeyFile},
        },
        ports::credential_vault::CredentialVault,
    };
    use std::fs;
    use tempfile::tempdir;
    fn id(value: &str) -> CredentialId {
        CredentialId::parse(value).expect("id")
    }
    fn initialize(vault: &JsonCredentialVault, password: &str) -> RecoveryKeyFile {
        let recovery = vault.prepare_initial_recovery().expect("recovery");
        let saved = RecoveryKeyFile::new(recovery.expose().to_vec());
        vault
            .initialize(SecretText::new(password.into()), recovery)
            .expect("init");
        saved
    }
    #[test]
    fn envelope_round_trip_keeps_all_secrets_out_of_json() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        initialize(&vault, "correct-master-password");
        vault
            .save_password(
                id("password-1"),
                "Production".into(),
                SecretText::new("server-secret".into()),
            )
            .expect("save");
        vault
            .save_private_key(
                id("key-1"),
                "Deploy".into(),
                SecretBytes::new(b"PRIVATE KEY MATERIAL".to_vec()),
                Some(SecretText::new("key-secret".into())),
                "ed25519".into(),
            )
            .expect("save key");
        let json = fs::read_to_string(path).expect("read");
        for value in [
            "correct-master-password",
            "server-secret",
            "PRIVATE KEY MATERIAL",
            "key-secret",
        ] {
            assert!(!json.contains(value));
        }
        assert!(json.contains("\"schemaVersion\": 3"));
        vault.lock();
        assert_eq!(
            vault
                .list()
                .expect("credential metadata remains available while locked")
                .into_iter()
                .map(|item| item.name)
                .collect::<Vec<_>>(),
            vec!["Production", "Deploy"]
        );
        assert!(matches!(
            vault.load(&id("password-1")),
            Err(CredentialError::Locked)
        ));
        assert_eq!(
            vault.unlock(SecretText::new("wrong-password-value".into())),
            Err(CredentialError::InvalidMasterPassword)
        );
        vault
            .unlock(SecretText::new("correct-master-password".into()))
            .expect("unlock");
        match vault.load(&id("password-1")).expect("load") {
            CredentialMaterial::Password(secret) => assert_eq!(secret.expose(), "server-secret"),
            _ => panic!("kind"),
        }
        match vault.load(&id("key-1")).expect("load") {
            CredentialMaterial::PrivateKey { data, passphrase } => {
                assert_eq!(data.expose(), b"PRIVATE KEY MATERIAL");
                assert_eq!(passphrase.expect("pass").expose(), "key-secret");
            }
            _ => panic!("kind"),
        }
    }

    #[test]
    fn rejects_legacy_vault_without_modifying_it() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let legacy = br#"{"schemaVersion":1,"kdf":{},"check":{},"credentials":[]}"#;
        fs::write(&path, legacy).expect("fixture");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        assert_eq!(
            vault.status(),
            Ok(crate::domain::credential::VaultStatus {
                initialized: false,
                unlocked: false,
                legacy: true,
            })
        );
        assert_eq!(fs::read(path).expect("unchanged"), legacy);
    }

    #[test]
    fn changing_master_password_rewraps_only_the_data_key() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        let recovery = initialize(&vault, "old-master-password");
        vault
            .save_password(
                id("password-1"),
                "Production".into(),
                SecretText::new("server-secret".into()),
            )
            .expect("save");
        let before: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");

        vault
            .change_master_password(
                SecretText::new("old-master-password".into()),
                SecretText::new("new-master-password".into()),
            )
            .expect("change");
        let after: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");
        assert_eq!(before["credentials"], after["credentials"]);
        assert_eq!(before["check"], after["check"]);
        assert_ne!(before["kdf"]["salt"], after["kdf"]["salt"]);
        assert_ne!(before["wrappedDataKey"], after["wrappedDataKey"]);

        vault.lock();
        assert_eq!(
            vault.unlock(SecretText::new("old-master-password".into())),
            Err(CredentialError::InvalidMasterPassword)
        );
        vault
            .unlock(SecretText::new("new-master-password".into()))
            .expect("new unlock");
        vault
            .prepare_recovery_reset(recovery)
            .expect("recovery remains valid after a normal password change");
    }

    #[test]
    fn rejected_password_change_keeps_vault_bytes_unchanged() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        initialize(&vault, "old-master-password");
        let before = fs::read(&path).expect("read");
        assert_eq!(
            vault.change_master_password(
                SecretText::new("wrong-master-password".into()),
                SecretText::new("new-master-password".into()),
            ),
            Err(CredentialError::InvalidMasterPassword)
        );
        assert_eq!(fs::read(path).expect("read"), before);
    }

    #[test]
    fn recovery_reset_rotates_file_and_rewraps_without_touching_credentials() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        let current = initialize(&vault, "old-master-password");
        vault
            .save_password(
                id("password-1"),
                "Production".into(),
                SecretText::new("server-secret".into()),
            )
            .expect("save");
        let before: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");
        let current_for_commit = RecoveryKeyFile::new(current.expose().to_vec());
        let current_after_rotation = RecoveryKeyFile::new(current.expose().to_vec());
        let replacement = vault
            .prepare_recovery_reset(current)
            .expect("prepare replacement");
        let replacement_saved = RecoveryKeyFile::new(replacement.expose().to_vec());

        vault
            .reset_master_password(
                current_for_commit,
                replacement,
                SecretText::new("new-master-password".into()),
            )
            .expect("reset");
        let after: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");
        assert_eq!(before["credentials"], after["credentials"]);
        assert_eq!(before["check"], after["check"]);
        assert_eq!(after["recoveryGeneration"], 2);
        assert_ne!(before["wrappedDataKey"], after["wrappedDataKey"]);
        assert_ne!(
            before["recoveryWrappedDataKey"],
            after["recoveryWrappedDataKey"]
        );

        vault.lock();
        assert_eq!(
            vault.unlock(SecretText::new("old-master-password".into())),
            Err(CredentialError::InvalidMasterPassword)
        );
        vault
            .unlock(SecretText::new("new-master-password".into()))
            .expect("new unlock");
        assert!(matches!(
            vault.load(&id("password-1")).expect("credential"),
            CredentialMaterial::Password(value) if value.expose() == "server-secret"
        ));
        assert!(matches!(
            vault.prepare_recovery_reset(current_after_rotation),
            Err(CredentialError::RecoveryFileMismatch)
        ));
        vault
            .prepare_recovery_reset(replacement_saved)
            .expect("replacement remains current");
    }

    #[test]
    fn invalid_recovery_reset_keeps_vault_bytes_unchanged() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        initialize(&vault, "old-master-password");
        let before = fs::read(&path).expect("before");
        let other = JsonCredentialVault::new_for_test(dir.path().join("other.json"))
            .prepare_initial_recovery()
            .expect("other");
        assert!(matches!(
            vault.prepare_recovery_reset(other),
            Err(CredentialError::RecoveryFileMismatch)
        ));
        assert_eq!(fs::read(path).expect("after"), before);
    }

    #[test]
    fn tampered_recovery_and_weak_new_password_never_modify_the_vault() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("vault.json");
        let vault = JsonCredentialVault::new_for_test(path.clone());
        let current = initialize(&vault, "old-master-password");
        let before = fs::read(&path).expect("before");
        let mut tampered: serde_json::Value =
            serde_json::from_slice(current.expose()).expect("recovery json");
        tampered["recoveryKey"] =
            serde_json::Value::String("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".into());
        assert!(matches!(
            vault.prepare_recovery_reset(RecoveryKeyFile::new(
                serde_json::to_vec(&tampered).expect("tampered")
            )),
            Err(CredentialError::InvalidRecoveryFile)
        ));
        assert_eq!(fs::read(&path).expect("after tamper"), before);

        let current_for_prepare = RecoveryKeyFile::new(current.expose().to_vec());
        let replacement = vault
            .prepare_recovery_reset(current_for_prepare)
            .expect("replacement");
        assert_eq!(
            vault.reset_master_password(current, replacement, SecretText::new("short".into())),
            Err(CredentialError::WeakMasterPassword)
        );
        assert_eq!(fs::read(path).expect("after weak password"), before);
    }
}
