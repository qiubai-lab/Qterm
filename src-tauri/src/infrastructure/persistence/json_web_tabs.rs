use crate::{domain::web_tabs::WebTabCache, ports::web_tab_repository::WebTabRepository};
use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::PathBuf,
};

const MAX_BYTES: u64 = 16 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    schema_version: u32,
    cache: WebTabCache,
}

pub struct JsonWebTabs {
    path: PathBuf,
}
impl JsonWebTabs {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl WebTabRepository for JsonWebTabs {
    fn load(&self) -> Result<WebTabCache, String> {
        let file = match File::open(&self.path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(WebTabCache::default());
            }
            Err(_) => return Err("无法读取标签记录".into()),
        };
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取标签记录")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("标签记录文件过大，原文件已保留".into());
        }
        let document: Document =
            serde_json::from_slice(&bytes).map_err(|_| "标签记录已损坏，原文件已保留")?;
        if document.schema_version != 1 {
            return Err("标签记录版本不受支持，原文件已保留".into());
        }
        if !valid(&document.cache) {
            return Err("标签记录内容无效，原文件已保留".into());
        }
        Ok(document.cache)
    }

    fn save(&self, cache: &WebTabCache) -> Result<(), String> {
        self.load()?; // A failed/future read must never be replaced by an empty startup snapshot.
        if !valid(cache) {
            return Err("标签记录内容无效".into());
        }
        let bytes = serde_json::to_vec(&Document {
            schema_version: 1,
            cache: cache.clone(),
        })
        .map_err(|_| "无法保存标签记录")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("标签记录存储已满".into());
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| "无法创建标签记录目录")?;
        }
        let mut file = AtomicWriteFile::open(&self.path).map_err(|_| "无法保存标签记录")?;
        file.write_all(&bytes).map_err(|_| "无法保存标签记录")?;
        file.commit().map_err(|_| "无法保存标签记录".into())
    }
}

fn valid(cache: &WebTabCache) -> bool {
    cache.valid()
        && cache
            .blocks
            .iter()
            .flat_map(|block| &block.tabs)
            .all(|tab| {
                tab.address.is_empty()
                    || tauri::Url::parse(&tab.address)
                        .is_ok_and(|url| crate::domain::web::allowed_web_url(url.as_str()))
            })
}

#[cfg(test)]
mod tests;
