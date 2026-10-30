//! CEF Chrome profiles must be immediate children of root_cache_path.
use crate::domain::web_storage::BrowserIdentity;
use std::path::{Path, PathBuf};
pub(super) fn resolve(root: &Path, identity: Option<&BrowserIdentity>) -> Result<PathBuf, String> {
    let manifests = root.join("qterm-identities");
    let data = match identity {
        Some(identity) => super::profile_storage::resolve(&manifests, identity)?,
        None => super::local_storage::resolve(&manifests)?,
    };
    let name = data
        .parent()
        .and_then(Path::file_name)
        .ok_or("浏览环境标识无效")?
        .to_string_lossy();
    let directory = root.join(format!("Qterm-{name}"));
    if std::fs::symlink_metadata(&directory).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("浏览环境目录不能是链接".into());
    }
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_paths_are_direct_children_separate_from_ui_and_other_connections() {
        let root = tempfile::tempdir().unwrap();
        let a = BrowserIdentity {
            profile: "a".into(),
            route: vec![("host".into(), 22, "u".into())],
        };
        let first = resolve(root.path(), Some(&a)).unwrap();
        assert_eq!(first.parent(), Some(root.path()));
        assert_eq!(first, resolve(root.path(), Some(&a)).unwrap());
        assert_ne!(first, root.path().join("Default"));
        assert_ne!(first, resolve(root.path(), None).unwrap());
        let b = BrowserIdentity {
            profile: "b".into(),
            ..a
        };
        assert_ne!(first, resolve(root.path(), Some(&b)).unwrap());
    }
}
