use std::{collections::HashSet, path::PathBuf};

use serde_json::json;
use tempfile::tempdir;

use super::{
    CreateProfileDto, ProfileDto, ProfileGroupDto, ProfileState, SshConfigCandidateDto,
    SshConfigIdentityDto, SshConfigIdentityStatusDto, SshConfigImportDto, SshConfigPreviewDto,
    import::{invalid_import_selection, preview_candidate_dtos},
};
use crate::{
    application::ssh_config_import::{
        ImportIdentity, ImportIdentityStatus, SshConfigCandidate, allocate_import_name,
    },
    domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    },
    infrastructure::persistence::json_profile_repository::JsonProfileRepository,
};

fn candidate(alias: &str) -> SshConfigCandidate {
    SshConfigCandidate {
        alias: alias.into(),
        host: "10.100.5.28".into(),
        port: 22,
        username: "root".into(),
        identity_files: Vec::new(),
        warnings: Vec::new(),
    }
}

#[test]
fn profile_input_dto_rejects_secret_and_unknown_fields() {
    let input = json!({
        "name": "Production", "host": "example.com", "port": 22, "username": "deploy",
        "authPreference": "password", "password": "must-not-cross-this-command"
    });
    assert!(serde_json::from_value::<CreateProfileDto>(input).is_err());
}

#[test]
fn profile_output_dto_contains_only_non_secret_profile_data() {
    let profile = ConnectionProfile::new(
        ProfileId::parse("profile-1").expect("fixture id"),
        "Production",
        "example.com",
        22,
        "deploy",
        AuthPreference::PrivateKey,
        Some(CredentialId::parse("credential-1").expect("credential")),
    )
    .expect("fixture profile")
    .with_group_id(Some(
        ProfileGroupId::parse("group-1").expect("fixture group id"),
    ))
    .with_jump_profile_ids(vec![
        ProfileId::parse("gateway-1").expect("jump id"),
        ProfileId::parse("gateway-2").expect("jump id"),
    ]);
    let value = serde_json::to_value(ProfileDto::from(&profile)).expect("serialize profile");
    let object = value.as_object().expect("profile object");
    assert_eq!(object.get("credentialId"), Some(&json!("credential-1")));
    assert_eq!(object.get("groupId"), Some(&json!("group-1")));
    assert_eq!(
        object.get("jumpProfileIds"),
        Some(&json!(["gateway-1", "gateway-2"]))
    );
    for forbidden in ["password", "passphrase", "privateKeyData"] {
        assert!(!object.contains_key(forbidden));
    }
}

#[test]
fn ssh_config_import_input_rejects_paths_and_key_material() {
    let safe = json!({
        "previewId": "preview-1",
        "items": [{ "alias": "prod", "identityFileIndex": 0, "passphrase": "one-time-secret" }]
    });
    assert!(serde_json::from_value::<SshConfigImportDto>(safe).is_ok());
    for forbidden in ["privateKeyPath", "privateKeyData", "configPath", "groupId"] {
        let mut unsafe_input = json!({
            "previewId": "preview-1",
            "items": [{ "alias": "prod", "identityFileIndex": 0, "passphrase": null }]
        });
        unsafe_input
            .as_object_mut()
            .unwrap()
            .insert(forbidden.to_owned(), json!("/Users/example/.ssh/config"));
        assert!(serde_json::from_value::<SshConfigImportDto>(unsafe_input).is_err());
    }
}

#[test]
fn ssh_config_preview_exposes_only_private_key_metadata() {
    let value = serde_json::to_value(SshConfigPreviewDto {
        preview_id: "preview-1".into(),
        source_name: "config".into(),
        warnings: Vec::new(),
        candidates: vec![SshConfigCandidateDto {
            alias: "prod".into(),
            name: "prod".into(),
            host: "prod.example".into(),
            port: 22,
            username: "deploy".into(),
            already_imported: false,
            importable: true,
            identities: vec![SshConfigIdentityDto {
                index: 0,
                file_name: "id_ed25519".into(),
                status: SshConfigIdentityStatusDto::Available,
            }],
            warnings: Vec::new(),
        }],
    })
    .expect("serialize preview");
    let encoded = value.to_string();
    assert!(encoded.contains("id_ed25519"));
    for forbidden in ["privateKeyPath", "privateKeyData", "/.ssh/"] {
        assert!(!encoded.contains(forbidden));
    }
}

