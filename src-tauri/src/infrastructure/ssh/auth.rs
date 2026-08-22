use std::{
    fs::File,
    io::{self, Read},
    path::Path,
    sync::Arc,
};

use russh::{
    MethodKind,
    client::{AuthResult, Handle, Handler},
    keys::{
        Algorithm, EcdsaCurve, HashAlg, PrivateKey, PrivateKeyWithHashAlg,
        agent::{AgentIdentity, client::AgentClient},
        ssh_key::{Error as SshKeyError, LineEnding, rand_core::UnwrapErr},
    },
};
use zeroize::Zeroizing;

use crate::domain::{
    auth::{AuthFailure, AuthRequest, AuthWarning, PrivateKeyAlgorithm, SecretText},
    credential::GeneratedPrivateKeyAlgorithm,
};

const MAX_PRIVATE_KEY_BYTES: u64 = 1024 * 1024;
const MAX_PPK_ARGON2_MEMORY_KIB: u32 = 256 * 1024;
const MAX_PPK_ARGON2_PASSES: u32 = 64;
const MAX_PPK_ARGON2_PARALLELISM: u32 = 8;

pub(crate) fn generate_private_key_bytes(
    algorithm: GeneratedPrivateKeyAlgorithm,
    comment: &str,
) -> Result<Zeroizing<Vec<u8>>, AuthFailure> {
    let algorithm = match algorithm {
        GeneratedPrivateKeyAlgorithm::Ed25519 => Algorithm::Ed25519,
        GeneratedPrivateKeyAlgorithm::EcdsaP256 => Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP256,
        },
        GeneratedPrivateKeyAlgorithm::EcdsaP384 => Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP384,
        },
        GeneratedPrivateKeyAlgorithm::EcdsaP521 => Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP521,
        },
    };
    let mut rng = UnwrapErr(getrandom::SysRng);
    let mut key =
        PrivateKey::random(&mut rng, algorithm).map_err(|_| AuthFailure::KeyGenerationFailed)?;
    key.set_comment(comment);
    let encoded = key
        .to_openssh(LineEnding::LF)
        .map_err(|_| AuthFailure::KeyGenerationFailed)?;
    Ok(Zeroizing::new(encoded.as_bytes().to_vec()))
}

/// A parsed key owned only by the SSH infrastructure boundary.
pub(crate) struct LoadedPrivateKey {
    key: Arc<PrivateKey>,
    algorithm: PrivateKeyAlgorithm,
    warnings: Vec<AuthWarning>,
}

impl LoadedPrivateKey {
    pub(crate) fn algorithm(&self) -> PrivateKeyAlgorithm {
        self.algorithm
    }

    pub(crate) fn openssh_public_key(&self) -> Result<String, AuthFailure> {
        self.key
            .public_key()
            .to_openssh()
            .map_err(|_| AuthFailure::CorruptKey)
    }

    pub(crate) fn public_key_fingerprint(&self) -> String {
        self.key
            .public_key()
            .fingerprint(HashAlg::Sha256)
            .to_string()
    }

    #[cfg(all(test, unix))]
    pub(crate) fn warnings(&self) -> &[AuthWarning] {
        &self.warnings
    }
}

impl std::fmt::Debug for LoadedPrivateKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LoadedPrivateKey")
            .field("key", &"[REDACTED]")
            .field("algorithm", &self.algorithm)
            .field("warnings", &self.warnings)
            .finish()
    }
}

pub(crate) fn load_private_key(
    path: &Path,
    passphrase: Option<&SecretText>,
) -> Result<LoadedPrivateKey, AuthFailure> {
    let file = File::open(path).map_err(map_open_error)?;
    let metadata = file.metadata().map_err(|_| AuthFailure::KeyUnreadable)?;
    if !metadata.is_file() {
        return Err(AuthFailure::KeyUnreadable);
    }
    if metadata.len() > MAX_PRIVATE_KEY_BYTES {
        return Err(AuthFailure::KeyTooLarge);
    }

    let capacity = usize::try_from(metadata.len()).map_err(|_| AuthFailure::KeyTooLarge)?;
    let mut bytes = Zeroizing::new(Vec::with_capacity(capacity));
    file.take(MAX_PRIVATE_KEY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| AuthFailure::KeyUnreadable)?;
    if bytes.len() as u64 > MAX_PRIVATE_KEY_BYTES {
        return Err(AuthFailure::KeyTooLarge);
    }
    let mut loaded = load_private_key_bytes(&bytes, passphrase)?;
    loaded.warnings = permission_warnings(&metadata);
    Ok(loaded)
}

