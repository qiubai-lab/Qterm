//! Stable WebKit UUIDs live beside existing profile metadata; WebKit owns site-data placement.
use std::path::Path;

pub(super) fn resolve(directory: &Path) -> Result<String, String> {
    let parent = directory.parent().ok_or("浏览环境目录无效")?;
    let path = parent.join("webkit-store.json");
    if let Ok(metadata) = std::fs::symlink_metadata(&path)
        && (!metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err("WebKit 浏览环境标识必须是普通文件".into());
    }
    match std::fs::read(&path) {
        Ok(bytes) => {
            let id: String =
                serde_json::from_slice(&bytes).map_err(|_| "WebKit 浏览环境标识损坏")?;
            uuid::Uuid::parse_str(&id).map_err(|_| "WebKit 浏览环境标识损坏")?;
            Ok(id)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            use std::io::Write;
            let id = uuid::Uuid::new_v4().to_string();
            let mut file = atomic_write_file::AtomicWriteFile::open(&path)
                .map_err(|_| "无法创建 WebKit 浏览环境")?;
            file.write_all(&serde_json::to_vec(&id).map_err(|_| "无法编码浏览环境")?)
                .map_err(|_| "无法保存 WebKit 浏览环境")?;
            file.commit().map_err(|_| "无法提交 WebKit 浏览环境")?;
            Ok(id)
        }
        Err(_) => Err("无法读取 WebKit 浏览环境".into()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_linked_identifiers_without_reading_or_overwriting_them() {
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().join("external.json");
        std::fs::write(&outside, b"external").unwrap();
        std::os::unix::fs::symlink(&outside, root.path().join("webkit-store.json")).unwrap();
        assert!(super::resolve(&root.path().join("data")).is_err());
        assert_eq!(std::fs::read(outside).unwrap(), b"external");
    }
    #[test]
    fn stores_are_stable_separate_and_corruption_fails_closed() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let a = super::resolve(&first.path().join("data")).unwrap();
        assert_eq!(a, super::resolve(&first.path().join("data")).unwrap());
        assert_ne!(a, super::resolve(&second.path().join("data")).unwrap());
        std::fs::write(first.path().join("webkit-store.json"), b"bad").unwrap();
        assert!(super::resolve(&first.path().join("data")).is_err());
        assert_eq!(
            std::fs::read(first.path().join("webkit-store.json")).unwrap(),
            b"bad"
        );
    }
}
