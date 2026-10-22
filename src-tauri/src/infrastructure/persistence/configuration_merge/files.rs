use crate::domain::configuration_merge::MergeResult;
use atomic_write_file::AtomicWriteFile;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const FILES: [&str; 3] = ["connections.json", "network-forwards.json", "secrets.vault"];
pub type Snapshot = Vec<Option<Vec<u8>>>;

pub fn data_directory(root: &Path) -> MergeResult<PathBuf> {
    let root = root.canonicalize().map_err(|_| "无法读取配置目录")?;
    let data = root
        .join("data")
        .canonicalize()
        .map_err(|_| "请选择包含 data 子目录的 Qterm 配置目录")?;
    if !data.starts_with(&root) || !data.is_dir() {
        return Err("配置数据目录不能指向所选目录之外");
    }
    Ok(data)
}

pub fn snapshot(data: &Path) -> MergeResult<Snapshot> {
    let data = data.canonicalize().map_err(|_| "无法读取数据目录")?;
    FILES
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let path = data.join(name);
            match fs::symlink_metadata(&path) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err("无法读取配置文件"),
                Ok(_) => {}
            }
            let resolved = path.canonicalize().map_err(|_| "无法解析配置文件路径")?;
            if !resolved.starts_with(&data) || !resolved.is_file() {
                return Err("配置文件必须位于所选 data 目录内");
            }
            let max = if i == 2 {
                8 * 1024 * 1024
            } else {
                4 * 1024 * 1024
            };
            let mut bytes = Vec::new();
            fs::File::open(resolved)
                .map_err(|_| "无法读取配置文件")?
                .take(max + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "无法读取配置文件")?;
            if bytes.len() as u64 > max {
                return Err("配置文件超过大小上限");
            }
            Ok(Some(bytes))
        })
        .collect()
}

pub fn write(path: &Path, bytes: &[u8]) -> MergeResult<()> {
    let mut file = AtomicWriteFile::open(path).map_err(|_| "无法写入配置文件")?;
    file.write_all(bytes).map_err(|_| "无法写入配置文件")?;
    file.commit().map_err(|_| "无法提交配置文件")
}

pub fn copy_snapshot(data: &Path, values: &Snapshot) -> MergeResult<()> {
    for (name, bytes) in FILES.iter().zip(values) {
        if let Some(bytes) = bytes {
            write(&data.join(name), bytes)?;
        }
    }
    Ok(())
}

pub fn restore(data: &Path, values: &Snapshot) -> MergeResult<()> {
    for (name, bytes) in FILES.iter().zip(values) {
        let path = data.join(name);
        if let Some(bytes) = bytes {
            write(&path, bytes)?;
        } else if path.exists() {
            fs::remove_file(path).map_err(|_| "配置回滚失败，请重启恢复")?;
        }
    }
    Ok(())
}

// Journal contains encrypted vault bytes only, never passwords or plaintext material.
pub fn recover(data: &Path) -> MergeResult<()> {
    let journal = data.join(".merge-pending.json");
    if !journal.exists() {
        return Ok(());
    }
    let mut bytes = Vec::new();
    fs::File::open(&journal)
        .map_err(|_| "无法读取合并恢复记录")?
        .take(80 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取合并恢复记录")?;
    if bytes.len() > 80 * 1024 * 1024 {
        return Err("合并恢复记录超过大小上限");
    }
    let old: Snapshot = serde_json::from_slice(&bytes).map_err(|_| "合并恢复记录损坏")?;
    if old.len() != FILES.len() {
        return Err("合并恢复记录无效");
    }
    restore(data, &old)?;
    fs::remove_file(journal).map_err(|_| "无法完成合并恢复")
}

pub fn commit(data: &Path, old: &Snapshot, new: &Snapshot) -> MergeResult<()> {
    commit_with(data, old, || {
        for ((name, before), after) in FILES.iter().zip(old).zip(new) {
            if before != after
                && let Some(bytes) = after
            {
                write(&data.join(name), bytes)?;
            }
        }
        Ok(())
    })
}

pub(super) fn commit_with(
    data: &Path,
    old: &Snapshot,
    apply: impl FnOnce() -> MergeResult<()>,
) -> MergeResult<()> {
    let journal = data.join(".merge-pending.json");
    if journal.exists() {
        return Err("存在未恢复的合并，请重启 Qterm");
    }
    let bytes = serde_json::to_vec(old).map_err(|_| "无法生成合并备份")?;
    let backup = data.join(format!(".merge-backup-{}.json", uuid::Uuid::new_v4()));
    write(&backup, &bytes)?;
    write(&journal, &bytes)?;
    if let Err(error) = apply() {
        recover(data)?;
        return Err(error);
    }
    if fs::remove_file(&journal).is_err() {
        recover(data)?;
        return Err("合并提交失败，已恢复原配置");
    }
    Ok(())
}
