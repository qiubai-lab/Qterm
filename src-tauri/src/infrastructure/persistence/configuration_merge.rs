mod files;
#[cfg(test)]
mod tests;

use super::{
    json_credential_vault::JsonCredentialVault, json_network_repository::JsonNetworkRepository,
    json_profile_repository::JsonProfileRepository,
};
use crate::{
    domain::{
        auth::{SecretBytes, SecretText},
        configuration_merge::*,
        credential::CredentialMaterial,
    },
    ports::{
        configuration_merge::ConfigurationMergeStorage, credential_vault::CredentialVault,
        network_repository::NetworkRepository, profile_repository::ProfileRepository,
    },
};
use files::{FILES, Snapshot};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tempfile::TempDir;

pub struct FileConfigurationMergeStorage {
    target: PathBuf,
    vault: JsonCredentialVault,
    source: Option<PathBuf>,
    prepared: Option<Prepared>,
    unlocked_source: Option<(Snapshot, JsonCredentialVault, Instant)>,
}

struct Prepared {
    source_before: Snapshot,
    target_before: Snapshot,
    stage: TempDir,
    token: String,
    expires: Instant,
    needs_vault: bool,
}

impl FileConfigurationMergeStorage {
    pub fn new(root: PathBuf, vault: JsonCredentialVault) -> Self {
        Self {
            target: root.join("data"),
            vault,
            source: None,
            prepared: None,
            unlocked_source: None,
        }
    }
    pub fn recover(root: &Path) -> MergeResult<()> {
        files::recover(&root.join("data"))
    }
}

fn profiles(data: &Path) -> MergeResult<MergeCatalog> {
    let repository = JsonProfileRepository::new(data.join(FILES[0]));
    Ok(MergeCatalog {
        profiles: repository.list().map_err(|_| "连接文件损坏或版本不支持")?,
        groups: repository
            .list_groups()
            .map_err(|_| "分组文件损坏或版本不支持")?,
        ..Default::default()
    })
}

fn credential_materials(
    vault: &JsonCredentialVault,
) -> MergeResult<
    Vec<(
        crate::domain::credential::CredentialSummary,
        CredentialMaterial,
    )>,
> {
    vault
        .list()
        .map_err(|_| "无法读取凭证库")?
        .into_iter()
        .map(|s| {
            let material = vault
                .load(&s.id)
                .map_err(|_| "凭证无法解密，请重新解锁凭证库")?;
            Ok((s, material))
        })
        .collect()
}

fn status(result: MergeResult<usize>) -> MergeCategoryStatus {
    match result {
        Ok(count) => MergeCategoryStatus { count, error: None },
        Err(e) => MergeCategoryStatus {
            count: 0,
            error: Some(e.into()),
        },
    }
}

impl ConfigurationMergeStorage for FileConfigurationMergeStorage {
    fn scan(&mut self, root: &Path) -> MergeResult<MergeScan> {
        self.cancel();
        let source = files::data_directory(root)?;
        let target = self
            .target
            .canonicalize()
            .map_err(|_| "无法读取当前配置目录")?;
        if source == target {
            return Err("来源目录不能是当前配置目录");
        }
        let snapshot = files::snapshot(&source)?;
        if snapshot.iter().all(Option::is_none) {
            return Err("来源目录没有可合并的配置文件");
        }
        // Scan immutable copies, so readers never observe different generations of a file.
        let scan = tempfile::tempdir().map_err(|_| "无法创建扫描暂存区")?;
        files::copy_snapshot(scan.path(), &snapshot)?;
        let connections = status(profiles(scan.path()).map(|c| c.profiles.len() + c.groups.len()));
        let network = status(
            JsonNetworkRepository::new(scan.path().join(FILES[1]))
                .list()
                .map(|r| r.len())
                .map_err(|_| "网络规则文件损坏或版本不支持"),
        );
        let credentials = status(if snapshot[2].is_none() {
            Ok(0)
        } else {
            JsonCredentialVault::new(scan.path().join(FILES[2]))
                .list()
                .map(|c| c.len())
                .map_err(|_| "凭证库损坏或版本不支持")
        });
        self.source = Some(source);
        Ok(MergeScan {
            source: root.to_string_lossy().into_owned(),
            connections,
            network,
            credentials,
        })
    }