pub(crate) fn load_private_key_bytes(
    bytes: &[u8],
    passphrase: Option<&SecretText>,
) -> Result<LoadedPrivateKey, AuthFailure> {
    let text = std::str::from_utf8(bytes).map_err(|_| AuthFailure::CorruptKey)?;
    let key = match private_key_container(text)? {
        PrivateKeyContainer::EncryptedPkcs8 | PrivateKeyContainer::EncryptedPutty => {
            let passphrase = passphrase.ok_or(AuthFailure::KeyEncrypted)?;
            russh::keys::decode_secret_key(text, Some(passphrase.expose()))
                .map_err(map_encrypted_key_error)?
        }
        PrivateKeyContainer::Other => match russh::keys::decode_secret_key(text, None) {
            Ok(key) => key,
            Err(russh::keys::Error::KeyIsEncrypted) => {
                let passphrase = passphrase.ok_or(AuthFailure::KeyEncrypted)?;
                russh::keys::decode_secret_key(text, Some(passphrase.expose()))
                    .map_err(map_encrypted_key_error)?
            }
            Err(error) => return Err(map_key_error(error)),
        },
    };
    let algorithm = map_algorithm(key.algorithm())?;

    Ok(LoadedPrivateKey {
        key: Arc::new(key),
        algorithm,
        warnings: Vec::new(),
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PrivateKeyContainer {
    EncryptedPkcs8,
    EncryptedPutty,
    Other,
}

fn private_key_container(text: &str) -> Result<PrivateKeyContainer, AuthFailure> {
    let text = text.trim_start();
    if text.starts_with("-----BEGIN ENCRYPTED PRIVATE KEY-----") {
        return Ok(PrivateKeyContainer::EncryptedPkcs8);
    }
    if !text.starts_with("PuTTY-User-Key-File-") {
        return Ok(PrivateKeyContainer::Other);
    }

    let header = text.lines().next().ok_or(AuthFailure::CorruptKey)?;
    let is_v3 = if header.starts_with("PuTTY-User-Key-File-2: ") {
        false
    } else if header.starts_with("PuTTY-User-Key-File-3: ") {
        true
    } else {
        return Err(AuthFailure::UnsupportedKey);
    };
    match putty_field(text, "Encryption") {
        Some("aes256-cbc") => {
            if is_v3 {
                validate_putty_argon2(text)?;
            }
            Ok(PrivateKeyContainer::EncryptedPutty)
        }
        Some("none") => Ok(PrivateKeyContainer::Other),
        Some(_) => Err(AuthFailure::UnsupportedKey),
        None => Err(AuthFailure::CorruptKey),
    }
}

fn putty_field<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    text.lines()
        .find_map(|line| line.strip_prefix(name)?.strip_prefix(": "))
}

fn validate_putty_argon2(text: &str) -> Result<(), AuthFailure> {
    if !matches!(
        putty_field(text, "Key-Derivation"),
        Some("Argon2id" | "Argon2i" | "Argon2d")
    ) {
        return Err(AuthFailure::UnsupportedKey);
    }
    for (name, maximum) in [
        ("Argon2-Memory", MAX_PPK_ARGON2_MEMORY_KIB),
        ("Argon2-Passes", MAX_PPK_ARGON2_PASSES),
        ("Argon2-Parallelism", MAX_PPK_ARGON2_PARALLELISM),
    ] {
        let value = putty_field(text, name)
            .ok_or(AuthFailure::CorruptKey)?
            .parse::<u32>()
            .map_err(|_| AuthFailure::CorruptKey)?;
        if value == 0 || value > maximum {
            return Err(AuthFailure::UnsupportedKey);
        }
    }
    Ok(())
}

#[allow(
    dead_code,
    reason = "called by the SSH session adapter introduced in phase 4"
)]
pub(crate) async fn authenticate<H: Handler>(
    handle: &mut Handle<H>,
    username: String,
    request: AuthRequest,
) -> Result<Vec<AuthWarning>, AuthFailure> {
    match request {
        AuthRequest::Password(password) => {
            authenticate_with_password(handle, username, password).await?;
            Ok(Vec::new())
        }
        AuthRequest::PrivateKey { path, passphrase } => {
            let key = load_private_key(&path, passphrase.as_ref())?;
            authenticate_with_private_key(handle, username, key).await
        }
        AuthRequest::PrivateKeyData { data, passphrase } => {
            let key = load_private_key_bytes(data.expose(), passphrase.as_ref())?;
            authenticate_with_private_key(handle, username, key).await
        }
        AuthRequest::SshAgent => {
            authenticate_with_ssh_agent(handle, username).await?;
            Ok(Vec::new())
        }
    }
}

