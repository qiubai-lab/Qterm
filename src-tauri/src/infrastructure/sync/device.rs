use crate::ports::sync::*;
use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use zeroize::Zeroizing;

pub struct DeviceStore {
    directory: PathBuf,
    account: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Versioned<T> {
    version: u32,
    data: T,
}

impl DeviceStore {
    pub fn new(directory: PathBuf) -> Self {
        let account = format!(
            "{:x}",
            Sha256::digest(directory.to_string_lossy().as_bytes())
        );
        Self { directory, account }
    }
    fn entry(&self, id: &str) -> SyncResult<keyring::Entry> {
        keyring::Entry::new("com.qiubai.qterm.sync", &format!("{}-{id}", self.account))
            .map_err(|_| "系统安全存储不可用，无法保存同步 Token".into())
    }
}

impl SyncDeviceStore for DeviceStore {
    fn settings(&self) -> SyncResult<SyncSettings> {
        read(&self.directory.join("sync-settings.json"))
    }
    fn save_settings(&self, settings: &SyncSettings, token: Option<&str>) -> SyncResult<()> {
        let mut next = settings.clone();
        if let Some(token) = token {
            if !(32..=512).contains(&token.len()) || !token.bytes().all(|b| b.is_ascii_graphic()) {
                return Err("Token 需为 32–512 个无空格的 ASCII 字符".into());
            }
            next.token_id = uuid::Uuid::new_v4().to_string();
            self.entry(&next.token_id)?
                .set_password(token)
                .map_err(|_| "无法将 Token 保存到系统安全存储")?;
        }
        if let Err(error) = write(&self.directory.join("sync-settings.json"), &next) {
            if token.is_some() {
                let _ = self
                    .entry(&next.token_id)
                    .and_then(|e| e.delete_credential().map_err(|_| "清理失败".into()));
            }
            return Err(error);
        }
        if token.is_some() && !settings.token_id.is_empty() {
            let _ = self
                .entry(&settings.token_id)
                .and_then(|e| e.delete_credential().map_err(|_| "清理失败".into()));
        }
        Ok(())
    }
    fn checkpoint(&self) -> SyncResult<SyncCheckpoint> {
        read(&self.directory.join("sync-checkpoint.json"))
    }
    fn save_checkpoint(&self, checkpoint: &SyncCheckpoint) -> SyncResult<()> {
        write(&self.directory.join("sync-checkpoint.json"), checkpoint)
    }
    fn token(&self, settings: &SyncSettings) -> SyncResult<Zeroizing<String>> {
        if settings.token_id.is_empty() {
            return Err("请配置同步 Token".into());
        }
        self.entry(&settings.token_id)?
            .get_password()
            .map(Zeroizing::new)
            .map_err(|_| "无法读取同步 Token，请解锁系统密钥存储或重新配置 Token".into())
    }
}

fn read<T: DeserializeOwned + Default>(path: &Path) -> SyncResult<T> {
    let metadata = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(T::default()),
        Err(_) => return Err("无法读取同步设置或恢复记录".into()),
    };
    if metadata.len() > (qterm_sync_core::MAX_BYTES * 4) as u64 {
        return Err("同步记录过大".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "无法读取同步记录")?;
    let record: Versioned<T> =
        serde_json::from_slice(&bytes).map_err(|_| "同步记录损坏，原文件已保留")?;
    if record.version != 1 {
        return Err("同步记录版本不兼容".into());
    }
    Ok(record.data)
}

fn write<T: Serialize>(path: &Path, data: &T) -> SyncResult<()> {
    let bytes =
        serde_json::to_vec(&Versioned { version: 1, data }).map_err(|_| "无法编码同步记录")?;
    if bytes.len() > qterm_sync_core::MAX_BYTES * 4 {
        return Err("同步记录过大".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "无法创建同步目录")?;
    }
    let mut file = AtomicWriteFile::open(path).map_err(|_| "无法保存同步记录")?;
    file.write_all(&bytes).map_err(|_| "无法写入同步记录")?;
    file.commit().map_err(|_| "无法提交同步记录".into())
}
