use crate::Catalog;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Resolution {
    Local,
    Remote,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub kind: &'static str,
    pub id: String,
    pub name: String,
}

pub struct Merge {
    pub catalog: Catalog,
    pub conflicts: Vec<Conflict>,
}

fn records<T: Clone + PartialEq>(
    base: &BTreeMap<String, T>,
    local: &BTreeMap<String, T>,
    remote: &BTreeMap<String, T>,
    resolution: Option<Resolution>,
    kind: &'static str,
    name: impl Fn(&T) -> &str,
    conflicts: &mut Vec<Conflict>,
) -> BTreeMap<String, T> {
    let mut result = BTreeMap::new();
    let ids: BTreeSet<_> = base
        .keys()
        .chain(local.keys())
        .chain(remote.keys())
        .collect();
    for id in ids {
        let (b, l, r) = (base.get(id), local.get(id), remote.get(id));
        let selected = if l == r || r == b {
            l
        } else if l == b {
            r
        } else {
            conflicts.push(Conflict {
                kind,
                id: id.clone(),
                name: l.or(r).map(&name).unwrap_or(id).to_owned(),
            });
            match resolution {
                Some(Resolution::Remote) => r,
                _ => l,
            }
        };
        if let Some(value) = selected {
            result.insert(id.clone(), value.clone());
        }
    }
    result
}

pub fn merge(
    base: &Catalog,
    local: &Catalog,
    remote: &Catalog,
    resolution: Option<Resolution>,
) -> Merge {
    let mut conflicts = Vec::new();
    let groups = records(
        &base.groups,
        &local.groups,
        &remote.groups,
        resolution,
        "group",
        |g| &g.name,
        &mut conflicts,
    );
    let profiles = records(
        &base.profiles,
        &local.profiles,
        &remote.profiles,
        resolution,
        "profile",
        |p| &p.name,
        &mut conflicts,
    );
    Merge {
        catalog: Catalog { groups, profiles },
        conflicts,
    }
}

#[cfg(test)]
mod tests;