async fn authenticate_with_ssh_agent<H: Handler>(
    handle: &mut Handle<H>,
    username: String,
) -> Result<(), AuthFailure> {
    let mut agent = connect_ssh_agent().await?;
    let identities = agent
        .request_identities()
        .await
        .map_err(|_| AuthFailure::SshAgentUnavailable)?;
    if identities.is_empty() {
        return Err(AuthFailure::SshAgentEmpty);
    }

    let mut cached_rsa_hash = None;
    for identity in identities {
        let hash_alg = if identity.public_key().algorithm().is_rsa() {
            match cached_rsa_hash {
                Some(result) => result?,
                None => {
                    let result = handle
                        .best_supported_rsa_hash()
                        .await
                        .map_err(|_| AuthFailure::Connection)
                        .and_then(rsa_hash);
                    cached_rsa_hash = Some(result);
                    result?
                }
            }
        } else {
            None
        };
        let result = match identity {
            AgentIdentity::PublicKey { key, .. } => {
                handle
                    .authenticate_publickey_with(username.clone(), key, hash_alg, &mut agent)
                    .await
            }
            AgentIdentity::Certificate { certificate, .. } => {
                handle
                    .authenticate_certificate_with(
                        username.clone(),
                        certificate,
                        hash_alg,
                        &mut agent,
                    )
                    .await
            }
        }
        .map_err(|_| AuthFailure::SshAgentUnavailable)?;

        match result {
            AuthResult::Success => return Ok(()),
            AuthResult::Failure {
                partial_success: true,
                ..
            } => return Err(AuthFailure::ServerRejected),
            AuthResult::Failure {
                remaining_methods, ..
            } if !remaining_methods.contains(&MethodKind::PublicKey) => {
                return Err(AuthFailure::AuthenticationMethodDisabled);
            }
            AuthResult::Failure { .. } => {}
        }
    }
    Err(AuthFailure::SshAgentRejected)
}

fn rsa_hash(server_preference: Option<Option<HashAlg>>) -> Result<Option<HashAlg>, AuthFailure> {
    match server_preference {
        Some(Some(hash)) => Ok(Some(hash)),
        Some(None) => Err(AuthFailure::UnsupportedKey),
        None => Ok(Some(HashAlg::Sha512)),
    }
}

#[cfg(unix)]
async fn connect_ssh_agent()
-> Result<AgentClient<Box<dyn russh::keys::agent::client::AgentStream + Send + Unpin>>, AuthFailure>
{
    AgentClient::connect_env()
        .await
        .map(AgentClient::dynamic)
        .map_err(|_| AuthFailure::SshAgentUnavailable)
}

#[cfg(windows)]
async fn connect_ssh_agent()
-> Result<AgentClient<Box<dyn russh::keys::agent::client::AgentStream + Send + Unpin>>, AuthFailure>
{
    if let Ok(agent) = AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await {
        return Ok(agent.dynamic());
    }
    AgentClient::connect_pageant()
        .await
        .map(AgentClient::dynamic)
        .map_err(|_| AuthFailure::SshAgentUnavailable)
}

#[cfg(not(any(unix, windows)))]
async fn connect_ssh_agent()
-> Result<AgentClient<Box<dyn russh::keys::agent::client::AgentStream + Send + Unpin>>, AuthFailure>
{
    Err(AuthFailure::SshAgentUnavailable)
}

