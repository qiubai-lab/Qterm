use std::{fs, io, io::Write, path::PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{DataDirectory, SecuritySettings, SettingsError},
    ports::settings_repository::{DataDirectoryRepository, SettingsRepository},
};

const VERSION: u64 = 1;
const MAX_BYTES: u64 = 64 * 1024;

pub struct JsonDataDirectoryRepository {
    path: PathBuf,
}

impl JsonDataDirectoryRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn document(&self) -> Result<Option<DataDirectoryDocument>, SettingsError> {
        read_document(&self.path)
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
                schema_version: VERSION,
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
        read_document(&self.path)
    }
}

impl SettingsRepository for JsonSettingsRepository {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError> {
        self.document()?
            .map(|document| {
                SecuritySettings::new(
                    document.security.lock_on_windows_session_lock,
                    document.security.auto_lock_after_seconds,
                )
            })
            .transpose()
    }

    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.document()?;
        }
        let document = Document {
            schema_version: VERSION,
            security: SecurityRecord {
                lock_on_windows_session_lock: settings.lock_on_windows_session_lock,
                auto_lock_after_seconds: settings.auto_lock_after_seconds,
            },
        };
        write_document(&self.path, &document)
    }
}

fn read_document<T: for<'de> Deserialize<'de>>(
    path: &std::path::Path,
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
        != Some(VERSION)
    {
        return Err(SettingsError::UnsupportedVersion);
    }
    serde_json::from_value(value)
        .map(Some)
        .map_err(|_| SettingsError::Corrupt)
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
    lock_on_windows_session_lock: bool,
    auto_lock_after_seconds: Option<u32>,
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
        let settings = SecuritySettings::new(false, Some(900)).expect("settings");
        repository.save(settings).expect("save");
        assert_eq!(repository.load().expect("load"), Some(settings));
    }

    #[test]
    fn corrupt_or_sensitive_documents_are_not_overwritten() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("settings.json");
        let bytes = br#"{"schemaVersion":1,"security":{"lockOnWindowsSessionLock":true,"autoLockAfterSeconds":3600,"masterPassword":"secret"}}"#;
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
