use super::*;

pub(super) fn random_key() -> Result<Zeroizing<Vec<u8>>, CredentialError> {
    let mut key = Zeroizing::new(vec![0; KEY_BYTES]);
    getrandom::fill(&mut key).map_err(|_| CredentialError::CryptoFailure)?;
    Ok(key)
}
pub(super) fn recovery_file(
    vault_id: String,
    generation: u64,
) -> Result<RecoveryKeyFile, CredentialError> {
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

pub(super) fn decode_recovery_file(
    value: &RecoveryKeyFile,
) -> Result<RecoveryDocument, CredentialError> {
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

pub(super) fn verify_recovery_file(
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

pub(super) fn decrypt_recovery_data_key(
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

pub(super) fn verify_data_key(document: &Document, data_key: &[u8]) -> Result<(), CredentialError> {
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
pub(super) fn derive(
    password: &str,
    kdf: &KdfRecord,
) -> Result<Zeroizing<Vec<u8>>, CredentialError> {
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
pub(super) fn encrypt(
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
pub(super) fn decrypt(
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
pub(super) fn nonce_bytes(encrypted: &Encrypted) -> Result<Vec<u8>, CredentialError> {
    let nonce = BASE64
        .decode(&encrypted.nonce)
        .map_err(|_| CredentialError::CorruptVault)?;
    if nonce.len() != NONCE_BYTES {
        return Err(CredentialError::CorruptVault);
    }
    Ok(nonce)
}
pub(super) fn validate_document(document: &Document) -> Result<(), CredentialError> {
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
pub(super) fn validate_kdf(kdf: &KdfRecord) -> Result<(), CredentialError> {
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
pub(super) fn validate_encrypted(value: &Encrypted) -> Result<(), CredentialError> {
    nonce_bytes(value)?;
    if BASE64
        .decode(&value.ciphertext)
        .map_or(true, |data| data.len() < 16)
    {
        return Err(CredentialError::CorruptVault);
    }
    Ok(())
}
pub(super) fn password_wrap_aad(vault_id: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:password-wrap")
}
pub(super) fn recovery_wrap_aad(vault_id: &str, generation: u64) -> String {
    format!("qterm:vault:v3:{vault_id}:recovery:{generation}:wrap")
}
pub(super) fn check_aad(vault_id: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:check")
}
pub(super) fn credential_aad(vault_id: &str, id: &str, kind: &str) -> String {
    format!("qterm:vault:v3:{vault_id}:credential:{id}:{kind}:secret")
}
pub(super) fn encode_key(
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
pub(super) fn decode_key(
    value: &[u8],
) -> Result<(SecretBytes, Option<SecretText>), CredentialError> {
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
