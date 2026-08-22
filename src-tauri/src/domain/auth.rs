use std::{fmt, path::PathBuf};

use secrecy::{ExposeSecret, SecretString};
use zeroize::Zeroizing;

/// A short-lived textual credential which is redacted and zeroized on drop.
pub struct SecretText(SecretString);

impl SecretText {
    pub fn new(value: String) -> Self {
        Self(value.into())
    }

    pub(crate) fn expose(&self) -> &str {
        self.0.expose_secret()
    }
}

impl fmt::Debug for SecretText {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretText([REDACTED])")
    }
}

/// Short-lived binary secret material, primarily an imported private key.
pub struct SecretBytes(Zeroizing<Vec<u8>>);

impl SecretBytes {
    pub fn new(value: Vec<u8>) -> Self {
        Self(Zeroizing::new(value))
    }

    pub(crate) fn expose(&self) -> &[u8] {
        &self.0
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretBytes([REDACTED])")
    }
}

#[allow(
    dead_code,
    reason = "constructed by the SSH session command introduced in phase 4"
)]
pub enum AuthRequest {
    Password(SecretText),
    PrivateKey {
        path: PathBuf,
        passphrase: Option<SecretText>,
    },
    PrivateKeyData {
        data: SecretBytes,
        passphrase: Option<SecretText>,
    },
    SshAgent,
}

impl fmt::Debug for AuthRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Password(_) => formatter.write_str("AuthRequest::Password([REDACTED])"),
            Self::PrivateKey {
                passphrase,
                path: _,
            } => formatter
                .debug_struct("AuthRequest::PrivateKey")
                .field("path", &"[REDACTED]")
                .field("has_passphrase", &passphrase.is_some())
                .finish(),
            Self::PrivateKeyData { passphrase, .. } => formatter
                .debug_struct("AuthRequest::PrivateKeyData")
                .field("data", &"[REDACTED]")
                .field("has_passphrase", &passphrase.is_some())
                .finish(),
            Self::SshAgent => formatter.write_str("AuthRequest::SshAgent"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthFailure {
    InvalidCredentials,
    AuthenticationMethodDisabled,
    KeyMissing,
    KeyUnreadable,
    KeyTooLarge,
    KeyEncrypted,
    InvalidPassphrase,
    UnsupportedKey,
    CorruptKey,
    KeyGenerationFailed,
    SshAgentUnavailable,
    SshAgentEmpty,
    SshAgentRejected,
    ServerRejected,
    Connection,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthWarning {
    #[cfg_attr(not(unix), allow(dead_code))]
    InsecurePrivateKeyPermissions,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PrivateKeyAlgorithm {
    Ed25519,
    EcdsaP256,
    EcdsaP384,
    EcdsaP521,
    Rsa,
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{AuthRequest, SecretText};

    #[test]
    fn secret_debug_output_is_redacted() {
        let secret = SecretText::new("correct horse battery staple".to_owned());

        let output = format!("{secret:?}");
        assert!(output.contains("REDACTED"));
        assert!(!output.contains("correct horse battery staple"));
    }

    #[test]
    fn authentication_request_debug_hides_secret_and_path() {
        let request = AuthRequest::PrivateKey {
            path: PathBuf::from("/sensitive/location/id_ed25519"),
            passphrase: Some(SecretText::new("key password".to_owned())),
        };

        let output = format!("{request:?}");
        assert!(!output.contains("key password"));
        assert!(!output.contains("/sensitive/location"));
        assert!(output.contains("has_passphrase: true"));
    }

    #[test]
    fn password_request_debug_never_prints_the_password() {
        let request = AuthRequest::Password(SecretText::new("server password".to_owned()));

        let output = format!("{request:?}");
        assert!(output.contains("REDACTED"));
        assert!(!output.contains("server password"));
    }

    #[test]
    fn ssh_agent_request_contains_no_secret_material() {
        assert_eq!(
            format!("{:?}", AuthRequest::SshAgent),
            "AuthRequest::SshAgent"
        );
    }
}
