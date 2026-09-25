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
        if !matches!(
            value
                .get("schemaVersion")
                .and_then(serde_json::Value::as_u64),
            Some(1 | TERMINAL_SETTINGS_VERSION)
        ) {
            return Err(SettingsError::UnsupportedVersion);
        }
        serde_json::from_value(value)
            .map(Some)
            .map_err(|_| SettingsError::Corrupt)
    }
}

impl TerminalSettingsRepository for JsonTerminalSettingsRepository {
    fn load(&self) -> Result<Option<TerminalSettings>, SettingsError> {
        Ok(self.document()?.map(|document| TerminalSettings {
            remote_shell_integration_enabled: document.remote_shell_integration_enabled,
            history_free_bash_enabled: document.history_free_bash_enabled,
        }))
    }

    fn save(&self, settings: TerminalSettings) -> Result<(), SettingsError> {
        let previous = self.document()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let document = Document {
            schema_version: TERMINAL_SETTINGS_VERSION,
            remote_shell_integration_enabled: settings.remote_shell_integration_enabled,
            history_free_bash_enabled: settings.history_free_bash_enabled,
            remote_shell_integration_passive: previous
                .and_then(|document| document.remote_shell_integration_passive),
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
    #[serde(default)]
    history_free_bash_enabled: bool,
    // A prior v2 writer stored this preference. Preserve it across updates even
    // though the current shell integration does not consume passive mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    remote_shell_integration_passive: Option<bool>,
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
            history_free_bash_enabled: true,
        };
        repository.save(settings).expect("save");
        assert_eq!(repository.load().expect("load"), Some(settings));
    }

    #[test]
    fn legacy_documents_default_to_normal_sessions_without_rewriting() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("terminal.json");
        let original = br#"{"schemaVersion":1,"remoteShellIntegrationEnabled":false}"#;
        fs::write(&path, original).unwrap();
        let repository = JsonTerminalSettingsRepository::new(path.clone());
        let settings = repository.load().unwrap().unwrap();
        assert!(!settings.history_free_bash_enabled);
        assert!(!settings.remote_shell_integration_enabled);
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn legacy_versions_can_enable_history_free_without_losing_preferences() {
        for original in [
            r#"{"schemaVersion":1,"remoteShellIntegrationEnabled":false}"#,
            r#"{"schemaVersion":2,"remoteShellIntegrationEnabled":true,"remoteShellIntegrationPassive":true}"#,
            r#"{"schemaVersion":2,"remoteShellIntegrationEnabled":false,"remoteShellIntegrationPassive":false}"#,
        ] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("terminal.json");
            fs::write(&path, original).unwrap();
            let repository = JsonTerminalSettingsRepository::new(path.clone());
            let mut settings = repository.load().unwrap().unwrap();
            assert!(!settings.history_free_bash_enabled);
            assert_eq!(fs::read_to_string(&path).unwrap(), original);
            let legacy: serde_json::Value = serde_json::from_str(original).unwrap();
            for enabled in [true, false] {
                settings.history_free_bash_enabled = enabled;
                repository.save(settings).unwrap();
                assert_eq!(repository.load().unwrap(), Some(settings));
                let saved: serde_json::Value =
                    serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
                assert_eq!(saved["schemaVersion"], 2);
                assert_eq!(saved["historyFreeBashEnabled"], enabled);
                assert_eq!(
                    saved["remoteShellIntegrationEnabled"],
                    legacy["remoteShellIntegrationEnabled"]
                );
                assert_eq!(
                    saved["remoteShellIntegrationPassive"],
                    legacy["remoteShellIntegrationPassive"]
                );
            }
        }
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "unknown",
                br#"{"schemaVersion":1,"remoteShellIntegrationEnabled":true,"command":"forbidden"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "invalid",
                br#"{"schemaVersion":1,"remoteShellIntegrationEnabled":"yes"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "future",
                br#"{"schemaVersion":3,"remoteShellIntegrationEnabled":true}"#.as_slice(),
                SettingsError::UnsupportedVersion,
            ),
            (
                "invalid-passive",
                br#"{"schemaVersion":2,"remoteShellIntegrationEnabled":true,"remoteShellIntegrationPassive":"yes"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "unknown-v2",
                br#"{"schemaVersion":2,"remoteShellIntegrationEnabled":true,"command":"forbidden"}"#.as_slice(),
                SettingsError::Corrupt,
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