pub(crate) async fn authenticate_with_password<H: Handler>(
    handle: &mut Handle<H>,
    username: String,
    password: SecretText,
) -> Result<(), AuthFailure> {
    // russh currently requires an owned String. The source wrapper is still zeroized on return.
    let result = handle
        .authenticate_password(username, password.expose().to_owned())
        .await
        .map_err(|_| AuthFailure::Connection)?;
    map_auth_result(result, MethodKind::Password)
}

pub(crate) async fn authenticate_with_private_key<H: Handler>(
    handle: &mut Handle<H>,
    username: String,
    key: LoadedPrivateKey,
) -> Result<Vec<AuthWarning>, AuthFailure> {
    let hash_alg = if key.algorithm == PrivateKeyAlgorithm::Rsa {
        handle
            .best_supported_rsa_hash()
            .await
            .map_err(|_| AuthFailure::Connection)
            .and_then(rsa_hash)?
    } else {
        None
    };
    let result = handle
        .authenticate_publickey(username, PrivateKeyWithHashAlg::new(key.key, hash_alg))
        .await
        .map_err(|_| AuthFailure::Connection)?;
    map_auth_result(result, MethodKind::PublicKey)?;
    Ok(key.warnings)
}

fn map_auth_result(result: AuthResult, method: MethodKind) -> Result<(), AuthFailure> {
    match result {
        AuthResult::Success => Ok(()),
        AuthResult::Failure {
            partial_success: true,
            ..
        } => Err(AuthFailure::ServerRejected),
        AuthResult::Failure {
            remaining_methods, ..
        } if !remaining_methods.contains(&method) => Err(AuthFailure::AuthenticationMethodDisabled),
        AuthResult::Failure { .. } => Err(AuthFailure::InvalidCredentials),
    }
}

fn map_open_error(error: io::Error) -> AuthFailure {
    if error.kind() == io::ErrorKind::NotFound {
        AuthFailure::KeyMissing
    } else {
        AuthFailure::KeyUnreadable
    }
}

fn map_encrypted_key_error(error: russh::keys::Error) -> AuthFailure {
    match error {
        russh::keys::Error::UnsupportedKeyType { .. } | russh::keys::Error::UnknownAlgorithm(_) => {
            AuthFailure::UnsupportedKey
        }
        russh::keys::Error::SshKey(SshKeyError::AlgorithmUnknown)
        | russh::keys::Error::SshKey(SshKeyError::AlgorithmUnsupported { .. }) => {
            AuthFailure::UnsupportedKey
        }
        _ => AuthFailure::InvalidPassphrase,
    }
}

fn map_key_error(error: russh::keys::Error) -> AuthFailure {
    match error {
        russh::keys::Error::KeyIsEncrypted => AuthFailure::KeyEncrypted,
        russh::keys::Error::UnsupportedKeyType { .. } | russh::keys::Error::UnknownAlgorithm(_) => {
            AuthFailure::UnsupportedKey
        }
        russh::keys::Error::SshKey(SshKeyError::AlgorithmUnknown)
        | russh::keys::Error::SshKey(SshKeyError::AlgorithmUnsupported { .. }) => {
            AuthFailure::UnsupportedKey
        }
        _ => AuthFailure::CorruptKey,
    }
}

fn map_algorithm(algorithm: Algorithm) -> Result<PrivateKeyAlgorithm, AuthFailure> {
    match algorithm {
        Algorithm::Ed25519 => Ok(PrivateKeyAlgorithm::Ed25519),
        Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP256,
        } => Ok(PrivateKeyAlgorithm::EcdsaP256),
        Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP384,
        } => Ok(PrivateKeyAlgorithm::EcdsaP384),
        Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP521,
        } => Ok(PrivateKeyAlgorithm::EcdsaP521),
        Algorithm::Rsa { .. } => Ok(PrivateKeyAlgorithm::Rsa),
        _ => Err(AuthFailure::UnsupportedKey),
    }
}

#[cfg(unix)]
fn permission_warnings(metadata: &std::fs::Metadata) -> Vec<AuthWarning> {
    use std::os::unix::fs::PermissionsExt;

    if metadata.permissions().mode() & 0o077 == 0 {
        Vec::new()
    } else {
        vec![AuthWarning::InsecurePrivateKeyPermissions]
    }
}