#[test]
fn group_output_dto_has_no_nesting_contract() {
    let group = ProfileGroup::new(
        ProfileGroupId::parse("group-1").expect("fixture group id"),
        "Production",
    )
    .expect("fixture group");
    let value = serde_json::to_value(ProfileGroupDto::from(&group)).expect("serialize group");
    assert_eq!(value, json!({ "id": "group-1", "name": "Production" }));
    assert!(value.get("parentId").is_none());
}

#[test]
fn ssh_config_source_is_retrievable_only_by_its_opaque_preview_id() {
    let dir = tempdir().expect("dir");
    let state = ProfileState::new(JsonProfileRepository::new(
        dir.path().join("connections.json"),
    ));
    let path = dir.path().join("selected-config");
    let preview_id = state.remember_ssh_config(path.clone(), dir.path().to_owned());
    assert_eq!(
        state.ssh_config_source(&preview_id).expect("source").0,
        path
    );
    let expired = serde_json::to_value(
        state
            .ssh_config_source("different-preview")
            .expect_err("expired"),
    )
    .unwrap();
    assert_eq!(
        expired.get("message"),
        Some(&json!("SSH Config 导入预览已失效，请重新选择配置文件"))
    );
    let invalid = serde_json::to_value(invalid_import_selection()).unwrap();
    assert_eq!(
        invalid.get("message"),
        Some(&json!("所选连接已发生变化，请返回预览后重试"))
    );
    state.complete_ssh_config(&preview_id);
    assert!(state.ssh_config_source(&preview_id).is_err());
}

#[test]
fn preview_keeps_same_endpoint_aliases_importable_and_allocates_unique_names() {
    let existing = ConnectionProfile::new(
        ProfileId::parse("existing-profile").unwrap(),
        "PROD",
        "different.example",
        22,
        "root",
        AuthPreference::Manual,
        None,
    )
    .unwrap();
    let candidates =
        preview_candidate_dtos(&[existing], vec![candidate("prod"), candidate("PROD")]);
    assert!(candidates.iter().all(|candidate| candidate.importable));
    assert_eq!(candidates[0].name, "prod 1");
    assert_eq!(candidates[1].name, "PROD 2");
    assert!(candidates.iter().all(|candidate| {
        candidate
            .warnings
            .iter()
            .any(|warning| warning.contains("导入后将保存为"))
    }));
}

#[test]
fn preview_marks_only_the_full_connection_identity_as_already_imported() {
    let existing = ConnectionProfile::new(
        ProfileId::parse("existing-profile").unwrap(),
        "company-odp2-28",
        "10.100.5.28",
        22,
        "root",
        AuthPreference::Manual,
        None,
    )
    .unwrap();
    let candidates = preview_candidate_dtos(
        &[existing],
        vec![candidate("company-odp2-28"), candidate("test")],
    );
    assert!(candidates[0].already_imported);
    assert!(!candidates[0].importable);
    assert_eq!(candidates[0].name, "company-odp2-28");
    assert!(!candidates[1].already_imported);
    assert!(candidates[1].importable);
    assert_eq!(candidates[1].name, "test");
}

#[test]
fn allocated_import_names_reserve_suffix_space_within_profile_limit() {
    let long_name = "服".repeat(80);
    let mut used = HashSet::from([long_name.to_lowercase()]);
    let allocated = allocate_import_name(&long_name, &mut used);
    assert_eq!(allocated.chars().count(), 80);
    assert!(allocated.ends_with(" 1"));
}

#[test]
fn preview_identity_metadata_keeps_paths_out_of_the_dto() {
    let mut value = candidate("prod");
    value.identity_files.push(ImportIdentity {
        index: 0,
        path: PathBuf::from("/secret/id_ed25519"),
        reuse_key: PathBuf::from("/secret/id_ed25519"),
        file_name: "id_ed25519".into(),
        status: ImportIdentityStatus::Available,
    });
    let encoded = serde_json::to_string(&preview_candidate_dtos(&[], vec![value])).unwrap();
    assert!(encoded.contains("id_ed25519"));
    assert!(!encoded.contains("/secret/"));
}
