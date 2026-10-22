use super::{detail, unique_name};
use crate::domain::{
    configuration_merge::*,
    credential::{CredentialId, CredentialMaterial},
};
use std::collections::HashMap;

pub fn merge(
    source: &mut MergeCatalog,
    target: &MergeCatalog,
    plan: &mut MergePlan,
) -> MergeResult<HashMap<String, CredentialId>> {
    let mut mapping = HashMap::new();
    for (mut summary, material) in source.credentials.drain(..) {
        let old = summary.id.as_str().to_owned();
        let existing = target
            .credentials
            .iter()
            .chain(plan.additions.credentials.iter())
            .find(|(s, m)| s.kind == summary.kind && equivalent(m, &material));
        if let Some((stored, _)) = existing {
            let id = stored.id.clone();
            let name = stored.name.clone();
            detail(
                plan,
                "credentials",
                &summary.name,
                &name,
                true,
                "内容相同，复用当前凭证",
            );
            mapping.insert(old, id);
        } else {
            let name = unique_name(
                &summary.name,
                target
                    .credentials
                    .iter()
                    .chain(plan.additions.credentials.iter())
                    .map(|(s, _)| s.name.clone()),
            );
            detail(
                plan,
                "credentials",
                &summary.name,
                &name,
                false,
                "使用当前凭证库重新加密",
            );
            summary.id = CredentialId::parse(uuid::Uuid::new_v4().to_string())
                .map_err(|_| "凭证 ID 无效")?;
            summary.name = name;
            mapping.insert(old, summary.id.clone());
            plan.additions.credentials.push((summary, material));
        }
    }
    Ok(mapping)
}

fn equivalent(a: &CredentialMaterial, b: &CredentialMaterial) -> bool {
    match (a, b) {
        (CredentialMaterial::Password(a), CredentialMaterial::Password(b)) => {
            a.expose() == b.expose()
        }
        (
            CredentialMaterial::PrivateKey {
                data: a,
                passphrase: ap,
            },
            CredentialMaterial::PrivateKey {
                data: b,
                passphrase: bp,
            },
        ) => {
            a.expose() == b.expose()
                && ap.as_ref().map(|s| s.expose()) == bp.as_ref().map(|s| s.expose())
        }
        _ => false,
    }
}
