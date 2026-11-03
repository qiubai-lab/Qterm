use super::transfer::TransferState;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;
#[derive(Serialize)]
pub struct DropEntry {
    path: String,
    data: Option<String>,
}
#[tauri::command]
pub async fn remote_runtime_drop(
    state: State<'_, TransferState>,
    paths: Vec<PathBuf>,
) -> Result<Vec<DropEntry>, String> {
    if !state.take_drop_paths(&paths) {
        return Err("文件拖放授权已失效，请重新拖入".into());
    }
    tokio::task::spawn_blocking(move || collect(paths))
        .await
        .map_err(|_| "无法读取拖放文件".to_string())?
}
fn collect(paths: Vec<PathBuf>) -> Result<Vec<DropEntry>, String> {
    use std::io::Read;
    let mut queue = Vec::new();
    for path in paths {
        let name = path
            .file_name()
            .and_then(|v| v.to_str())
            .ok_or("文件名无效")?
            .to_string();
        queue.push((path, name, 0));
    }
    let mut entries = Vec::new();
    let mut total = 0_u64;
    while let Some((path, relative, depth)) = queue.pop() {
        if depth > 64 || entries.len() + queue.len() >= 10000 {
            return Err("一次上传最多 10,000 项、64 层目录".into());
        }
        let meta = std::fs::symlink_metadata(&path).map_err(|_| "无法读取拖放文件")?;
        if meta.is_dir() {
            for child in std::fs::read_dir(&path).map_err(|_| "无法读取目录")? {
                let child = child.map_err(|_| "无法读取目录项")?;
                let name = child.file_name().into_string().map_err(|_| "文件名无效")?;
                if queue.len() + entries.len() >= 10000 {
                    return Err("一次上传最多 10,000 项".into());
                }
                queue.push((child.path(), format!("{relative}/{name}"), depth + 1));
            }
            entries.push(DropEntry {
                path: relative,
                data: None,
            });
        } else if meta.is_file() {
            if total + meta.len() > 128 * 1024 * 1024 {
                return Err("一次上传最多 128 MiB".into());
            }
            let mut bytes = Vec::new();
            std::fs::File::open(path)
                .map_err(|_| "无法读取文件")?
                .take(128 * 1024 * 1024 + 1 - total)
                .read_to_end(&mut bytes)
                .map_err(|_| "无法读取文件")?;
            total += bytes.len() as u64;
            if total > 128 * 1024 * 1024 {
                return Err("一次上传最多 128 MiB".into());
            }
            entries.push(DropEntry {
                path: relative,
                data: Some(STANDARD.encode(bytes)),
            });
        } else {
            return Err("不支持上传符号链接或特殊文件".into());
        }
    }
    Ok(entries)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_empty_directories_and_relative_paths() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("folder");
        std::fs::create_dir_all(folder.join("empty")).unwrap();
        std::fs::write(folder.join("file.txt"), b"hello").unwrap();
        let entries = collect(vec![folder]).unwrap();
        assert!(
            entries
                .iter()
                .any(|e| e.path == "folder/empty" && e.data.is_none())
        );
        assert!(
            entries
                .iter()
                .any(|e| e.path == "folder/file.txt" && e.data.as_deref() == Some("aGVsbG8="))
        );
    }
}
