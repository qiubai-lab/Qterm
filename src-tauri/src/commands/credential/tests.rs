use crate::{
    application::credential_workflow::PendingRecoveryReset,
    domain::{
        auth::{PrivateKeyAlgorithm, SecretText},
        credential::{CredentialError, GeneratedPrivateKeyAlgorithm, RecoveryKeyFile},
        settings::SecuritySettings,
    },
    infrastructure::persistence::json_credential_vault::JsonCredentialVault,
};
use russh::keys::ssh_key::{
    LineEnding, PrivateKey,
    private::{Ed25519Keypair, KeypairData},
};
use serde_json::json;
use tempfile::tempdir;

use super::{
    CredentialState,
    commands::validate_clear_confirmation,
    dto::{
        ClearVaultDto, CommitPrivateKeyDto, CreatePasswordDto, PrepareGeneratedPrivateKeyDto,
        PrivateKeyDraftIdDto, PrivateKeyPathDto, RenameCredentialDto, ResetMasterPasswordDto,
    },
    files::private_key_algorithm_name,
    recovery::{
        read_recovery_file, recovery_file_name, wait_for_dialog_result, write_recovery_file,
    },
};

#[test]
fn rsa_private_keys_use_stable_credential_metadata() {
    assert_eq!(private_key_algorithm_name(PrivateKeyAlgorithm::Rsa), "rsa");
}

