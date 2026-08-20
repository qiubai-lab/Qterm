use std::{fs, io, io::Write, path::PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{DataDirectory, SecuritySettings, SettingsError},
    ports::settings_repository::{DataDirectoryRepository, SettingsRepository},
};

const SETTINGS_VERSION: u64 = 2;
const DATA_DIRECTORY_VERSION: u64 = 1;
const MAX_BYTES: u64 = 64 * 1024;

pub struct JsonDataDirectoryRepository {
    path: PathBuf,
}

impl JsonDataDirectoryRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn document(&self) -> Result<Option<DataDirectoryDocument>, SettingsError> {
        read_document(&self.path, DATA_DIRECTORY_VERSION)
    }
}

impl DataDirectoryRepository for JsonDataDirectoryRepository {
    fn load(&self) -> Result<Option<DataDirectory>, SettingsError> {
        self.document()?
            .map(|document| {
                DataDirectory::from_absolute_path(PathBuf::from(document.data_directory))
            })
            .transpose()
    }

    fn save(&self, directory: &DataDirectory) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.load()?;
        }
        fs::create_dir_all(directory.path()).map_err(|_| SettingsError::StorageUnavailable)?;
        write_document(
            &self.path,
            &DataDirectoryDocument {
                schema_version: DATA_DIRECTORY_VERSION,
                data_directory: directory.path().to_string_lossy().into_owned(),
            },
        )
    }
}

pub struct JsonSettingsRepository {
    path: PathBuf,
}

impl JsonSettingsRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn document(&self) -> Result<Option<Document>, SettingsError> {
        match read_document(&self.path, SETTINGS_VERSION) {
            Err(SettingsError::UnsupportedVersion)
                if read_schema_version(&self.path)?
                    .is_some_and(|version| version < SETTINGS_VERSION) =>
            {
                fs::remove_file(&self.path).map_err(|_| SettingsError::StorageUnavailable)?;
                Ok(None)
            }
            result => result,
        }
    }
}

impl SettingsRepository for JsonSettingsRepository {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError> {
        self.document()?
            .map(|document| {
                SecuritySettings::new(
                    document.security.credential_auto_lock_after_seconds,
                    document.security.terminal_auto_lock_after_seconds,
                )
            })
            .transpose()
    }

    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.document()?;
        }
        let document = Document {
            schema_version: SETTINGS_VERSION,
            security: SecurityRecord {
                credential_auto_lock_after_seconds: settings.credential_auto_lock_after_seconds,
                terminal_auto_lock_after_seconds: settings.terminal_auto_lock_after_seconds,
            },
        };
        write_document(&self.path, &document)
    }
}

fn read_document<T: for<'de> Deserialize<'de>>(
    path: &std::path::Path,
    expected_version: u64,
) -> Result<Option<T>, SettingsError> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(SettingsError::StorageUnavailable),
    };
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err(SettingsError::Corrupt);
    }
    let bytes = fs::read(path).map_err(|_| SettingsError::StorageUnavailable)?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| SettingsError::Corrupt)?;
    if value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(expected_version)
    {
        return Err(SettingsError::UnsupportedVersion);
    }
    serde_json::from_value(value)
        .map(Some)
        .map_err(|_| SettingsError::Corrupt)
}

fn read_schema_version(path: &std::path::Path) -> Result<Option<u64>, SettingsError> {
    let bytes = fs::read(path).map_err(|_| SettingsError::StorageUnavailable)?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| SettingsError::Corrupt)?;
    Ok(value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64))
}

