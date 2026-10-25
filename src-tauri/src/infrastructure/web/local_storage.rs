//! A separate trusted namespace leaves all existing remote manifests untouched.
use crate::domain::web_storage::BrowserProtection;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u32,
    protection: BrowserProtection,
}

pub(super) fn resolve(root: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(root).map_err(|_| "无法创建浏览环境目录")?;
    let directory = root.join("local");
    match std::fs::symlink_metadata(&directory) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("本地浏览环境目录无效".into());
            }
            let bytes = std::fs::read(directory.join("profile.json"))
                .map_err(|_| "本地浏览环境元数据损坏")?;
            let manifest: Manifest =
                serde_json::from_slice(&bytes).map_err(|_| "本地浏览环境元数据损坏")?;
            if manifest.version != 1 {
                return Err("本地浏览环境版本不受支持".into());
            }
            manifest.protection.require_available()?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let pending = tempfile::Builder::new()
                .prefix(".local-pending-")
                .tempdir_in(root)
                .map_err(|_| "无法创建本地浏览环境")?;
            let manifest = Manifest {
                version: 1,
                protection: BrowserProtection::Native,
            };
            let bytes = serde_json::to_vec(&manifest).map_err(|_| "无法保存本地浏览环境")?;
            std::fs::write(pending.path().join("profile.json"), bytes)
                .map_err(|_| "无法保存本地浏览环境")?;
            std::fs::rename(pending.path(), &directory).map_err(|_| "无法提交本地浏览环境")?;
        }
        Err(_) => return Err("无法读取本地浏览环境".into()),
    }
    Ok(directory.join("data"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::web_storage::BrowserIdentity;

    #[test]
    fn local_reopens_separately_and_remote_manifests_remain_compatible() {
        let root = tempfile::tempdir().unwrap();
        let identity = BrowserIdentity {
            profile: "remote".into(),
            route: vec![("host".into(), 22, "user".into())],
        };
        let remote = super::super::profile_storage::resolve(root.path(), &identity).unwrap();
        let before = std::fs::read(remote.parent().unwrap().join("profile.json")).unwrap();
        let local = resolve(root.path()).unwrap();
        assert_ne!(remote, local);
        assert_eq!(local, resolve(root.path()).unwrap());
        assert_eq!(
            remote,
            super::super::profile_storage::resolve(root.path(), &identity).unwrap()
        );
        assert_eq!(
            before,
            std::fs::read(remote.parent().unwrap().join("profile.json")).unwrap()
        );
        std::fs::write(
            local.parent().unwrap().join("profile.json"),
            r#"{"version":1,"protection":"masterPassword"}"#,
        )
        .unwrap();
        assert!(resolve(root.path()).unwrap_err().contains("主密码"));
    }
}
