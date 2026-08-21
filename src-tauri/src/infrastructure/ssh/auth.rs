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

pub(crate) fn generate_private_key_bytes(
    algorithm: GeneratedPrivateKeyAlgorithm,
    comment: &str,
) -> Result<Zeroizing<Vec<u8>>, AuthFailure> {
    let algorithm = match algorithm {
        GeneratedPrivateKeyAlgorithm::Ed25519 => Algorithm::Ed25519,
        GeneratedPrivateKeyAlgorithm::EcdsaP256 => Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP256,
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
    let key = match russh::keys::decode_secret_key(text, None) {
        Ok(key) => key,
        Err(russh::keys::Error::KeyIsEncrypted) => {
            let passphrase = passphrase.ok_or(AuthFailure::KeyEncrypted)?;
            russh::keys::decode_secret_key(text, Some(passphrase.expose()))
                .map_err(map_encrypted_key_error)?
        }
        Err(error) => return Err(map_key_error(error)),
    };
    let algorithm = map_algorithm(key.algorithm())?;

    Ok(LoadedPrivateKey {
        key: Arc::new(key),
        algorithm,
        warnings: Vec::new(),
    })
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

    let mut rsa_hash = None;
    for identity in identities {
        let hash_alg = if identity.public_key().algorithm().is_rsa() {
            match rsa_hash {
                Some(result) => result?,
                None => {
                    let result = handle
                        .best_supported_rsa_hash()
                        .await
                        .map_err(|_| AuthFailure::Connection)
                        .and_then(agent_rsa_hash);
                    rsa_hash = Some(result);
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

fn agent_rsa_hash(
    server_preference: Option<Option<HashAlg>>,
) -> Result<Option<HashAlg>, AuthFailure> {
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
    let result = handle
        .authenticate_publickey(username, PrivateKeyWithHashAlg::new(key.key, None))
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
        LineEnding, PrivateKey,
        private::{Ed25519Keypair, KeypairData},
    };
    use tempfile::tempdir;

    use super::{
        agent_rsa_hash, generate_private_key_bytes, load_private_key, load_private_key_bytes,
        map_auth_result,
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
    fn agent_rsa_never_downgrades_to_legacy_sha1() {
        assert_eq!(agent_rsa_hash(None), Ok(Some(russh::keys::HashAlg::Sha512)));
        assert_eq!(
            agent_rsa_hash(Some(Some(russh::keys::HashAlg::Sha256))),
            Ok(Some(russh::keys::HashAlg::Sha256))
        );
        assert_eq!(agent_rsa_hash(Some(None)), Err(AuthFailure::UnsupportedKey));
    }
}