#[cfg(not(unix))]
fn permission_warnings(_metadata: &std::fs::Metadata) -> Vec<AuthWarning> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use russh::keys::ssh_key::{
        Algorithm, Cipher, LineEnding, PrivateKey,
        private::{Ed25519Keypair, KeypairData},
        rand_core::UnwrapErr,
    };
    use tempfile::tempdir;

    use super::{
        PrivateKeyContainer, generate_private_key_bytes, load_private_key, load_private_key_bytes,
        map_auth_result, private_key_container, rsa_hash,
    };
    #[cfg(unix)]
    use crate::domain::auth::AuthWarning;
    use crate::domain::{
        auth::{AuthFailure, PrivateKeyAlgorithm, SecretText},
        credential::GeneratedPrivateKeyAlgorithm,
    };
    use russh::{MethodKind, MethodSet, client::AuthResult};

    fn test_key() -> PrivateKey {
        let keypair = Ed25519Keypair::from_seed(&[7; 32]);
        PrivateKey::new(KeypairData::from(keypair), "terminal-demo-test")
            .expect("create deterministic test key")
    }

    #[test]
    fn loads_only_the_explicit_unencrypted_key_path() {
        let directory = tempdir().expect("temp directory");
        let selected_path = directory.path().join("selected-key");
        let unrelated_path = directory.path().join("unrelated-key");
        let encoded = test_key()
            .to_openssh(LineEnding::LF)
            .expect("encode test key");
        fs::write(&selected_path, encoded.as_bytes()).expect("write selected key");
        fs::write(&unrelated_path, b"not a key").expect("write unrelated file");

        let loaded = load_private_key(&selected_path, None).expect("load selected key");

        assert_eq!(loaded.algorithm(), PrivateKeyAlgorithm::Ed25519);
        let public_key = loaded.openssh_public_key().expect("encode public key");
        assert!(public_key.starts_with("ssh-ed25519 "));
        assert!(!public_key.contains("PRIVATE"));
    }

    #[test]
    fn generates_unique_round_trip_openssh_keys_for_the_supported_algorithms() {
        for (algorithm, expected) in [
            (
                GeneratedPrivateKeyAlgorithm::Ed25519,
                PrivateKeyAlgorithm::Ed25519,
            ),
            (
                GeneratedPrivateKeyAlgorithm::EcdsaP256,
                PrivateKeyAlgorithm::EcdsaP256,
            ),
            (
                GeneratedPrivateKeyAlgorithm::EcdsaP384,
                PrivateKeyAlgorithm::EcdsaP384,
            ),
            (
                GeneratedPrivateKeyAlgorithm::EcdsaP521,
                PrivateKeyAlgorithm::EcdsaP521,
            ),
        ] {
            let first = generate_private_key_bytes(algorithm, "deploy@example")
                .expect("generate first key");
            let second = generate_private_key_bytes(algorithm, "deploy@example")
                .expect("generate second key");
            assert_ne!(first.as_slice(), second.as_slice());

            let loaded = load_private_key_bytes(&first, None).expect("generated key round trips");
            assert_eq!(loaded.algorithm(), expected);
            assert!(
                loaded
                    .openssh_public_key()
                    .expect("public key")
                    .ends_with(" deploy@example")
            );
        }
    }

    #[test]
    fn missing_and_corrupt_keys_have_stable_failures() {
        let directory = tempdir().expect("temp directory");
        let missing = directory.path().join("missing");
        assert_eq!(
            load_private_key(&missing, None).expect_err("missing key must fail"),
            AuthFailure::KeyMissing
        );

        let corrupt = directory.path().join("corrupt");
        fs::write(&corrupt, b"not a private key").expect("write corrupt key");
        assert_eq!(
            load_private_key(&corrupt, None).expect_err("corrupt key must fail"),
            AuthFailure::CorruptKey
        );
    }

    #[test]
    fn encrypted_keys_require_the_correct_passphrase() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("encrypted-key");
        let encrypted = test_key()
            .encrypt(&mut getrandom::SysRng, "correct passphrase")
            .expect("encrypt test key")
            .to_openssh(LineEnding::LF)
            .expect("encode encrypted key");
        fs::write(&path, encrypted.as_bytes()).expect("write encrypted key");

        assert_eq!(
            load_private_key(&path, None).expect_err("passphrase is required"),
            AuthFailure::KeyEncrypted
        );
        assert_eq!(
            load_private_key(&path, Some(&SecretText::new("wrong passphrase".to_owned())))
                .expect_err("wrong passphrase must fail"),
            AuthFailure::InvalidPassphrase
        );
        let loaded = load_private_key(
            &path,
            Some(&SecretText::new("correct passphrase".to_owned())),
        )
        .expect("correct passphrase loads key");
        assert_eq!(loaded.algorithm(), PrivateKeyAlgorithm::Ed25519);
    }

    #[test]
    fn encrypted_openssh_keys_accept_supported_modern_ciphers() {
        for cipher in [Cipher::Aes256Gcm, Cipher::ChaCha20Poly1305] {
            let encrypted = test_key()
                .encrypt_with_cipher(&mut getrandom::SysRng, cipher, "correct passphrase")
                .expect("encrypt key")
                .to_openssh(LineEnding::LF)
                .expect("encode encrypted key");

            assert_eq!(
                load_private_key_bytes(
                    encrypted.as_bytes(),
                    Some(&SecretText::new("correct passphrase".to_owned()))
                )
                .expect("supported cipher loads")
                .algorithm(),
                PrivateKeyAlgorithm::Ed25519
            );
        }
    }

    #[test]
    fn openssh_rsa_keys_load_and_derive_their_public_identity() {
        let rsa = PrivateKey::random(
            &mut UnwrapErr(getrandom::SysRng),
            Algorithm::Rsa { hash: None },
        )
        .expect("generate RSA fixture");
        let encoded = rsa.to_openssh(LineEnding::LF).expect("encode RSA fixture");

        let loaded = load_private_key_bytes(encoded.as_bytes(), None).expect("load RSA key");

        assert_eq!(loaded.algorithm(), PrivateKeyAlgorithm::Rsa);
        assert!(
            loaded
                .openssh_public_key()
                .expect("derive public key")
                .starts_with("ssh-rsa ")
        );
        assert!(loaded.public_key_fingerprint().starts_with("SHA256:"));

        let encrypted = rsa
            .encrypt(&mut getrandom::SysRng, "correct passphrase")
            .expect("encrypt RSA fixture")
            .to_openssh(LineEnding::LF)
            .expect("encode encrypted RSA fixture");
        assert_eq!(
            load_private_key_bytes(encrypted.as_bytes(), None)
                .expect_err("encrypted RSA key requires a passphrase"),
            AuthFailure::KeyEncrypted
        );
        assert_eq!(
            load_private_key_bytes(
                encrypted.as_bytes(),
                Some(&SecretText::new("correct passphrase".to_owned()))
            )
            .expect("load encrypted RSA key")
            .algorithm(),
            PrivateKeyAlgorithm::Rsa
        );
    }

    #[test]
    fn encrypted_pkcs8_keys_use_the_supplied_passphrase() {
        let mut encoded = Vec::new();
        russh::keys::encode_pkcs8_pem_encrypted(
            &test_key(),
            b"correct passphrase",
            10,
            &mut encoded,
        )
        .expect("encode encrypted PKCS#8 key");

        assert_eq!(
            load_private_key_bytes(&encoded, None).expect_err("passphrase is required"),
            AuthFailure::KeyEncrypted
        );
        assert_eq!(
            load_private_key_bytes(
                &encoded,
                Some(&SecretText::new("wrong passphrase".to_owned()))
            )
            .expect_err("wrong passphrase must fail"),
            AuthFailure::InvalidPassphrase
        );
        assert_eq!(
            load_private_key_bytes(
                &encoded,
                Some(&SecretText::new("correct passphrase".to_owned()))
            )
            .expect("correct passphrase loads key")
            .algorithm(),
            PrivateKeyAlgorithm::Ed25519
        );
    }

    #[test]
    fn encrypted_putty_keys_use_the_supplied_passphrase() {
        const ENCRYPTED_PPK: &str = r#"PuTTY-User-Key-File-3: ssh-ed25519
Encryption: aes256-cbc
Comment: user@example.com
Public-Lines: 2
AAAAC3NzaC1lZDI1NTE5AAAAILM+rvN+ot98qgEN796jTiQfZfG1KaT0PtFDJ/XF
Sqti
Key-Derivation: Argon2id
Argon2-Memory: 8192
Argon2-Passes: 34
Argon2-Parallelism: 1
Argon2-Salt: 63d1d43f7bf7700720496646a2f5ec17
Private-Lines: 1
DyWtExZ3dxFutnb12tIwXBC6kWdozrvP+r6faHKBGDb4+qEar9XBiC0BmGySMHUi
Private-MAC: 52fd00d4ef47ebc506e4e709486c0c6bc0606e24fe2c6cb1b3d168f4da238a66
"#;

        assert_eq!(
            load_private_key_bytes(ENCRYPTED_PPK.as_bytes(), None)
                .expect_err("passphrase is required"),
            AuthFailure::KeyEncrypted
        );
        assert_eq!(
            load_private_key_bytes(
                ENCRYPTED_PPK.as_bytes(),
                Some(&SecretText::new("wrong passphrase".to_owned()))
            )
            .expect_err("wrong passphrase must fail"),
            AuthFailure::InvalidPassphrase
        );
        assert_eq!(
            load_private_key_bytes(
                ENCRYPTED_PPK.as_bytes(),
                Some(&SecretText::new("123".to_owned()))
            )
            .expect("correct passphrase loads key")
            .algorithm(),
            PrivateKeyAlgorithm::Ed25519
        );
    }

    #[test]
    fn putty_v2_and_v3_encryption_headers_use_the_encrypted_dispatch() {
        for header in [
            "PuTTY-User-Key-File-2: ssh-ed25519\nEncryption: aes256-cbc\n",
            "PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: aes256-cbc\nKey-Derivation: Argon2id\nArgon2-Memory: 8192\nArgon2-Passes: 34\nArgon2-Parallelism: 1\n",
        ] {
            assert_eq!(
                private_key_container(header),
                Ok(PrivateKeyContainer::EncryptedPutty)
            );
        }
        assert_eq!(
            private_key_container(
                "PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: unsupported-cipher\n"
            ),
            Err(AuthFailure::UnsupportedKey)
        );
        assert_eq!(
            private_key_container(
                "PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: aes256-cbc\nKey-Derivation: Argon2id\nArgon2-Memory: 1048576\nArgon2-Passes: 1\nArgon2-Parallelism: 1\n"
            ),
            Err(AuthFailure::UnsupportedKey)
        );
    }

    #[cfg(unix)]
    #[test]
    fn broad_unix_permissions_warn_without_blocking() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("broad-key");
        let encoded = test_key()
            .to_openssh(LineEnding::LF)
            .expect("encode test key");
        fs::write(&path, encoded.as_bytes()).expect("write key");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644))
            .expect("set broad permissions");

        let loaded = load_private_key(&path, None).expect("warning does not block key");
        assert_eq!(
            loaded.warnings(),
            &[AuthWarning::InsecurePrivateKeyPermissions]
        );
    }

    #[test]
    fn authentication_results_distinguish_rejection_and_disabled_methods() {
        assert_eq!(
            map_auth_result(
                AuthResult::Failure {
                    remaining_methods: MethodSet::from(&[MethodKind::Password][..]),
                    partial_success: false,
                },
                MethodKind::Password,
            ),
            Err(AuthFailure::InvalidCredentials)
        );
        assert_eq!(
            map_auth_result(
                AuthResult::Failure {
                    remaining_methods: MethodSet::from(&[MethodKind::PublicKey][..]),
                    partial_success: false,
                },
                MethodKind::Password,
            ),
            Err(AuthFailure::AuthenticationMethodDisabled)
        );
        assert_eq!(
            map_auth_result(
                AuthResult::Failure {
                    remaining_methods: MethodSet::all(),
                    partial_success: true,
                },
                MethodKind::Password,
            ),
            Err(AuthFailure::ServerRejected)
        );
    }

    #[test]
    fn rsa_authentication_never_downgrades_to_legacy_sha1() {
        assert_eq!(rsa_hash(None), Ok(Some(russh::keys::HashAlg::Sha512)));
        assert_eq!(
            rsa_hash(Some(Some(russh::keys::HashAlg::Sha256))),
            Ok(Some(russh::keys::HashAlg::Sha256))
        );
        assert_eq!(rsa_hash(Some(None)), Err(AuthFailure::UnsupportedKey));
    }
}
