use std::{fs, sync::Arc, thread};

use tempfile::tempdir;

use super::JsonProfileRepository;
use crate::{
    domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    },
    ports::profile_repository::{ProfileRepository, ProfileRepositoryError},
};

fn profile(id: &str, name: &str) -> ConnectionProfile {
    ConnectionProfile::new(
        ProfileId::parse(id).expect("fixture id must be valid"),
        name,
        "example.com",
        22,
        "deploy",
        AuthPreference::PrivateKey,
        Some(CredentialId::parse("credential-1").expect("credential")),
    )
    .expect("fixture profile must be valid")
}

#[test]
fn persists_crud_and_recovers_after_repository_restart() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("nested/profiles.json");
    let repository = JsonProfileRepository::new(path.clone());

    repository
        .insert(profile("profile-1", "Production"))
        .expect("insert profile");
    repository
        .update(profile("profile-1", "Production updated"))
        .expect("update profile");

    let restarted = JsonProfileRepository::new(path);
    let profiles = restarted.list().expect("reload profiles");
    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0].name(), "Production updated");

    restarted.delete(profiles[0].id()).expect("delete profile");
    assert!(restarted.list().expect("reload empty profiles").is_empty());
}

#[test]
fn stores_schema_v6_ordered_jumps_and_credential_references_without_secret_fields() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let repository = JsonProfileRepository::new(path.clone());

    repository
        .insert(profile("jump-1", "Gateway"))
        .expect("insert jump profile");
    repository
        .insert(
            profile("profile-1", "Production")
                .with_jump_profile_ids(vec![ProfileId::parse("jump-1").expect("jump id")]),
        )
        .expect("insert profile");

    let json = fs::read_to_string(path).expect("read profile document");
    assert!(json.contains("\"schemaVersion\": 6"));
    assert!(json.contains("\"groups\": []"));
    assert!(json.contains("\"credentialId\": \"credential-1\""));
    assert!(json.contains("\"jumpProfileIds\": ["));
    assert!(!json.contains("privateKeyPath"));
    for forbidden in ["password", "passphrase", "privateKeyData", "ciphertext"] {
        assert!(!json.contains(forbidden), "must not persist {forbidden}");
    }
}

#[test]
fn rejects_sensitive_fields_without_modifying_the_source_file() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let original = br#"{
  "schemaVersion": 1,
  "profiles": [{
    "id": "profile-1",
    "name": "Production",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password",
    "password": "must-not-be-here"
  }]
}"#;
    fs::write(&path, original).expect("write fixture");
    let repository = JsonProfileRepository::new(path.clone());

    assert_eq!(
        repository.list(),
        Err(ProfileRepositoryError::SensitiveField)
    );
    assert_eq!(fs::read(path).expect("read unchanged fixture"), original);
}

#[test]
fn rejects_unknown_schema_and_corrupt_json_without_overwriting_them() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let repository = JsonProfileRepository::new(path.clone());

    let unknown = br#"{"schemaVersion":99,"profiles":[]}"#;
    fs::write(&path, unknown).expect("write unknown schema fixture");
    assert_eq!(
        repository.list(),
        Err(ProfileRepositoryError::UnsupportedSchemaVersion(99))
    );
    assert_eq!(fs::read(&path).expect("read unknown schema"), unknown);

    let corrupt = br#"{"schemaVersion":1,"profiles":["#;
    fs::write(&path, corrupt).expect("write corrupt fixture");
    assert_eq!(repository.list(), Err(ProfileRepositoryError::CorruptData));
    assert_eq!(fs::read(path).expect("read corrupt fixture"), corrupt);
}

#[test]
fn reports_duplicate_and_missing_profile_operations() {
    let directory = tempdir().expect("temporary directory");
    let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
    repository
        .insert(profile("profile-1", "Production"))
        .expect("insert profile");

    assert_eq!(
        repository.insert(profile("profile-1", "Duplicate")),
        Err(ProfileRepositoryError::AlreadyExists)
    );
    assert_eq!(
        repository.update(profile("missing", "Missing")),
        Err(ProfileRepositoryError::NotFound)
    );
    assert_eq!(
        repository.delete(&ProfileId::parse("missing").expect("fixture id")),
        Err(ProfileRepositoryError::NotFound)
    );
}

#[test]
fn blocks_deleting_a_profile_that_is_used_as_a_jump() {
    let directory = tempdir().expect("temporary directory");
    let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
    let jump = profile("jump-1", "Gateway");
    repository.insert(jump.clone()).expect("jump");
    repository
        .insert(profile("target-1", "Production").with_jump_profile_ids(vec![jump.id().clone()]))
        .expect("target");

    assert_eq!(
        repository.delete(jump.id()),
        Err(ProfileRepositoryError::ReferencedAsJump)
    );
    assert_eq!(repository.list().expect("profiles").len(), 2);
}

