use super::*;
use crate::{
    application::configuration_merge::ConfigurationMergeService,
    domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileId},
    },
};

fn setup(root: &Path) {
    std::fs::create_dir(root.join("data")).unwrap();
}
fn profile(root: &Path, id: &str, name: &str) {
    JsonProfileRepository::new(root.join("data/connections.json"))
        .insert(
            ConnectionProfile::new(
                ProfileId::parse(id).unwrap(),
                name,
                "host.example",
                22,
                "user",
                AuthPreference::Manual,
                None,
            )
            .unwrap(),
        )
        .unwrap();
}
fn options() -> MergeOptions {
    MergeOptions {
        connections: true,
        ..Default::default()
    }
}

#[test]
fn round_trip_is_idempotent_preserves_source_and_rejects_stale_target() {
    let _gate = super::super::configuration_gate::lock();
    let source = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    setup(source.path());
    setup(target.path());
    profile(source.path(), "same-id", "server");
    let before = files::snapshot(&source.path().join("data")).unwrap();
    let vault = JsonCredentialVault::new(target.path().join("data/secrets.vault"));
    let mut service = ConfigurationMergeService::new(FileConfigurationMergeStorage::new(
        target.path().into(),
        vault,
    ));
    service.scan(source.path()).unwrap();
    let (token, plan) = service.preview(options(), None).unwrap();
    assert!(plan.changed());
    service.commit(&token).unwrap();
    assert_eq!(
        before,
        files::snapshot(&source.path().join("data")).unwrap()
    );
    let (_, plan) = service.preview(options(), None).unwrap();
    assert!(!plan.changed());
    profile(source.path(), "next", "other");
    let (token, _) = service.preview(options(), None).unwrap();
    profile(target.path(), "concurrent", "edited");
    assert!(service.commit(&token).unwrap_err().contains("变化"));
    assert_eq!(
        profiles(&target.path().join("data"))
            .unwrap()
            .profiles
            .len(),
        2
    );
}

#[test]
fn credentials_are_reencrypted_with_destination_key_and_wrong_password_never_writes() {
    let _gate = super::super::configuration_gate::lock();
    let source = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    setup(source.path());
    setup(target.path());
    let source_vault = JsonCredentialVault::new_for_test(source.path().join("data/secrets.vault"));
    let target_vault = JsonCredentialVault::new_for_test(target.path().join("data/secrets.vault"));
    for (v, pass) in [
        (&source_vault, "source-password-long"),
        (&target_vault, "target-password-long"),
    ] {
        v.initialize(
            SecretText::new(pass.into()),
            v.prepare_initial_recovery().unwrap(),
        )
        .unwrap();
    }
    let id = CredentialId::parse("credential").unwrap();
    source_vault
        .save_password(
            id.clone(),
            "saved password".into(),
            SecretText::new("sensitive-value".into()),
        )
        .unwrap();
    JsonProfileRepository::new(source.path().join("data/connections.json"))
        .insert(
            ConnectionProfile::new(
                ProfileId::parse("profile").unwrap(),
                "server",
                "host",
                22,
                "user",
                AuthPreference::Password,
                Some(id),
            )
            .unwrap(),
        )
        .unwrap();
    let before = files::snapshot(&target.path().join("data")).unwrap();
    let mut service = ConfigurationMergeService::new(FileConfigurationMergeStorage::new(
        target.path().into(),
        target_vault.clone(),
    ));
    service.scan(source.path()).unwrap();
    let opts = MergeOptions {
        connections: true,
        credentials: true,
        network: false,
    };
    assert!(
        service
            .preview(opts, Some(SecretText::new("incorrect".into())))
            .is_err()
    );
    assert_eq!(
        before,
        files::snapshot(&target.path().join("data")).unwrap()
    );
    let (token, _) = service
        .preview(opts, Some(SecretText::new("source-password-long".into())))
        .unwrap();
    service.commit(&token).unwrap();
    target_vault.lock();
    target_vault
        .unlock(SecretText::new("target-password-long".into()))
        .unwrap();
    let p = profiles(&target.path().join("data"))
        .unwrap()
        .profiles
        .remove(0);
    let CredentialMaterial::Password(secret) =
        target_vault.load(p.credential_id().unwrap()).unwrap()
    else {
        panic!("password");
    };
    assert_eq!(secret.expose(), "sensitive-value");
    assert!(
        !String::from_utf8(std::fs::read(target.path().join("data/secrets.vault")).unwrap())
            .unwrap()
            .contains("sensitive-value")
    );
    let (_, plan) = service
        .preview(opts, Some(SecretText::new("source-password-long".into())))
        .unwrap();
    assert!(!plan.changed());
}