#[test]
fn secret_inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<CreatePasswordDto>(
            json!({"name":"prod","password":"secret","privateKey":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<RenameCredentialDto>(
            json!({"credentialId":"credential-1","name":"renamed","password":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<RenameCredentialDto>(
            json!({"credentialId":"credential-1","name":"renamed"})
        )
        .is_ok()
    );
    assert!(
        serde_json::from_value::<PrivateKeyPathDto>(
            json!({"path":"C:/keys/id_ed25519","name":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<PrepareGeneratedPrivateKeyDto>(
            json!({"algorithm":"rsa","comment":null})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<PrepareGeneratedPrivateKeyDto>(
            json!({"algorithm":"ecdsaP384","comment":null})
        )
        .is_ok()
    );
    assert!(
        serde_json::from_value::<PrepareGeneratedPrivateKeyDto>(
            json!({"algorithm":"ecdsaP521","comment":null})
        )
        .is_ok()
    );
    assert!(
        serde_json::from_value::<PrepareGeneratedPrivateKeyDto>(
            json!({"algorithm":"ed25519","comment":null,"privateKey":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<CommitPrivateKeyDto>(
            json!({"draftId":"draft","name":"key","passphrase":null,"privateKey":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<PrivateKeyDraftIdDto>(
            json!({"draftId":"draft","name":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<ClearVaultDto>(
            json!({"confirmation":"确认清除","password":"forbidden"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<ResetMasterPasswordDto>(
            json!({"newPassword":"new-master-password","recoveryKey":"forbidden"})
        )
        .is_err()
    );
    assert!(validate_clear_confirmation("确认清除").is_ok());
    assert!(validate_clear_confirmation(" 确认清除").is_err());
    assert!(validate_clear_confirmation("确认").is_err());
}

#[test]
fn recovery_files_are_created_once_and_read_with_a_strict_size_limit() {
    let dir = tempdir().expect("dir");
    let path = dir.path().join("recovery.key");
    let recovery = RecoveryKeyFile::new(br#"{"schemaVersion":1}"#.to_vec());
    write_recovery_file(&path, &recovery).expect("write");
    assert_eq!(
        read_recovery_file(&path).expect("read").expose(),
        recovery.expose()
    );
    assert_eq!(
        write_recovery_file(&path, &recovery),
        Err(CredentialError::RecoveryFileStorageUnavailable)
    );
    let oversized = dir.path().join("oversized.key");
    std::fs::write(&oversized, vec![0; 4 * 1024 + 1]).expect("fixture");
    assert!(matches!(
        read_recovery_file(&oversized),
        Err(CredentialError::InvalidRecoveryFile)
    ));
}

#[test]
fn recovery_file_name_uses_only_the_qterm_prefix_and_timestamp() {
    assert_eq!(
        recovery_file_name(1_787_136_000),
        "qterm-recovery-1787136000.key"
    );
}

#[tokio::test]
async fn dialog_result_bridge_handles_selection_and_cancellation() {
    let selected = wait_for_dialog_result(|complete| complete(Some("recovery.key")))
        .await
        .expect("selected result");
    assert_eq!(selected, Some("recovery.key"));
    let cancelled = wait_for_dialog_result(|complete| complete(None::<&str>))
        .await
        .expect("cancelled result");
    assert_eq!(cancelled, None);
}

#[tokio::test]
async fn dialog_result_bridge_reports_a_dropped_callback() {
    let result = wait_for_dialog_result::<Option<&str>, _>(drop).await;
    assert_eq!(result, Err(CredentialError::RecoveryFileStorageUnavailable));
}

#[test]
fn pending_recovery_material_is_consumed_or_explicitly_cleared() {
    let dir = tempdir().expect("dir");
    let state = CredentialState::new(JsonCredentialVault::new(dir.path().join("vault.json")));
    state.remember_pending_recovery_reset(PendingRecoveryReset {
        current: RecoveryKeyFile::new(vec![1]),
        replacement: RecoveryKeyFile::new(vec![2]),
    });
    let pending = state.take_pending_recovery_reset().expect("pending");
    assert_eq!(pending.current.expose(), &[1]);
    assert_eq!(pending.replacement.expose(), &[2]);
    assert!(state.take_pending_recovery_reset().is_none());
    state.remember_pending_recovery_reset(PendingRecoveryReset {
        current: RecoveryKeyFile::new(vec![3]),
        replacement: RecoveryKeyFile::new(vec![4]),
    });
    state.clear_pending_recovery_reset();
    assert!(state.take_pending_recovery_reset().is_none());
}

#[test]
fn generated_private_key_is_not_persisted_until_a_valid_commit() {
    let dir = tempdir().expect("dir");
    let state = CredentialState::new(JsonCredentialVault::new_for_test(
        dir.path().join("vault.json"),
    ));
    let recovery = state
        .lifecycle
        .prepare_initial_recovery()
        .expect("recovery");
    state
        .lifecycle
        .initialize(
            SecretText::new("correct-master-password".into()),
            recovery,
            SecuritySettings::default(),
        )
        .expect("initialize");
    let draft = state
        .prepare_generated_private_key(GeneratedPrivateKeyAlgorithm::Ed25519, None)
        .expect("prepare generated key");
    assert!(
        state
            .lifecycle
            .list()
            .expect("list after prepare")
            .is_empty()
    );
    assert!(
        state
            .commit_private_key(&draft.id, "".into(), None)
            .is_err()
    );
    assert!(
        state
            .lifecycle
            .list()
            .expect("list after invalid commit")
            .is_empty()
    );
    let saved = state
        .commit_private_key(&draft.id, "Deploy key".into(), None)
        .expect("commit generated key");
    assert_eq!(saved.name, "Deploy key");
    assert_eq!(state.lifecycle.list().expect("list after commit").len(), 1);
    assert!(
        state
            .commit_private_key(&draft.id, "Duplicate".into(), None)
            .is_err()
    );
}

#[test]
fn ssh_config_import_reuses_public_key_identity_not_credential_name() {
    let dir = tempdir().expect("dir");
    let state = CredentialState::new(JsonCredentialVault::new_for_test(
        dir.path().join("vault.json"),
    ));
    let recovery = state
        .lifecycle
        .prepare_initial_recovery()
        .expect("recovery");
    state
        .lifecycle
        .initialize(
            SecretText::new("correct-master-password".into()),
            recovery,
            SecuritySettings::default(),
        )
        .expect("initialize");
    let first_path = dir.path().join("first-key");
    let same_key_path = dir.path().join("same-key-different-comment");
    let second_path = dir.path().join("second-key");
    for (path, seed, comment) in [
        (&first_path, 7_u8, "first-comment"),
        (&same_key_path, 7_u8, "different-comment"),
        (&second_path, 8_u8, "first-comment"),
    ] {
        let pair = Ed25519Keypair::from_seed(&[seed; 32]);
        let key = PrivateKey::new(KeypairData::from(pair), comment)
            .expect("private key")
            .to_openssh(LineEnding::LF)
            .expect("encode key");
        std::fs::write(path, key.as_bytes()).expect("write key");
    }
    let original = state
        .import_private_key_path("同名凭证".into(), &first_path, None)
        .expect("initial import");
    let reused = state
        .import_or_reuse_private_key_path("另一个名称".into(), &same_key_path, None)
        .expect("reuse same public key");
    let distinct = state
        .import_or_reuse_private_key_path("同名凭证".into(), &second_path, None)
        .expect("import different public key");
    assert!(!reused.created);
    assert_eq!(reused.summary.id, original.id);
    assert!(distinct.created);
    assert_ne!(distinct.summary.id, original.id);
    assert_eq!(distinct.summary.name, "同名凭证");
}
