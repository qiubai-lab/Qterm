use super::*;
use crate::{AuthPreference, Group, Profile};

fn catalog() -> Catalog {
    Catalog {
        groups: BTreeMap::new(),
        profiles: BTreeMap::from([(
            "a".into(),
            Profile {
                name: "A".into(),
                host: "example.com".into(),
                port: 22,
                username: "root".into(),
                auth_preference: AuthPreference::SshAgent,
                group_id: None,
                jump_profile_ids: vec![],
            },
        )]),
    }
}
#[test]
fn independent_changes_and_offline_deletion_converge() {
    let base = catalog();
    let mut local = base.clone();
    let mut remote = base.clone();
    local.profiles.clear();
    remote.groups.insert(
        "g".into(),
        Group {
            name: "Group".into(),
        },
    );
    let result = merge(&base, &local, &remote, None);
    assert!(result.conflicts.is_empty());
    assert!(result.catalog.profiles.is_empty());
    assert_eq!(result.catalog.groups, remote.groups);
    assert_eq!(merge(&base, &remote, &local, None).catalog, result.catalog);
}
#[test]
fn edits_and_delete_conflicts_require_explicit_choice() {
    let base = catalog();
    let mut local = base.clone();
    let mut remote = base.clone();
    local.profiles.get_mut("a").unwrap().port = 23;
    remote.profiles.clear();
    assert_eq!(merge(&base, &local, &remote, None).conflicts.len(), 1);
    assert!(
        merge(&base, &local, &remote, Some(Resolution::Remote))
            .catalog
            .profiles
            .is_empty()
    );
    assert_eq!(
        merge(&base, &local, &remote, Some(Resolution::Local)).catalog,
        local
    );
}
#[test]
fn first_merge_unions_ids_and_retry_is_idempotent() {
    let local = catalog();
    let mut remote = Catalog::default();
    remote.groups.insert("g".into(), Group { name: "G".into() });
    let merged = merge(&Catalog::default(), &local, &remote, None).catalog;
    assert_eq!(merged.profiles, local.profiles);
    assert_eq!(
        merge(&Catalog::default(), &local, &merged, None).catalog,
        merged
    );
}
#[test]
fn rejects_secrets_and_invalid_relations() {
    let mut value = serde_json::to_value(catalog()).unwrap();
    value["profiles"]["a"]["credentialId"] = "secret".into();
    assert!(serde_json::from_value::<Catalog>(value).is_err());
    let mut data = catalog();
    data.profiles
        .get_mut("a")
        .unwrap()
        .jump_profile_ids
        .push("missing".into());
    assert!(data.validate().is_err());
}