fn write_document<T: Serialize>(path: &std::path::Path, document: &T) -> Result<(), SettingsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
    }
    let mut bytes =
        serde_json::to_vec_pretty(document).map_err(|_| SettingsError::StorageUnavailable)?;
    bytes.push(b'\n');
    let mut file = AtomicWriteFile::open(path).map_err(|_| SettingsError::StorageUnavailable)?;
    file.write_all(&bytes)
        .map_err(|_| SettingsError::StorageUnavailable)?;
    file.commit().map_err(|_| SettingsError::StorageUnavailable)
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Document {
    schema_version: u64,
    security: SecurityRecord,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SecurityRecord {
    credential_auto_lock_after_seconds: Option<u32>,
    terminal_auto_lock_after_seconds: Option<u32>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DataDirectoryDocument {
    schema_version: u64,
    data_directory: String,
}

#[cfg(test)]
mod tests {
    use super::{JsonDataDirectoryRepository, JsonSettingsRepository};
    use crate::{
        domain::settings::{DataDirectory, SecuritySettings, SettingsError},
        ports::settings_repository::{DataDirectoryRepository, SettingsRepository},
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn missing_file_uses_defaults_and_round_trips() {
        let dir = tempdir().expect("dir");
        let repository = JsonSettingsRepository::new(dir.path().join("settings.json"));
        assert_eq!(repository.load().expect("load"), None);
        let settings = SecuritySettings::new(Some(900), Some(1800)).expect("settings");
        repository.save(settings).expect("save");
        assert_eq!(repository.load().expect("load"), Some(settings));
    }

    #[test]
    fn old_settings_schema_is_cleared_without_migration() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("settings.json");
        let bytes = br#"{"schemaVersion":1,"security":{"lockOnWindowsSessionLock":true,"autoLockAfterSeconds":3600}}"#;
        fs::write(&path, bytes).expect("fixture");
        let repository = JsonSettingsRepository::new(path.clone());
        assert_eq!(repository.load().expect("load"), None);
        assert!(!path.exists());
    }

    #[test]
    fn current_sensitive_documents_are_not_overwritten() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("settings.json");
        let bytes = br#"{"schemaVersion":2,"security":{"credentialAutoLockAfterSeconds":3600,"terminalAutoLockAfterSeconds":null,"masterPassword":"secret"}}"#;
        fs::write(&path, bytes).expect("fixture");
        let repository = JsonSettingsRepository::new(path.clone());
        assert_eq!(repository.load(), Err(SettingsError::Corrupt));
        assert_eq!(
            repository.save(SecuritySettings::default()),
            Err(SettingsError::Corrupt)
        );
        assert_eq!(fs::read(path).expect("read"), bytes);
    }

    #[test]
    fn future_settings_schema_is_preserved() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("settings.json");
        let bytes = br#"{"schemaVersion":3,"security":{}}"#;
        fs::write(&path, bytes).expect("fixture");
        let repository = JsonSettingsRepository::new(path.clone());
        assert_eq!(repository.load(), Err(SettingsError::UnsupportedVersion));
        assert_eq!(fs::read(path).expect("read"), bytes);
    }

    #[test]
    fn data_directory_is_initialized_and_round_trips() {
        let dir = tempdir().expect("dir");
        let target = dir.path().join("portable").join("qterm");
        let repository = JsonDataDirectoryRepository::new(dir.path().join("locator.json"));
        let data_directory = DataDirectory::from_absolute_path(target.clone()).expect("directory");
        repository.save(&data_directory).expect("save");
        assert!(target.is_dir());
        assert_eq!(repository.load().expect("load"), Some(data_directory));
    }

    #[test]
    fn corrupt_data_directory_locator_is_not_overwritten() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("locator.json");
        let bytes = br#"{"schemaVersion":1,"dataDirectory":"relative/path"}"#;
        fs::write(&path, bytes).expect("fixture");
        let repository = JsonDataDirectoryRepository::new(path.clone());
        assert_eq!(repository.load(), Err(SettingsError::InvalidDataDirectory));
        let target =
            DataDirectory::from_absolute_path(dir.path().join("new-root")).expect("target");
        assert_eq!(
            repository.save(&target),
            Err(SettingsError::InvalidDataDirectory)
        );
        assert_eq!(fs::read(path).expect("read"), bytes);
    }
}
