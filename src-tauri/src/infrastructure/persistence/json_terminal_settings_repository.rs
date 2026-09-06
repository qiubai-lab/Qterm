use std::{fs, io, io::Write, path::PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{SettingsError, TerminalSettings},
    ports::settings_repository::TerminalSettingsRepository,
};

const TERMINAL_SETTINGS_VERSION: u64 = 2;
const MAX_BYTES: u64 = 4 * 1024;

pub struct JsonTerminalSettingsRepository {
    path: PathBuf,
}

impl JsonTerminalSettingsRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn document(&self) -> Result<Option<Document>, SettingsError> {
        let metadata = match fs::metadata(&self.path) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(SettingsError::StorageUnavailable),
        };
        if !metadata.is_file() || metadata.len() > MAX_BYTES {
            return Err(SettingsError::Corrupt);
        }
        let bytes = fs::read(&self.path).map_err(|_| SettingsError::StorageUnavailable)?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| SettingsError::Corrupt)?;
        match value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
        {
            Some(1) => serde_json::from_value::<VersionOneDocument>(value)
                .map(|legacy| {
                    Some(Document {
                        schema_version: TERMINAL_SETTINGS_VERSION,
                        remote_shell_integration_enabled: legacy.remote_shell_integration_enabled,
                        remote_shell_integration_passive: true,
                    })
                })
                .map_err(|_| SettingsError::Corrupt),
            Some(TERMINAL_SETTINGS_VERSION) => serde_json::from_value(value)
                .map(Some)
                .map_err(|_| SettingsError::Corrupt),
            _ => Err(SettingsError::UnsupportedVersion),
        }
    }
}

impl TerminalSettingsRepository for JsonTerminalSettingsRepository {
    fn load(&self) -> Result<Option<TerminalSettings>, SettingsError> {
        Ok(self.document()?.map(|document| TerminalSettings {
            remote_shell_integration_enabled: document.remote_shell_integration_enabled,
            remote_shell_integration_passive: document.remote_shell_integration_passive,
        }))
    }

    fn save(&self, settings: TerminalSettings) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.document()?;
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let document = Document {
            schema_version: TERMINAL_SETTINGS_VERSION,
            remote_shell_integration_enabled: settings.remote_shell_integration_enabled,
            remote_shell_integration_passive: settings.remote_shell_integration_passive,
        };
        let mut bytes =
            serde_json::to_vec_pretty(&document).map_err(|_| SettingsError::StorageUnavailable)?;
        bytes.push(b'\n');
        let mut file =
            AtomicWriteFile::open(&self.path).map_err(|_| SettingsError::StorageUnavailable)?;
        file.write_all(&bytes)
            .map_err(|_| SettingsError::StorageUnavailable)?;
        file.commit().map_err(|_| SettingsError::StorageUnavailable)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Document {
    schema_version: u64,
    remote_shell_integration_enabled: bool,
    remote_shell_integration_passive: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct VersionOneDocument {
    #[serde(rename = "schemaVersion")]
    _schema_version: u64,
    remote_shell_integration_enabled: bool,
    #[serde(default, rename = "remoteShellIntegrationPassive")]
    _remote_shell_integration_passive: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::JsonTerminalSettingsRepository;
    use crate::{
        domain::settings::{SettingsError, TerminalSettings},
        ports::settings_repository::TerminalSettingsRepository,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn missing_file_uses_default_and_preference_round_trips() {
        let dir = tempdir().expect("dir");
        let repository = JsonTerminalSettingsRepository::new(dir.path().join("terminal.json"));
        assert_eq!(repository.load().expect("load"), None);
        let settings = TerminalSettings {
            remote_shell_integration_enabled: false,
            remote_shell_integration_passive: true,
        };
        repository.save(settings).expect("save");
        assert_eq!(repository.load().expect("load"), Some(settings));
    }

    #[test]
    fn version_one_settings_migrate_to_passive_and_version_two_preserves_explicit_automatic_mode() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("terminal.json");
        fs::write(
            &path,
            br#"{"schemaVersion":1,"remoteShellIntegrationEnabled":true,"remoteShellIntegrationPassive":false}"#,
        )
        .unwrap();
        let repository = JsonTerminalSettingsRepository::new(path.clone());
        let settings = repository.load().unwrap().unwrap();
        assert!(settings.remote_shell_integration_enabled);
        assert!(settings.remote_shell_integration_passive);
        assert!(!settings.automatic_shell_integration());
        repository.save(settings).unwrap();
        let saved: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["schemaVersion"], 2);

        let automatic = TerminalSettings {
            remote_shell_integration_enabled: true,
            remote_shell_integration_passive: false,
        };
        repository.save(automatic).unwrap();
        assert_eq!(repository.load().unwrap(), Some(automatic));
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "unknown",
                br#"{"schemaVersion":2,"remoteShellIntegrationEnabled":true,"remoteShellIntegrationPassive":true,"command":"forbidden"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "invalid",
                br#"{"schemaVersion":2,"remoteShellIntegrationEnabled":"yes","remoteShellIntegrationPassive":true}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "missing",
                br#"{"schemaVersion":2,"remoteShellIntegrationEnabled":true}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "future",
                br#"{"schemaVersion":3,"remoteShellIntegrationEnabled":true,"remoteShellIntegrationPassive":true}"#.as_slice(),
                SettingsError::UnsupportedVersion,
            ),
        ] {
            let dir = tempdir().expect("dir");
            let path = dir.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let repository = JsonTerminalSettingsRepository::new(path.clone());
            assert_eq!(repository.load(), Err(error));
            assert_eq!(repository.save(TerminalSettings::default()), Err(error));
            assert_eq!(fs::read(path).expect("read"), bytes);
        }
    }
}