#[test]
fn recovery_restores_all_files_after_interrupted_commit() {
    let root = tempfile::tempdir().unwrap();
    setup(root.path());
    let data = root.path().join("data");
    let old = vec![
        Some(b"original".to_vec()),
        None,
        Some(b"encrypted".to_vec()),
    ];
    files::copy_snapshot(&data, &old).unwrap();
    files::write(
        &data.join(".merge-pending.json"),
        &serde_json::to_vec(&old).unwrap(),
    )
    .unwrap();
    files::write(&data.join(FILES[0]), b"partially merged").unwrap();
    files::write(&data.join(FILES[1]), b"new rules").unwrap();
    FileConfigurationMergeStorage::recover(root.path()).unwrap();
    assert_eq!(files::snapshot(&data).unwrap(), old);
    assert!(!data.join(".merge-pending.json").exists());
}

#[test]
fn same_directory_and_invalid_category_are_not_silently_imported() {
    let root = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    setup(root.path());
    setup(source.path());
    std::fs::write(source.path().join("data/connections.json"), b"invalid").unwrap();
    let mut service = ConfigurationMergeService::new(FileConfigurationMergeStorage::new(
        root.path().into(),
        JsonCredentialVault::new(root.path().join("data/secrets.vault")),
    ));
    assert!(service.scan(root.path()).is_err());
    assert!(
        service
            .scan(source.path())
            .unwrap()
            .connections
            .error
            .is_some()
    );
    assert!(service.preview(options(), None).is_err());
    assert!(service.commit("").is_err());
    assert!(
        files::snapshot(&root.path().join("data"))
            .unwrap()
            .iter()
            .all(Option::is_none)
    );
}