#[test]
fn batch_insert_validates_every_profile_before_writing_any() {
    let directory = tempdir().expect("temporary directory");
    let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
    let invalid = profile("profile-2", "Invalid group").with_group_id(Some(
        ProfileGroupId::parse("missing-group").expect("group id"),
    ));

    assert_eq!(
        repository.insert_many(vec![profile("profile-1", "Valid"), invalid]),
        Err(ProfileRepositoryError::GroupNotFound)
    );
    assert!(repository.list().expect("list profiles").is_empty());
}

#[test]
fn serializes_concurrent_writes_through_the_single_repository_instance() {
    let directory = tempdir().expect("temporary directory");
    let repository = Arc::new(JsonProfileRepository::new(
        directory.path().join("profiles.json"),
    ));
    let handles: Vec<_> = (0..8)
        .map(|index| {
            let repository = Arc::clone(&repository);
            thread::spawn(move || {
                repository
                    .insert(profile(
                        &format!("profile-{index}"),
                        &format!("Profile {index}"),
                    ))
                    .expect("concurrent insert")
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("join writer");
    }

    assert_eq!(repository.list().expect("list profiles").len(), 8);
}

#[test]
fn persists_groups_and_moves_profiles_to_ungrouped_when_a_group_is_deleted() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let repository = JsonProfileRepository::new(path.clone());
    let group_id = ProfileGroupId::parse("group-1").expect("group id");
    repository
        .insert_group(ProfileGroup::new(group_id.clone(), "Production").expect("group"))
        .expect("insert group");
    repository
        .insert(profile("profile-1", "Server").with_group_id(Some(group_id.clone())))
        .expect("insert grouped profile");

    repository.delete_group(&group_id).expect("delete group");

    assert!(repository.list_groups().expect("groups").is_empty());
    assert_eq!(repository.list().expect("profiles")[0].group_id(), None);
    let json = fs::read_to_string(path).expect("profile document");
    assert!(json.contains("\"schemaVersion\": 6"));
    assert!(!json.contains("\"groupId\""));
}

#[test]
fn clearing_a_shared_credential_reference_preserves_all_profiles() {
    let directory = tempdir().expect("temporary directory");
    let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
    repository.insert(profile("profile-1", "One")).expect("one");
    repository.insert(profile("profile-2", "Two")).expect("two");

    repository
        .clear_credential_references(&CredentialId::parse("credential-1").expect("id"))
        .expect("clear references");

    let profiles = repository.list().expect("profiles");
    assert_eq!(profiles.len(), 2);
    assert!(
        profiles
            .iter()
            .all(|profile| profile.credential_id().is_none())
    );
}

#[test]
fn rejects_old_profile_schemas_without_modifying_them() {
    for schema_version in [1, 2, 3, 4, 5] {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        fs::write(
            &path,
            format!(
                r#"{{
  "schemaVersion": {schema_version},
  "profiles": [{{
    "id": "profile-1",
    "name": "Legacy",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password"
  }}]
}}"#
            ),
        )
        .expect("legacy fixture");
        let repository = JsonProfileRepository::new(path.clone());

        assert_eq!(
            repository.list(),
            Err(ProfileRepositoryError::UnsupportedSchemaVersion(
                schema_version
            ))
        );
        assert_eq!(
            fs::read_to_string(path).expect("unchanged"),
            format!(
                r#"{{
  "schemaVersion": {schema_version},
  "profiles": [{{
    "id": "profile-1",
    "name": "Legacy",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password"
  }}]
}}"#
            )
        );
    }
}

#[test]
fn clears_only_an_unsupported_profile_document() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let repository = JsonProfileRepository::new(path.clone());
    fs::write(&path, br#"{"schemaVersion":5,"groups":[],"profiles":[]}"#).expect("legacy fixture");

    repository
        .clear_unsupported_storage()
        .expect("clear unsupported storage");
    assert!(!path.exists());

    repository
        .insert(profile("profile-1", "Production"))
        .expect("current fixture");
    assert_eq!(
        repository.clear_unsupported_storage(),
        Err(ProfileRepositoryError::StorageIsCurrent)
    );
    assert!(path.exists(), "current storage must remain intact");
}

#[test]
fn rejects_dangling_group_references_without_overwriting_the_source() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("profiles.json");
    let original = br#"{
  "schemaVersion": 6,
  "groups": [],
  "profiles": [{
    "id": "profile-1",
    "name": "Dangling",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password",
    "groupId": "missing-group"
  }]
}"#;
    fs::write(&path, original).expect("dangling fixture");
    let repository = JsonProfileRepository::new(path.clone());

    assert_eq!(repository.list(), Err(ProfileRepositoryError::CorruptData));
    assert_eq!(fs::read(path).expect("unchanged source"), original);
}
