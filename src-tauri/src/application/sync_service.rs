use crate::ports::sync::*;
use qterm_sync_core::{Catalog, Conflict, PROTOCOL, Push, Resolution, Snapshot, merge};
use serde::Serialize;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub message: String,
    pub conflicts: Vec<Conflict>,
    pub conflict_token: Option<String>,
    pub last_success: Option<u64>,
}

pub struct SyncService<L, D, R> {
    pub local: L,
    pub device: D,
    pub remote: R,
    pub status: SyncStatus,
    conflict: Option<(String, Catalog, Snapshot)>,
    local_changed: bool,
}

impl<L: SyncLocalStore, D: SyncDeviceStore, R: SyncRemote> SyncService<L, D, R> {
    pub fn new(local: L, device: D, remote: R) -> Self {
        Self {
            local,
            device,
            remote,
            status: SyncStatus::default(),
            conflict: None,
            local_changed: false,
        }
    }

    pub fn configure(&mut self, mut settings: SyncSettings, token: Option<&str>) -> SyncResult<()> {
        let old = self.device.settings()?;
        if settings.enabled || !settings.server_url.trim().is_empty() {
            self.remote.validate_settings(&mut settings)?;
        }
        if settings.server_url != old.server_url && token.is_none() && settings.enabled {
            return Err("更换服务器时请重新输入 Token".into());
        }
        if settings.server_url != old.server_url && self.device.checkpoint()?.pending.is_some() {
            return Err("请先完成上一次同步的恢复，再更换服务器地址".into());
        }
        if settings.enabled && token.is_none() {
            self.device.token(&old)?;
        }
        settings.token_id = if settings.server_url != old.server_url && token.is_none() {
            String::new()
        } else {
            old.token_id
        };
        self.device.save_settings(&settings, token)?;
        self.conflict = None;
        self.status.conflicts.clear();
        self.status.conflict_token = None;
        self.status.message = if settings.enabled {
            "已启用；首次同步将合并两端连接，凭证需在本机配置"
        } else {
            "同步已关闭"
        }
        .into();
        Ok(())
    }

    pub async fn run(&mut self, resolution: Option<(String, Resolution)>) -> SyncResult<bool> {
        self.local_changed = false;
        let result = self.exchange(resolution).await;
        if let Err(error) = &result {
            self.status.message = error.clone();
        }
        result
    }

    pub fn take_local_change(&mut self) -> bool {
        std::mem::take(&mut self.local_changed)
    }

