use std::{fs::File, io::Read, path::Path};

use zeroize::Zeroizing;

use crate::{
    application::error::ApplicationError,
    commands::error::IpcError,
    domain::auth::{AuthFailure, PrivateKeyAlgorithm},
};

const MAX_PRIVATE_KEY_BYTES: u64 = 1024 * 1024;

pub(super) fn read_private_key(path: &Path) -> Result<Zeroizing<Vec<u8>>, IpcError> {
    let file = File::open(path).map_err(|_| ApplicationError::from(AuthFailure::KeyUnreadable))?;
    let metadata = file
        .metadata()
        .map_err(|_| ApplicationError::from(AuthFailure::KeyUnreadable))?;
    if !metadata.is_file() || metadata.len() > MAX_PRIVATE_KEY_BYTES {
        return Err(IpcError::from(ApplicationError::from(
            AuthFailure::KeyTooLarge,
        )));
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_PRIVATE_KEY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ApplicationError::from(AuthFailure::KeyUnreadable))?;
    if bytes.len() as u64 > MAX_PRIVATE_KEY_BYTES {
        return Err(IpcError::from(ApplicationError::from(
            AuthFailure::KeyTooLarge,
        )));
    }
    Ok(bytes)
}

pub(super) fn private_key_algorithm_name(algorithm: PrivateKeyAlgorithm) -> &'static str {
    match algorithm {
        PrivateKeyAlgorithm::Ed25519 => "ed25519",
        PrivateKeyAlgorithm::EcdsaP256 => "ecdsa-p256",
        PrivateKeyAlgorithm::EcdsaP384 => "ecdsa-p384",
        PrivateKeyAlgorithm::EcdsaP521 => "ecdsa-p521",
        PrivateKeyAlgorithm::Rsa => "rsa",
    }
}
