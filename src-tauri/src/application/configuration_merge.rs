mod credentials;
mod planner;
#[cfg(test)]
mod tests;

use crate::{
    domain::{auth::SecretText, configuration_merge::*},
    ports::configuration_merge::ConfigurationMergeStorage,
};
use std::path::Path;

pub struct ConfigurationMergeService<S> {
    storage: S,
}

impl<S: ConfigurationMergeStorage> ConfigurationMergeService<S> {
    pub fn new(storage: S) -> Self {
        Self { storage }
    }
    pub fn scan(&mut self, source: &Path) -> MergeResult<MergeScan> {
        self.storage.scan(source)
    }
    pub fn unlock_source_credentials(&mut self, password: SecretText) -> MergeResult<()> {
        // Validate only credential material; unrelated connection/rule planning belongs to preview.
        self.storage.read_selected(
            MergeOptions {
                connections: false,
                network: false,
                credentials: true,
            },
            Some(password),
        )?;
        Ok(())
    }
    pub fn preview(
        &mut self,
        options: MergeOptions,
        password: Option<SecretText>,
    ) -> MergeResult<(String, MergePlan)> {
        if options.network && !options.connections {
            return Err("网络规则需要同时选择连接与分组");
        }
        let (source, target) = self.storage.read_selected(options, password)?;
        let plan = planner::plan(source, target, options)?;
        let token = self.storage.stage(&plan)?;
        Ok((token, plan))
    }
    pub fn commit(&mut self, token: &str) -> MergeResult<()> {
        self.storage.commit(token)
    }
    pub fn cancel(&mut self) {
        self.storage.cancel();
    }
}

fn unique_name(name: &str, existing: impl Iterator<Item = String>) -> String {
    let names: Vec<_> = existing.collect();
    if !names.iter().any(|n| n.eq_ignore_ascii_case(name)) {
        return name.into();
    }
    for i in 2.. {
        let suffix = format!("（导入 {i}）");
        let candidate = format!(
            "{}{}",
            name.chars()
                .take(80 - suffix.chars().count())
                .collect::<String>(),
            suffix
        );
        if !names.iter().any(|n| n.eq_ignore_ascii_case(&candidate)) {
            return candidate;
        }
    }
    unreachable!()
}

fn detail(
    plan: &mut MergePlan,
    category: &'static str,
    name: &str,
    target: &str,
    skipped: bool,
    note: &str,
) {
    plan.details.push(MergeDetail {
        category,
        name: name.into(),
        target_name: target.into(),
        outcome: if skipped {
            "skipped"
        } else if name != target {
            "renamed"
        } else {
            "added"
        },
        note: note.into(),
    });
}
