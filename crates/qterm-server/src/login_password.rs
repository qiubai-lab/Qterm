//! Deployment login material: accept a password file or a precomputed Argon2id hash.
//! Only the resulting hash is retained by Config; source files are never rewritten.
use argon2::{Argon2, PasswordHash, PasswordHasher, password_hash::SaltString};
use std::{io::Read, path::PathBuf};
use zeroize::Zeroizing;

pub fn load(password_file: Option<PathBuf>, hash_file: Option<PathBuf>) -> Result<String, String> {
    let (path, hash_only) = match (password_file, hash_file) {
        (Some(path), None) => (path, false),
        (None, Some(path)) => (path, true),
        (Some(_), Some(_)) => {
            return Err("Set only one of QTERM_PASSWORD_FILE or QTERM_PASSWORD_HASH_FILE".into());
        }
        (None, None) => {
            return Err(
                "Set QTERM_PASSWORD_FILE to a file containing a password or Argon2id hash".into(),
            );
        }
    };
    let mut contents = Zeroizing::new(String::new());
    std::fs::File::open(path)
        .map_err(|_| "Cannot open login password file; create it before starting the server")?
        .take(4097)
        .read_to_string(&mut contents)
        .map_err(|_| "Cannot read UTF-8 login password file")?;
    if contents.len() > 4096 {
        return Err("Login password file is too large".into());
    }
    let encoded = contents.trim();
    if hash_only || encoded.starts_with("$argon2") {
        validate_hash(encoded)?;
        Ok(encoded.to_owned())
    } else {
        hash(contents.trim_end_matches(['\r', '\n']))
    }
}

fn validate_hash(encoded: &str) -> Result<(), String> {
    let parsed = PasswordHash::new(encoded).map_err(|_| "Invalid Argon2id password hash")?;
    if parsed.algorithm.as_str() != "argon2id" {
        return Err("Use an Argon2id password hash".into());
    }
    if parsed.salt.is_none() || parsed.hash.is_none() {
        return Err("Argon2id password hash must include a salt and output".into());
    }
    argon2::Params::try_from(&parsed).map_err(|_| "Invalid Argon2id parameters")?;
    if let Some(version) = parsed.version {
        argon2::Version::try_from(version).map_err(|_| "Invalid Argon2 version")?;
    }
    Ok(())
}

pub fn hash(password: &str) -> Result<String, String> {
    if !(12..=1024).contains(&password.len()) || password.contains(['\r', '\n']) {
        return Err("Password must be a single line containing 12–1024 bytes".into());
    }
    let mut salt = [0; 16];
    getrandom::fill(&mut salt).map_err(|_| "Random source unavailable")?;
    let salt = SaltString::encode_b64(&salt).map_err(|_| "Cannot encode salt")?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|encoded| encoded.to_string())
        .map_err(|_| "Password hashing failed".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use argon2::PasswordVerifier;

    fn verify(encoded: &str, password: &str) -> bool {
        Argon2::default()
            .verify_password(password.as_bytes(), &PasswordHash::new(encoded).unwrap())
            .is_ok()
    }

    #[test]
    fn plaintext_file_preserves_spaces_and_is_not_rewritten() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("password");
        let contents = "  user-entered password  \r\n";
        std::fs::write(&path, contents).unwrap();
        let encoded = load(Some(path.clone()), None).unwrap();
        assert!(verify(&encoded, "  user-entered password  "));
        assert!(!verify(&encoded, "user-entered password"));
        assert_eq!(std::fs::read_to_string(path).unwrap(), contents);
    }

    #[test]
    fn user_generated_hash_works_in_both_file_modes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("password");
        let encoded = hash("user-entered password").unwrap();
        std::fs::write(&path, format!("{encoded}\n")).unwrap();
        assert_eq!(load(Some(path.clone()), None).unwrap(), encoded);
        assert_eq!(load(None, Some(path.clone())).unwrap(), encoded);
        assert!(verify(&encoded, "user-entered password"));
        std::fs::write(&path, "user-entered password").unwrap();
        assert!(load(None, Some(path)).is_err());
    }

    #[test]
    fn invalid_or_ambiguous_configuration_is_rejected_without_exposing_contents() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("password");
        assert!(load(None, None).is_err());
        assert!(load(Some(path.clone()), Some(path.clone())).is_err());
        assert!(load(Some(path.clone()), None).is_err());
        for input in [
            "".to_owned(),
            "too-short".into(),
            "two lines of\npassword".into(),
            "x".repeat(1025),
            "x".repeat(4097),
            "$argon2id$invalid-private-content".into(),
            "$argon2i$v=19$m=19456,t=2,p=1".into(),
            "$argon2id$v=19$m=19456,t=2,p=1".into(),
        ] {
            std::fs::write(&path, &input).unwrap();
            let error = load(Some(path.clone()), None).unwrap_err();
            if !input.is_empty() {
                assert!(!error.contains(&input));
            }
        }
    }
}
