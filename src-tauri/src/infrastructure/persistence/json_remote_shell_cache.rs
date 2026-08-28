use std::{fs, io, io::Write, path::PathBuf, sync::Mutex};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::shell_integration::{RemoteShell, RemoteShellCacheError, RemoteShellTarget},
    ports::remote_shell_cache::RemoteShellCacheRepository,
};

const CACHE_VERSION: u64 = 1;
const MAX_BYTES: u64 = 128 * 1024;
const MAX_RECORDS: usize = 1_024;

pub struct JsonRemoteShellCache {
    path: PathBuf,
    access: Mutex<()>,
}

impl JsonRemoteShellCache {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            access: Mutex::new(()),
        }
    }

    fn document(&self) -> Result<Option<Document>, RemoteShellCacheError> {
        let metadata = match fs::metadata(&self.path) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(RemoteShellCacheError::StorageUnavailable),
        };
        if !metadata.is_file() || metadata.len() > MAX_BYTES {
            return Err(RemoteShellCacheError::Corrupt);
        }
        let bytes = fs::read(&self.path).map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| RemoteShellCacheError::Corrupt)?;
        if value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            != Some(CACHE_VERSION)
        {
            return Err(RemoteShellCacheError::UnsupportedVersion);
        }
        let document: Document =
            serde_json::from_value(value).map_err(|_| RemoteShellCacheError::Corrupt)?;
        if document.records.len() > MAX_RECORDS {
            return Err(RemoteShellCacheError::Corrupt);
        }
        if document.records.iter().any(|record| {
            RemoteShell::parse_name(&record.shell)
                .is_none_or(|shell| shell.as_str() != record.shell)
        }) {
            return Err(RemoteShellCacheError::Corrupt);
        }
        let mut profile_ids = std::collections::HashSet::new();
        if document
            .records
            .iter()
            .any(|record| !profile_ids.insert(record.profile_id.as_str()))
        {
            return Err(RemoteShellCacheError::Corrupt);
        }
        Ok(Some(document))
    }

    fn write(&self, document: &Document) -> Result<(), RemoteShellCacheError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        }
        let mut bytes = serde_json::to_vec_pretty(document)
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        bytes.push(b'\n');
        let mut file = AtomicWriteFile::open(&self.path)
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        file.write_all(&bytes)
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        file.commit()
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)
    }
}

impl RemoteShellCacheRepository for JsonRemoteShellCache {
    fn load(
        &self,
        target: &RemoteShellTarget,
    ) -> Result<Option<RemoteShell>, RemoteShellCacheError> {
        let _guard = self
            .access
            .lock()
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        let Some(document) = self.document()? else {
            return Ok(None);
        };
        Ok(document
            .records
            .into_iter()
            .find(|record| record.profile_id == target.profile_id())
            .filter(|record| record.matches(target))
            .and_then(|record| RemoteShell::parse_name(&record.shell)))
    }

    fn save(
        &self,
        target: &RemoteShellTarget,
        shell: RemoteShell,
    ) -> Result<(), RemoteShellCacheError> {
        let _guard = self
            .access
            .lock()
            .map_err(|_| RemoteShellCacheError::StorageUnavailable)?;
        let mut document = if self.path.exists() {
            self.document()?.ok_or(RemoteShellCacheError::Corrupt)?
        } else {
            Document {
                schema_version: CACHE_VERSION,
                records: Vec::new(),
            }
        };
        document
            .records
            .retain(|record| record.profile_id != target.profile_id());
        document.records.push(Record::new(target, shell));
        if document.records.len() > MAX_RECORDS {
            document.records.remove(0);
        }
        self.write(&document)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Document {
    schema_version: u64,
    records: Vec<Record>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    profile_id: String,
    host: String,
    port: u16,
    username: String,
    shell: String,
}

impl Record {
    fn new(target: &RemoteShellTarget, shell: RemoteShell) -> Self {
        Self {
            profile_id: target.profile_id().to_owned(),
            host: target.host().to_owned(),
            port: target.port(),
            username: target.username().to_owned(),
            shell: shell.as_str().to_owned(),
        }
    }

    fn matches(&self, target: &RemoteShellTarget) -> bool {
        self.host == target.host()
            && self.port == target.port()
            && self.username == target.username()
    }
}

#[cfg(test)]
mod tests {
    use super::JsonRemoteShellCache;
    use crate::{
        domain::shell_integration::{RemoteShell, RemoteShellCacheError, RemoteShellTarget},
        ports::remote_shell_cache::RemoteShellCacheRepository,
    };
    use std::fs;
    use tempfile::tempdir;

    fn target(profile_id: &str, host: &str, port: u16, username: &str) -> RemoteShellTarget {
        RemoteShellTarget::new(
            profile_id.to_owned(),
            host.to_owned(),
            port,
            username.to_owned(),
        )
    }

    #[test]
    fn round_trips_only_for_a_complete_target_signature() {
        let dir = tempdir().expect("dir");
        let cache = JsonRemoteShellCache::new(dir.path().join("remote-shells.json"));
        let original = target("profile-1", "server.example", 22, "demo");
        cache.save(&original, RemoteShell::Zsh).expect("save");

        assert_eq!(cache.load(&original).expect("load"), Some(RemoteShell::Zsh));
        for changed in [
            target("profile-2", "server.example", 22, "demo"),
            target("profile-1", "other.example", 22, "demo"),
            target("profile-1", "server.example", 2222, "demo"),
            target("profile-1", "server.example", 22, "other"),
        ] {
            assert_eq!(cache.load(&changed).expect("load changed"), None);
        }
    }

    #[test]
    fn replaces_a_profile_record_without_retaining_stale_target_fields() {
        let dir = tempdir().expect("dir");
        let cache = JsonRemoteShellCache::new(dir.path().join("remote-shells.json"));
        let first = target("profile-1", "old.example", 22, "demo");
        let changed = target("profile-1", "new.example", 2222, "root");
        cache.save(&first, RemoteShell::Bash).expect("save first");
        cache
            .save(&changed, RemoteShell::Fish)
            .expect("save changed");

        assert_eq!(cache.load(&first).expect("old"), None);
        assert_eq!(cache.load(&changed).expect("new"), Some(RemoteShell::Fish));
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "unknown",
                br#"{"schemaVersion":1,"records":[],"terminalOutput":"forbidden"}"#.as_slice(),
                RemoteShellCacheError::Corrupt,
            ),
            (
                "unknown-shell",
                br#"{"schemaVersion":1,"records":[{"profileId":"p","host":"h","port":22,"username":"u","shell":"cmd"}]}"#.as_slice(),
                RemoteShellCacheError::Corrupt,
            ),
            (
                "future",
                br#"{"schemaVersion":2,"records":[]}"#.as_slice(),
                RemoteShellCacheError::UnsupportedVersion,
            ),
        ] {
            let dir = tempdir().expect("dir");
            let path = dir.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let cache = JsonRemoteShellCache::new(path.clone());
            let target = target("profile-1", "server", 22, "demo");
            assert_eq!(cache.load(&target), Err(error));
            assert_eq!(cache.save(&target, RemoteShell::Bash), Err(error));
            assert_eq!(fs::read(path).expect("read"), bytes);
        }
    }
}
