use super::{credentials, detail, unique_name};
use crate::domain::{
    configuration_merge::*,
    network::{ForwardRule, NetworkRuleId},
    profile::{ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId, validate_jump_routes},
};
use std::collections::HashMap;

pub(super) fn plan(
    mut source: MergeCatalog,
    target: MergeCatalog,
    options: MergeOptions,
) -> MergeResult<MergePlan> {
    let mut plan = MergePlan::default();
    let credentials = if options.credentials {
        credentials::merge(&mut source, &target, &mut plan)?
    } else {
        HashMap::new()
    };
    if !options.connections {
        return Ok(plan);
    }
    validate_jump_routes(&source.profiles).map_err(|_| "来源跳板机路径无效")?;
    if !options.credentials
        && source.profiles.iter().any(|p| {
            p.jump_profile_ids().iter().any(|id| {
                source
                    .profiles
                    .iter()
                    .any(|jump| jump.id() == id && jump.credential_id().is_some())
            })
        })
    {
        return Err("来源跳板机依赖保存的凭证，请同时选择凭证，以保留有效的跳板机路径");
    }
    let mut groups = HashMap::new();
    for group in &source.groups {
        if let Some(existing) = target
            .groups
            .iter()
            .find(|g| g.name().eq_ignore_ascii_case(group.name()))
        {
            groups.insert(group.id().clone(), existing.id().clone());
            detail(
                &mut plan,
                "groups",
                group.name(),
                existing.name(),
                true,
                "复用同名分组",
            );
        } else {
            let id = ProfileGroupId::parse(uuid::Uuid::new_v4().to_string())
                .map_err(|_| "分组 ID 无效")?;
            groups.insert(group.id().clone(), id.clone());
            plan.additions
                .groups
                .push(ProfileGroup::new(id, group.name()).map_err(|_| "分组无效")?);
            detail(&mut plan, "groups", group.name(), group.name(), false, "");
        }
    }
    let mut mapping: HashMap<ProfileId, ProfileId> = HashMap::new();
    let mut pending: Vec<_> = source.profiles.iter().collect();
    while !pending.is_empty() {
        let before = pending.len();
        let mut next = Vec::new();
        for p in pending {
            if !p
                .jump_profile_ids()
                .iter()
                .all(|id| mapping.contains_key(id))
            {
                next.push(p);
                continue;
            }
            let credential = match p.credential_id() {
                Some(id) if options.credentials => Some(
                    credentials
                        .get(id.as_str())
                        .cloned()
                        .ok_or("来源连接引用了缺失的凭证")?,
                ),
                _ => None,
            };
            let group = p
                .group_id()
                .map(|id| groups.get(id).cloned().ok_or("来源连接引用了缺失的分组"))
                .transpose()?;
            let jumps: Vec<_> = p
                .jump_profile_ids()
                .iter()
                .map(|id| mapping[id].clone())
                .collect();
            let all = || target.profiles.iter().chain(plan.additions.profiles.iter());
            let existing = all().find(|e| {
                same_name(e.name(), p.name())
                    && e.host() == p.host()
                    && e.port() == p.port()
                    && e.username() == p.username()
                    && e.auth_preference() == p.auth_preference()
                    && e.credential_id() == credential.as_ref()
                    && e.group_id() == group.as_ref()
                    && e.jump_profile_ids() == jumps
            });
            if let Some(existing) = existing {
                let id = existing.id().clone();
                let name = existing.name().to_owned();
                mapping.insert(p.id().clone(), id);
                detail(
                    &mut plan,
                    "connections",
                    p.name(),
                    &name,
                    true,
                    "连接参数及引用相同",
                );
                continue;
            }
            let name = unique_name(p.name(), all().map(|p| p.name().to_owned()));
            let id =
                ProfileId::parse(uuid::Uuid::new_v4().to_string()).map_err(|_| "连接 ID 无效")?;
            let profile = ConnectionProfile::new(
                id.clone(),
                &name,
                p.host(),
                p.port().into(),
                p.username(),
                p.auth_preference(),
                credential,
            )
            .map_err(|_| "连接参数无效")?
            .with_group_id(group)
            .with_jump_profile_ids(jumps);
            mapping.insert(p.id().clone(), id);
            plan.additions.profiles.push(profile);
            detail(
                &mut plan,
                "connections",
                p.name(),
                &name,
                false,
                if p.credential_id().is_some() && !options.credentials {
                    "未携带来源凭证绑定，需要重新绑定凭证"
                } else {
                    ""
                },
            );
        }
        if next.len() == before {
            return Err("来源跳板机引用存在循环或缺失");
        }
        pending = next;
    }
    let profiles: Vec<_> = target
        .profiles
        .iter()
        .chain(plan.additions.profiles.iter())
        .cloned()
        .collect();
    validate_jump_routes(&profiles).map_err(|_| "合并后的跳板机路径无效")?;
    if options.network {
        for rule in &source.rules {
            let Some(profile) = mapping.get(rule.profile_id()) else {
                let kind = match rule.kind() {
                    crate::domain::network::ForwardRuleKind::Local { .. } => "本地转发",
                    crate::domain::network::ForwardRuleKind::Remote { .. } => "远程转发",
                    crate::domain::network::ForwardRuleKind::Socks5 { .. } => "SOCKS5",
                };
                plan.details.push(MergeDetail {
                    category: "network",
                    name: rule.name().into(),
                    target_name: rule.name().into(),
                    outcome: "invalid",
                    note: format!(
                        "{kind} · 来源连接不存在（ID：{}），此规则不会导入",
                        rule.profile_id().as_str()
                    ),
                });
                continue;
            };
            let all = || target.rules.iter().chain(plan.additions.rules.iter());
            if let Some(existing) =
                all().find(|e| e.profile_id() == profile && e.kind() == rule.kind())
            {
                let name = existing.name().to_owned();
                detail(
                    &mut plan,
                    "network",
                    rule.name(),
                    &name,
                    true,
                    "规则内容相同",
                );
                continue;
            }
            let name = unique_name(
                rule.name(),
                all()
                    .filter(|r| r.profile_id() == profile)
                    .map(|r| r.name().to_owned()),
            );
            let id = NetworkRuleId::parse(uuid::Uuid::new_v4().to_string())
                .map_err(|_| "规则 ID 无效")?;
            let conflict = all().any(|r| listener(r.kind()) == listener(rule.kind()));
            plan.additions.rules.push(
                ForwardRule::new(id, profile.clone(), &name, rule.kind().clone())
                    .map_err(|_| "规则无效")?,
            );
            detail(
                &mut plan,
                "network",
                rule.name(),
                &name,
                false,
                if conflict {
                    "存在相同监听地址和端口，可能冲突；导入后保持停止"
                } else {
                    "导入后保持停止；启动时检查监听端口冲突"
                },
            );
        }
    }
    if target.rules.len() + plan.additions.rules.len() > 512 {
        return Err("合并后网络规则超过 512 条上限");
    }
    plan.details.sort_by_key(|d| d.outcome != "invalid");
    Ok(plan)
}

fn same_name(candidate: &str, source: &str) -> bool {
    if candidate == source {
        return true;
    }
    let Some((prefix, suffix)) = candidate.rsplit_once("（导入 ") else {
        return false;
    };
    let valid_suffix = suffix
        .strip_suffix('）')
        .and_then(|s| s.parse::<usize>().ok())
        .is_some_and(|n| n >= 2);
    let suffix_length = "（导入 ".chars().count() + suffix.chars().count();
    valid_suffix
        && suffix_length < 80
        && prefix == source.chars().take(80 - suffix_length).collect::<String>()
}

fn listener(kind: &crate::domain::network::ForwardRuleKind) -> (bool, &str, u16) {
    use crate::domain::network::ForwardRuleKind::*;
    match kind {
        Local {
            bind_host,
            bind_port,
            ..
        }
        | Socks5 {
            bind_host,
            bind_port,
        } => (false, bind_host, *bind_port),
        Remote {
            bind_host,
            bind_port,
            ..
        } => (true, bind_host, *bind_port),
    }
}
