//! Native drop capabilities belong to one remote connection. Only metadata crosses IPC.
use super::upload_source::Source;
use reqwest::multipart::{Form, Part};
use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, sync::Mutex};
use tokio::io::AsyncReadExt;
use tokio_util::io::ReaderStream;

#[derive(Serialize)]
pub struct DropSelection {
    pub id: String,
    pub entries: Vec<DropEntry>,
}
#[derive(Serialize)]
pub struct DropEntry {
    pub(super) path: String,
    pub(super) size: u64,
    pub(super) token: Option<String>,
}

type Sources = HashMap<String, Source>;
#[derive(Default)]
pub struct DropUploads(Mutex<HashMap<String, Sources>>);

impl DropUploads {
    pub fn prepare(&self, paths: Vec<PathBuf>) -> Result<DropSelection, String> {
        let mut queue = Vec::new();
        for path in paths {
            let name = path
                .file_name()
                .and_then(|v| v.to_str())
                .ok_or("文件名无效")?
                .to_owned();
            queue.push((path, name, 0));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let mut sources = Sources::new();
        let mut entries = Vec::new();
        while let Some((path, relative, depth)) = queue.pop() {
            if depth > 64 || entries.len() + queue.len() >= 10000 {
                return Err("一次上传最多 10,000 项、64 层目录".into());
            }
            let meta = std::fs::symlink_metadata(&path).map_err(|_| "无法读取拖放文件")?;
            let mut token = None;
            let mut size = 0;
            if meta.is_dir() {
                for child in std::fs::read_dir(path).map_err(|_| "无法读取目录")? {
                    if entries.len() + queue.len() + 1 >= 10000 {
                        return Err("一次上传最多 10,000 项".into());
                    }
                    let child = child.map_err(|_| "无法读取目录项")?;
                    let name = child.file_name().into_string().map_err(|_| "文件名无效")?;
                    queue.push((child.path(), format!("{relative}/{name}"), depth + 1));
                }
            } else if meta.is_file() {
                let source = Source::capture(path).map_err(|_| "无法读取拖放文件")?;
                size = source.size;
                let key = format!("{id}/{}", entries.len());
                sources.insert(key.clone(), source);
                token = Some(key);
            } else {
                return Err("不支持上传符号链接或特殊文件".into());
            }
            entries.push(DropEntry {
                path: relative,
                size,
                token,
            });
        }
        let mut batches = self.0.lock().unwrap();
        if batches.len() >= 32 {
            return Err("等待上传的批次过多".into());
        }
        batches.insert(id.clone(), sources);
        Ok(DropSelection { id, entries })
    }

    pub async fn multipart(&self, token: &str) -> Result<Form, &'static str> {
        let (id, _) = token.split_once('/').ok_or("无效的拖放文件")?;
        let source = self
            .0
            .lock()
            .unwrap()
            .get_mut(id)
            .and_then(|sources| sources.remove(token))
            .ok_or("拖放文件已失效，请重新拖入")?;
        let size = source.size;
        let file = tokio::task::spawn_blocking(move || source.open())
            .await
            .map_err(|_| "无法读取文件")??;
        let file = tokio::fs::File::from_std(file);
        let stream = ReaderStream::with_capacity(file.take(size), 64 * 1024);
        let part =
            Part::stream_with_length(reqwest::Body::wrap_stream(stream), size).file_name("upload");
        Ok(Form::new().part("file", part))
    }

    pub fn release(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
}
