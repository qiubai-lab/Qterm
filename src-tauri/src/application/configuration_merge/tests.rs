use super::*;
use crate::domain::{
    credential::CredentialId,
    network::{ForwardRule, ForwardRuleKind, NetworkRuleId},
    profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
};

fn profile(id: &str, name: &str, host: &str) -> ConnectionProfile {
    ConnectionProfile::new(
        ProfileId::parse(id).unwrap(),
        name,
        host,
        22,
        "user",
        AuthPreference::Password,
        None,
    )
    .unwrap()
}

#[test]
fn collisions_preserve_current_and_map_jump_group_and_network_references() {
    let group = ProfileGroup::new(ProfileGroupId::parse("group").unwrap(), "team").unwrap();
    let jump = ConnectionProfile::new(
        ProfileId::parse("jump").unwrap(),
        "jump",
        "jump-host",
        22,
        "user",
        AuthPreference::SshAgent,
        None,
    )
    .unwrap()
    .with_group_id(Some(group.id().clone()));
    let server =
        profile("server", "server", "source-host").with_jump_profile_ids(vec![jump.id().clone()]);
    let rule = ForwardRule::new(
        NetworkRuleId::parse("rule").unwrap(),
        server.id().clone(),
        "forward",
        ForwardRuleKind::socks5("127.0.0.1", 1080).unwrap(),
    )
    .unwrap();
    let source = MergeCatalog {
        groups: vec![group],
        profiles: vec![server, jump],
        rules: vec![rule],
        ..Default::default()
    };
    let target = MergeCatalog {
        profiles: vec![profile("server", "server", "current-host")],
        ..Default::default()
    };
    let plan = planner::plan(
        source,
        target,
        MergeOptions {
            connections: true,
            network: true,
            credentials: false,
        },
    )
    .unwrap();
    let imported = plan
        .additions
        .profiles
        .iter()
        .find(|p| p.host() == "source-host")
        .unwrap();
    assert_eq!(imported.name(), "server（导入 2）");
    assert_ne!(imported.id().as_str(), "server");
    let jump = &plan.additions.profiles[0];
    assert_eq!(imported.jump_profile_ids(), &[jump.id().clone()]);
    assert_eq!(jump.group_id(), Some(plan.additions.groups[0].id()));
    assert_eq!(plan.additions.rules[0].profile_id(), imported.id());
}

#[test]
fn missing_source_credential_never_binds_to_coincidental_target_id() {
    let p =
        profile("p", "p", "host").with_credential_id(Some(CredentialId::parse("missing").unwrap()));
    let plan = planner::plan(
        MergeCatalog {
            profiles: vec![p.clone()],
            ..Default::default()
        },
        MergeCatalog::default(),
        MergeOptions {
            connections: true,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(plan.additions.profiles[0].credential_id().is_none());
    assert!(plan.details[0].note.contains("重新绑定"));
    assert!(
        planner::plan(
            MergeCatalog {
                profiles: vec![p],
                ..Default::default()
            },
            MergeCatalog::default(),
            MergeOptions {
                connections: true,
                credentials: true,
                network: false
            }
        )
        .is_err()
    );
}

#[test]
fn a_network_rule_cannot_bind_to_a_target_only_connection() {
    let rule = ForwardRule::new(
        NetworkRuleId::parse("r").unwrap(),
        ProfileId::parse("target-only").unwrap(),
        "rule",
        ForwardRuleKind::socks5("localhost", 1080).unwrap(),
    )
    .unwrap();
    let plan = planner::plan(
        MergeCatalog {
            rules: vec![rule],
            ..Default::default()
        },
        MergeCatalog {
            profiles: vec![profile("target-only", "server", "host")],
            ..Default::default()
        },
        MergeOptions {
            connections: true,
            network: true,
            credentials: false,
        },
    )
    .unwrap();
    assert!(!plan.changed());
    assert!(plan.additions.rules.is_empty());
    assert_eq!(plan.details[0].outcome, "invalid");
    assert!(plan.details[0].note.contains("target-only"));
}

#[test]
fn credential_backed_jump_routes_require_credential_import() {
    let jump = profile("jump", "jump", "host")
        .with_credential_id(Some(CredentialId::parse("secret").unwrap()));
    let server =
        profile("target", "server", "target").with_jump_profile_ids(vec![jump.id().clone()]);
    let result = planner::plan(
        MergeCatalog {
            profiles: vec![jump, server],
            ..Default::default()
        },
        MergeCatalog::default(),
        MergeOptions {
            connections: true,
            ..Default::default()
        },
    );
    assert!(matches!(result, Err(message) if message.contains("同时选择凭证")));
}

#[test]
fn private_key_duplicates_compare_material_and_passphrase_not_only_names() {
    use crate::domain::{
        auth::{SecretBytes, SecretText},
        credential::{CredentialKind, CredentialMaterial, CredentialSummary},
    };
    let entry = |id: &str, passphrase: &str| {
        (
            CredentialSummary {
                id: CredentialId::parse(id).unwrap(),
                name: "key".into(),
                kind: CredentialKind::PrivateKey,
                detail: Some("Ed25519".into()),
            },
            CredentialMaterial::PrivateKey {
                data: SecretBytes::new(b"encrypted-private-key-fixture".to_vec()),
                passphrase: Some(SecretText::new(passphrase.into())),
            },
        )
    };
    let plan = planner::plan(
        MergeCatalog {
            credentials: vec![entry("duplicate", "same"), entry("different", "other")],
            ..Default::default()
        },
        MergeCatalog {
            credentials: vec![entry("current", "same")],
            ..Default::default()
        },
        MergeOptions {
            credentials: true,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(plan.additions.credentials.len(), 1);
    assert_eq!(plan.additions.credentials[0].0.name, "key（导入 2）");
    assert_eq!(plan.details[0].outcome, "skipped");
}

#[test]
fn invalid_rules_are_first_while_valid_rules_keep_their_mapped_connections() {
    let rules = [
        ("valid", "server"),
        ("invalid-a", "missing-a"),
        ("invalid-b", "missing-b"),
    ]
    .into_iter()
    .map(|(id, p)| {
        ForwardRule::new(
            NetworkRuleId::parse(id).unwrap(),
            ProfileId::parse(p).unwrap(),
            id,
            ForwardRuleKind::socks5("localhost", 1080).unwrap(),
        )
        .unwrap()
    })
    .collect();
    let plan = planner::plan(
        MergeCatalog {
            profiles: vec![profile("server", "server", "host")],
            rules,
            ..Default::default()
        },
        MergeCatalog::default(),
        MergeOptions {
            connections: true,
            network: true,
            credentials: false,
        },
    )
    .unwrap();
    assert!(plan.changed());
    assert_eq!(plan.additions.rules.len(), 1);
    assert_eq!(
        plan.additions.rules[0].profile_id(),
        plan.additions.profiles[0].id()
    );
    assert_eq!(plan.details[0].name, "invalid-a");
    assert_eq!(plan.details[1].name, "invalid-b");
    assert_eq!(
        plan.details
            .iter()
            .filter(|d| d.outcome == "invalid")
            .count(),
        2
    );
}
