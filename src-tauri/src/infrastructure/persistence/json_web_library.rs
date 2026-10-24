use crate::{domain::web_library::WebLibrary, ports::web_library_repository::WebLibraryRepository};
use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{Read, Write},
    path::PathBuf,
};

const MAX_BYTES: u64 = 16 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    schema_version: u32,
    library: WebLibrary,
}

pub struct JsonWebLibrary {
    path: PathBuf,
}
impl JsonWebLibrary {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl WebLibraryRepository for JsonWebLibrary {
    fn load(&self) -> Result<WebLibrary, String> {
        let file = match File::open(&self.path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(WebLibrary::default()),
            Err(_) => return Err("无法读取浏览记录".into()),
        };
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取浏览记录")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("浏览记录文件过大".into());
        }
        let document: Document =
            serde_json::from_slice(&bytes).map_err(|_| "浏览记录文件已损坏，原文件已保留")?;
        if document.schema_version != 1 {
            return Err("浏览记录文件版本不受支持，原文件已保留".into());
        }
        if !document.library.valid()
            || document
                .library
                .history
                .iter()
                .chain(&document.library.bookmarks)
                .any(|entry| tauri::Url::parse(&entry.url).is_err())
        {
            return Err("浏览记录内容无效，原文件已保留".into());
        }
        Ok(document.library)
    }

    fn save(&self, library: &WebLibrary) -> Result<(), String> {
        self.load()?;
        if !library.valid() {
            return Err("浏览记录内容无效".into());
        }
        let bytes = serde_json::to_vec(&Document {
            schema_version: 1,
            library: library.clone(),
        })
        .map_err(|_| "无法保存浏览记录")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("浏览记录存储已满，请清理历史或收藏".into());
        }
        let mut file = AtomicWriteFile::open(&self.path).map_err(|_| "无法保存浏览记录")?;
        file.write_all(&bytes).map_err(|_| "无法保存浏览记录")?;
        file.commit().map_err(|_| "无法保存浏览记录".into())
    }
}

#[cfg(test)]
mod tests;
