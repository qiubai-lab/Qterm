//! Stable additive directories; browser credentials never pass through app serialization.
use crate::domain::web_storage::{BrowserIdentity, BrowserProtection};
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize)]
struct Manifest {
    version: u32,
    identity: BrowserIdentity,
    protection: BrowserProtection,
}

pub(super) fn resolve(root: &Path, identity: &BrowserIdentity) -> Result<PathBuf, String> {
    std::fs::create_dir_all(root).map_err(|_| "无法创建浏览环境目录")?;
    for entry in std::fs::read_dir(root).map_err(|_| "无法读取浏览环境")? {
        let entry = entry.map_err(|_| "无法读取浏览环境")?;
        if uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err() {
            continue;
        }
        if entry
            .file_type()
            .map_err(|_| "无法读取浏览环境")?
            .is_symlink()
        {
            return Err("浏览环境目录不能是链接".into());
        }
        let manifest: Manifest = serde_json::from_slice(
            &std::fs::read(entry.path().join("profile.json")).map_err(|_| "浏览环境元数据损坏")?,
        )
        .map_err(|_| "浏览环境元数据损坏")?;
        if manifest.identity == *identity {
            if manifest.version != 1 {
                return Err("浏览环境版本不受支持".into());
            }
            manifest.protection.require_available()?;
            return Ok(entry.path().join("data"));
        }
    }
    let pending = tempfile::Builder::new()
        .prefix(".pending-")
        .tempdir_in(root)
        .map_err(|_| "无法创建浏览环境")?;
    let directory = root.join(uuid::Uuid::new_v4().to_string());
    let manifest = Manifest {
        version: 1,
        identity: identity.clone(),
        protection: BrowserProtection::Native,
    };
    let data = serde_json::to_vec(&manifest).map_err(|_| "无法保存浏览环境")?;
    std::fs::write(pending.path().join("profile.json"), data).map_err(|_| "无法保存浏览环境")?;
    std::fs::rename(pending.path(), &directory).map_err(|_| "无法提交浏览环境")?;
    Ok(directory.join("data"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reopens_by_connection_and_route_without_sharing_changed_accounts_or_targets() {
        let root = tempfile::tempdir().unwrap();
        let mut identity = BrowserIdentity {
            profile: "../../a".into(),
            route: vec![("host".into(), 22, "user".into())],
        };
        let first = resolve(root.path(), &identity).unwrap();
        assert!(first.starts_with(root.path()));
        assert_eq!(first, resolve(root.path(), &identity).unwrap());
        identity.profile = "b".into();
        assert_ne!(first, resolve(root.path(), &identity).unwrap());
        identity.profile = "../../a".into();
        identity.route[0].2 = "other".into();
        assert_ne!(first, resolve(root.path(), &identity).unwrap());
        identity.route[0].0 = "elsewhere".into();
        assert_ne!(first, resolve(root.path(), &identity).unwrap());
    }

    #[test]
    fn stored_protected_profiles_cannot_silently_downgrade() {
        let root = tempfile::tempdir().unwrap();
        let identity = BrowserIdentity {
            profile: "a".into(),
            route: vec![("host".into(), 22, "user".into())],
        };
        let directory = resolve(root.path(), &identity).unwrap();
        let manifest = Manifest {
            version: 1,
            identity: identity.clone(),
            protection: BrowserProtection::MasterPassword,
        };
        std::fs::write(
            directory.parent().unwrap().join("profile.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        assert!(
            resolve(root.path(), &identity)
                .unwrap_err()
                .contains("主密码")
        );
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
}
