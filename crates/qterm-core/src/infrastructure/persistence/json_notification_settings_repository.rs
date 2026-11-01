use crate::{domain::settings::SettingsError, ports::notification::NotificationSettingsRepository};
use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
};

pub struct JsonNotificationSettingsRepository {
    path: PathBuf,
    default_enabled: bool,
}
impl JsonNotificationSettingsRepository {
    pub fn new(path: PathBuf) -> Self {
        Self::with_default(path, true)
    }
    pub fn with_default(path: PathBuf, default_enabled: bool) -> Self {
        Self {
            path,
            default_enabled,
        }
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Document {
    schema_version: u64,
    enabled: bool,
}
impl NotificationSettingsRepository for JsonNotificationSettingsRepository {
    fn load(&self) -> Result<bool, SettingsError> {
        let metadata = match fs::metadata(&self.path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(self.default_enabled);
            }
            Err(_) => return Err(SettingsError::StorageUnavailable),
        };
        if !metadata.is_file() || metadata.len() > 4096 {
            return Err(SettingsError::Corrupt);
        }
        let bytes = fs::read(&self.path).map_err(|_| SettingsError::StorageUnavailable)?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| SettingsError::Corrupt)?;
        if value.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
            return Err(SettingsError::UnsupportedVersion);
        }
        let document: Document =
            serde_json::from_value(value).map_err(|_| SettingsError::Corrupt)?;
        Ok(document.enabled)
    }
    fn save(&self, enabled: bool) -> Result<(), SettingsError> {
        // Never overwrite corrupt, future or inaccessible settings.
        self.load()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let bytes = serde_json::to_vec_pretty(&Document {
            schema_version: 1,
            enabled,
        })
        .map_err(|_| SettingsError::Corrupt)?;
        let mut file =
            AtomicWriteFile::open(&self.path).map_err(|_| SettingsError::StorageUnavailable)?;
        file.write_all(&bytes)
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|_| SettingsError::StorageUnavailable)?;
        file.commit().map_err(|_| SettingsError::StorageUnavailable)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_defaults_on_and_preserves_saved_choices() {
        let dir = tempfile::tempdir().unwrap();
        let repo = JsonNotificationSettingsRepository::new(dir.path().join("notifications.json"));
        assert!(repo.load().unwrap());
        repo.save(true).unwrap();
        assert!(repo.load().unwrap());
        repo.save(false).unwrap();
        assert!(!repo.load().unwrap());
    }
    #[test]
    fn preserves_invalid_and_future_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notifications.json");
        let repo = JsonNotificationSettingsRepository::new(path.clone());
        for input in [
            "broken",
            r#"{"schemaVersion":2,"enabled":true}"#,
            r#"{"schemaVersion":1,"enabled":true,"command":"bad"}"#,
        ] {
            fs::write(&path, input).unwrap();
            assert!(repo.load().is_err());
            assert!(repo.save(false).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), input);
        }
    }
    #[test]
    fn content_preference_defaults_on_and_persists_independently() {
        let dir = tempfile::tempdir().unwrap();
        let main = JsonNotificationSettingsRepository::new(dir.path().join("notifications.json"));
        let body = JsonNotificationSettingsRepository::with_default(
            dir.path().join("notification-content.json"),
            true,
        );
        assert!(main.load().unwrap());
        assert!(body.load().unwrap());
        body.save(false).unwrap();
        assert!(!body.load().unwrap());
        assert!(main.load().unwrap());
        body.save(true).unwrap();
        main.save(false).unwrap();
        assert!(body.load().unwrap());
        assert!(!main.load().unwrap());
    }
}