    fn read_selected(
        &mut self,
        options: MergeOptions,
        password: Option<SecretText>,
    ) -> MergeResult<(MergeCatalog, MergeCatalog)> {
        self.prepared = None;
        if !options.credentials {
            self.unlocked_source = None;
        }
        let source = self.source.as_ref().ok_or("请先选择来源目录")?;
        let source_before = files::snapshot(source)?;
        let target_before =
            files::snapshot(&self.target.canonicalize().map_err(|_| "无法读取目标目录")?)?;
        let source_copy = tempfile::tempdir().map_err(|_| "无法创建来源快照")?;
        files::copy_snapshot(source_copy.path(), &source_before)?;
        let stage = tempfile::Builder::new()
            .prefix(".merge-stage-")
            .tempdir_in(&self.target)
            .map_err(|_| "无法创建合并暂存区")?;
        files::copy_snapshot(stage.path(), &target_before)?;
        let mut from = if options.connections {
            profiles(source_copy.path())?
        } else {
            MergeCatalog::default()
        };
        let mut to = if options.connections {
            profiles(stage.path())?
        } else {
            MergeCatalog::default()
        };
        if options.network {
            from.rules = JsonNetworkRepository::new(source_copy.path().join(FILES[1]))
                .list()
                .map_err(|_| "来源网络规则损坏或版本不支持")?;
            to.rules = JsonNetworkRepository::new(stage.path().join(FILES[1]))
                .list()
                .map_err(|_| "当前网络规则损坏或版本不支持")?;
        }
        if options.credentials && source_before[2].is_some() {
            let path = source_copy.path().join(FILES[2]);
            let source_vault = if let Some(password) = password {
                self.unlocked_source = None;
                let vault = JsonCredentialVault::new(path);
                vault
                    .unlock(password)
                    .map_err(|_| "来源主密码错误或凭证库无法解密")?;
                self.unlocked_source = Some((
                    source_before.clone(),
                    vault.clone(),
                    Instant::now() + Duration::from_secs(600),
                ));
                vault
            } else {
                match &self.unlocked_source {
                    Some((snapshot, vault, deadline))
                        if snapshot == &source_before && *deadline > Instant::now() =>
                    {
                        vault.fork_at(path)
                    }
                    _ => {
                        self.unlocked_source = None;
                        return Err("请重新验证来源配置主密码");
                    }
                }
            };
            if !self
                .vault
                .status()
                .map_err(|_| "当前凭证库不可用")?
                .unlocked
            {
                self.unlocked_source = None;
                return Err("请先初始化或解锁当前凭证库");
            }
            from.credentials = credential_materials(&source_vault)?;
            to.credentials = credential_materials(&self.vault)?;
        }
        self.prepared = Some(Prepared {
            source_before,
            target_before,
            stage,
            token: String::new(),
            expires: Instant::now() + Duration::from_secs(600),
            needs_vault: options.credentials,
        });
        Ok((from, to))
    }

    fn stage(&mut self, plan: &MergePlan) -> MergeResult<String> {
        if !plan.changed() {
            self.prepared = None;
            return Ok(String::new());
        }
        let prepared = self.prepared.as_mut().ok_or("请重新生成预览")?;
        let data = prepared.stage.path();
        let profiles = JsonProfileRepository::new(data.join(FILES[0]));
        for group in &plan.additions.groups {
            profiles
                .insert_group(group.clone())
                .map_err(|_| "无法暂存分组")?;
        }
        if !plan.additions.profiles.is_empty() {
            profiles
                .insert_many(plan.additions.profiles.clone())
                .map_err(|_| "无法暂存连接")?;
        }
        let network = JsonNetworkRepository::new(data.join(FILES[1]));
        for rule in &plan.additions.rules {
            network
                .insert(rule.clone())
                .map_err(|_| "无法暂存网络规则")?;
        }
        let vault = self.vault.fork_at(data.join(FILES[2]));
        for (summary, material) in &plan.additions.credentials {
            match material {
                CredentialMaterial::Password(p) => vault.save_password(
                    summary.id.clone(),
                    summary.name.clone(),
                    SecretText::new(p.expose().into()),
                ),
                CredentialMaterial::PrivateKey { data, passphrase } => vault.save_private_key(
                    summary.id.clone(),
                    summary.name.clone(),
                    SecretBytes::new(data.expose().to_vec()),
                    passphrase
                        .as_ref()
                        .map(|p| SecretText::new(p.expose().into())),
                    summary.detail.clone().unwrap_or_default(),
                ),
            }
            .map_err(|_| "无法暂存加密凭证")?;
        }
        // Check final sizes and schemas before offering confirmation.
        files::snapshot(data)?;
        if !plan.additions.profiles.is_empty() || !plan.additions.groups.is_empty() {
            profiles.list().map_err(|_| "合并后的连接配置无效")?;
        }
        if !plan.additions.credentials.is_empty() {
            vault.list().map_err(|_| "合并后的凭证库无效")?;
        }
        prepared.token = uuid::Uuid::new_v4().to_string();
        Ok(prepared.token.clone())
    }

    fn commit(&mut self, token: &str) -> MergeResult<()> {
        self.unlocked_source = None;
        let prepared = self.prepared.take().ok_or("预览已失效，请重新生成")?;
        if token.is_empty() || prepared.token != token || prepared.expires < Instant::now() {
            return Err("预览已失效，请重新生成");
        }
        if prepared.needs_vault
            && !self
                .vault
                .status()
                .map_err(|_| "当前凭证库不可用")?
                .unlocked
        {
            return Err("当前凭证库已锁定，请解锁后重新预览");
        }
        if files::snapshot(self.source.as_ref().ok_or("请重新选择来源目录")?)?
            != prepared.source_before
            || files::snapshot(&self.target.canonicalize().map_err(|_| "无法读取目标目录")?)?
                != prepared.target_before
        {
            return Err("来源或当前配置已变化，请重新预览并确认");
        }
        let next = files::snapshot(prepared.stage.path())?;
        let result = files::commit(&self.target, &prepared.target_before, &next);
        self.unlocked_source = None;
        result
    }
    fn cancel(&mut self) {
        self.prepared = None;
        self.source = None;
        self.unlocked_source = None;
    }
}