    async fn exchange(&mut self, resolution: Option<(String, Resolution)>) -> SyncResult<bool> {
        let settings = self.device.settings()?;
        if !settings.enabled {
            return Ok(false);
        }
        let mut checkpoint = self.device.checkpoint()?;
        // A pending local commit must be recovered before changing endpoints.
        if checkpoint.pending.is_some() {
            let changed = self.recover(&mut checkpoint, resolution)?;
            self.clear_conflict();
            self.status.message = "已恢复上次同步提交；下次同步将核对最新变化".into();
            return Ok(changed);
        }
        if checkpoint.endpoint != settings.server_url {
            checkpoint = SyncCheckpoint {
                endpoint: settings.server_url.clone(),
                ..Default::default()
            };
        }
        let token = self.device.token(&settings)?;
        let remote = self.remote.fetch(&settings, &token).await?;
        validate_remote(&remote)?;
        if let Some(base) = &checkpoint.baseline
            && (base.server_id != remote.server_id
                || remote.revision < base.revision
                || (remote.revision == base.revision && remote.catalog != base.catalog))
        {
            return Err("服务器标识或历史版本发生回退。同步已暂停，请恢复服务器数据或使用新的服务器地址建立独立同步关系。".into());
        }
        let local = self.local.catalog()?;
        let choice = if let Some((nonce, choice)) = resolution {
            match &self.conflict {
                Some((expected, previous_local, previous_remote))
                    if expected == &nonce
                        && previous_local == &local
                        && previous_remote == &remote =>
                {
                    Some(choice)
                }
                _ => return Err("冲突内容已变化，请重新同步后查看冲突".into()),
            }
        } else {
            None
        };
        let base = checkpoint
            .baseline
            .as_ref()
            .map(|v| &v.catalog)
            .cloned()
            .unwrap_or_default();
        let merged = merge(&base, &local, &remote.catalog, choice);
        if !merged.conflicts.is_empty() && choice.is_none() {
            let nonce = uuid::Uuid::new_v4().to_string();
            self.status.conflicts = merged.conflicts;
            self.status.conflict_token = Some(nonce.clone());
            self.conflict = Some((nonce, local, remote));
            return Err("发现并发修改，请选择冲突条目保留本机版本或服务器版本".into());
        }
        merged.catalog.validate().map_err(str::to_owned)?;
        let agreed = if merged.catalog != remote.catalog {
            let response = self
                .remote
                .push(
                    &settings,
                    &token,
                    Push {
                        protocol: PROTOCOL,
                        server_id: remote.server_id.clone(),
                        base_revision: remote.revision,
                        catalog: merged.catalog.clone(),
                    },
                )
                .await?;
            validate_remote(&response)?;
            if response.server_id != remote.server_id
                || response.revision <= remote.revision
                || response.catalog != merged.catalog
            {
                return Err("服务器返回了不一致的提交结果".into());
            }
            response
        } else {
            remote
        };
        checkpoint.pending = Some(PendingApply {
            before: local,
            agreed,
        });
        self.device.save_checkpoint(&checkpoint)?;
        let changed = self.recover(&mut checkpoint, None)?;
        self.status = SyncStatus {
            message: "连接配置已同步；密码与私钥仍由本机管理".into(),
            last_success: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            ),
            ..Default::default()
        };
        self.conflict = None;
        Ok(changed)
    }

    fn clear_conflict(&mut self) {
        self.status.conflicts.clear();
        self.status.conflict_token = None;
        self.conflict = None;
    }

    fn recover(
        &mut self,
        checkpoint: &mut SyncCheckpoint,
        resolution: Option<(String, Resolution)>,
    ) -> SyncResult<bool> {
        let Some(pending) = &checkpoint.pending else {
            return Ok(false);
        };
        let current = self.local.catalog()?;
        let choice = match resolution {
            Some((nonce, choice)) => match &self.conflict {
                Some((expected, local, remote))
                    if expected == &nonce && local == &current && remote == &pending.agreed =>
                {
                    Some(choice)
                }
                _ => return Err("恢复冲突内容已变化，请重新同步".into()),
            },
            None => None,
        };
        let merged = merge(&pending.before, &current, &pending.agreed.catalog, choice);
        if !merged.conflicts.is_empty() && choice.is_none() {
            let nonce = uuid::Uuid::new_v4().to_string();
            self.status.conflicts = merged.conflicts;
            self.status.conflict_token = Some(nonce.clone());
            self.conflict = Some((nonce, current, pending.agreed.clone()));
            return Err("恢复上次同步时发现本机并发修改，请处理冲突后继续".into());
        }
        merged.catalog.validate().map_err(str::to_owned)?;
        let changed = current != merged.catalog;
        if changed {
            self.local.apply(&current, &merged.catalog)?;
            self.local_changed = true;
        }
        checkpoint.baseline = Some(pending.agreed.clone());
        checkpoint.pending = None;
        self.device.save_checkpoint(checkpoint)?;
        Ok(changed)
    }
}

fn validate_remote(snapshot: &Snapshot) -> SyncResult<()> {
    if snapshot.protocol != PROTOCOL
        || snapshot.server_id.is_empty()
        || snapshot.server_id.len() > 128
    {
        return Err("同步服务协议不兼容".into());
    }
    snapshot.catalog.validate().map_err(str::to_owned)
}

#[cfg(test)]
mod tests;
