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
fn rename_changes_only_name_metadata_and_requires_unlock() {
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
    let before: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");

    let renamed = vault
        .rename(&id("password-1"), "Primary production".into())
        .expect("rename");
    assert_eq!(renamed.name, "Primary production");
    assert_eq!(renamed.id, id("password-1"));
    let after: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).expect("read")).expect("json");
    assert_eq!(after["credentials"][0]["name"], "Primary production");
    assert_eq!(
        before["credentials"][0]["id"],
        after["credentials"][0]["id"]
    );
    assert_eq!(
        before["credentials"][0]["kind"],
        after["credentials"][0]["kind"]
    );
    assert_eq!(
        before["credentials"][0]["nonce"],
        after["credentials"][0]["nonce"]
    );
    assert_eq!(
        before["credentials"][0]["ciphertext"],
        after["credentials"][0]["ciphertext"]
    );
    assert_eq!(
        vault.rename(&id("missing"), "Missing".into()),
        Err(CredentialError::CredentialNotFound)
    );

    vault.lock();
    assert_eq!(
        vault.rename(&id("password-1"), "Locked rename".into()),
        Err(CredentialError::Locked)
    );
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