#[test]
fn failed_second_write_rolls_back_first_and_pending_recovery_blocks_repository_access() {
    let _gate = super::super::configuration_gate::lock();
    let root = tempfile::tempdir().unwrap();
    setup(root.path());
    profile(root.path(), "p", "server");
    let data = root.path().join("data");
    let before = files::snapshot(&data).unwrap();
    let error = files::commit_with(&data, &before, || {
        assert!(
            JsonProfileRepository::new(data.join(FILES[0]))
                .list()
                .is_err()
        );
        files::write(&data.join(FILES[0]), b"partial")?;
        Err("injected write failure")
    });
    assert_eq!(error, Err("injected write failure"));
    assert_eq!(files::snapshot(&data).unwrap(), before);
    assert_eq!(
        JsonProfileRepository::new(data.join(FILES[0]))
            .list()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn changed_source_or_locked_destination_invalidates_a_prepared_commit() {
    let _gate = super::super::configuration_gate::lock();
    let source = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    setup(source.path());
    setup(target.path());
    profile(source.path(), "p", "server");
    let vault = JsonCredentialVault::new_for_test(target.path().join("data/secrets.vault"));
    vault
        .initialize(
            SecretText::new("long-master-password".into()),
            vault.prepare_initial_recovery().unwrap(),
        )
        .unwrap();
    let mut service = ConfigurationMergeService::new(FileConfigurationMergeStorage::new(
        target.path().into(),
        vault.clone(),
    ));
    service.scan(source.path()).unwrap();
    let (token, _) = service.preview(options(), None).unwrap();
    profile(source.path(), "new", "second");
    assert!(service.commit(&token).is_err());
    let (token, _) = service
        .preview(
            MergeOptions {
                credentials: true,
                ..options()
            },
            None,
        )
        .unwrap();
    vault.lock();
    assert!(service.commit(&token).unwrap_err().contains("锁定"));
    assert!(
        profiles(&target.path().join("data"))
            .unwrap()
            .profiles
            .is_empty()
    );
}

#[cfg(unix)]
#[test]
fn source_files_cannot_escape_through_symlinks() {
    let root = tempfile::tempdir().unwrap();
    setup(root.path());
    let outside = tempfile::NamedTempFile::new().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("data/connections.json")).unwrap();
    assert!(files::snapshot(&root.path().join("data")).is_err());
}

#[test]
fn source_unlock_is_reused_only_for_unchanged_selected_credentials() {
    let _gate = super::super::configuration_gate::lock();
    let source = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    setup(source.path());
    setup(target.path());
    let source_vault = JsonCredentialVault::new_for_test(source.path().join("data/secrets.vault"));
    let target_vault = JsonCredentialVault::new_for_test(target.path().join("data/secrets.vault"));
    for v in [&source_vault, &target_vault] {
        v.initialize(
            SecretText::new("long-master-password".into()),
            v.prepare_initial_recovery().unwrap(),
        )
        .unwrap();
    }
    source_vault
        .save_password(
            CredentialId::parse("secret").unwrap(),
            "secret".into(),
            SecretText::new("material".into()),
        )
        .unwrap();
    let mut service = ConfigurationMergeService::new(FileConfigurationMergeStorage::new(
        target.path().into(),
        target_vault,
    ));
    use crate::domain::network::{ForwardRule, ForwardRuleKind, NetworkRuleId};
    JsonNetworkRepository::new(source.path().join("data/network-forwards.json"))
        .insert(
            ForwardRule::new(
                NetworkRuleId::parse("orphan-rule").unwrap(),
                ProfileId::parse("missing-profile").unwrap(),
                "orphan",
                ForwardRuleKind::socks5("127.0.0.1", 1080).unwrap(),
            )
            .unwrap(),
        )
        .unwrap();
    service.scan(source.path()).unwrap();
    let credentials = MergeOptions {
        credentials: true,
        ..Default::default()
    };
    let password = || Some(SecretText::new("long-master-password".into()));
    let before = files::snapshot(&target.path().join("data")).unwrap();
    assert!(
        service
            .unlock_source_credentials(SecretText::new("wrong".into()))
            .is_err()
    );
    service
        .unlock_source_credentials(SecretText::new("long-master-password".into()))
        .unwrap();
    assert_eq!(
        before,
        files::snapshot(&target.path().join("data")).unwrap()
    );
    let source_before = files::snapshot(&source.path().join("data")).unwrap();
    let all = MergeOptions {
        connections: true,
        network: true,
        credentials: true,
    };
    let (token, plan) = service.preview(all, None).unwrap();
    assert_eq!(plan.details[0].outcome, "invalid");
    assert!(plan.additions.rules.is_empty());
    assert_eq!(plan.additions.credentials.len(), 1);
    service.commit(&token).unwrap();
    assert_eq!(
        source_before,
        files::snapshot(&source.path().join("data")).unwrap()
    );
    assert!(
        JsonNetworkRepository::new(target.path().join("data/network-forwards.json"))
            .list()
            .unwrap()
            .is_empty()
    );
    let (_, repeated) = service.preview(all, password()).unwrap();
    assert!(!repeated.changed());
    assert_eq!(repeated.details[0].outcome, "invalid");
    assert!(service.preview(credentials, None).is_ok());
    service.preview(MergeOptions::default(), None).unwrap();
    assert!(service.preview(credentials, None).is_err());
    service.preview(credentials, password()).unwrap();
    source_vault
        .rename(&CredentialId::parse("secret").unwrap(), "changed".into())
        .unwrap();
    assert!(service.preview(credentials, None).is_err());
    service.preview(credentials, password()).unwrap();
    service.cancel();
    service.scan(source.path()).unwrap();
    assert!(service.preview(credentials, None).is_err());
}
