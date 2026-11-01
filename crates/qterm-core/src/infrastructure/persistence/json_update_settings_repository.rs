use std::{fs, io, io::Write, path::PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{SettingsError, UpdateSettings},
    ports::settings_repository::UpdateSettingsRepository,
};

const UPDATE_SETTINGS_VERSION: u64 = 1;
const MAX_BYTES: u64 = 4 * 1024;

pub struct JsonUpdateSettingsRepository {
    path: PathBuf,
}

impl JsonUpdateSettingsRepository {
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
        if value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            != Some(UPDATE_SETTINGS_VERSION)
        {
            return Err(SettingsError::UnsupportedVersion);
        }
        serde_json::from_value(value)
            .map(Some)
            .map_err(|_| SettingsError::Corrupt)
    }
}

impl UpdateSettingsRepository for JsonUpdateSettingsRepository {
    fn load(&self) -> Result<Option<UpdateSettings>, SettingsError> {
        Ok(self.document()?.map(|document| UpdateSettings {
            auto_check_on_startup: document.auto_check_on_startup,
        }))
    }

    fn save(&self, settings: UpdateSettings) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.document()?;
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let document = Document {
            schema_version: UPDATE_SETTINGS_VERSION,
            auto_check_on_startup: settings.auto_check_on_startup,
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
    auto_check_on_startup: bool,
}

#[cfg(test)]
mod tests {
    use super::JsonUpdateSettingsRepository;
    use crate::{
        domain::settings::{SettingsError, UpdateSettings},
        ports::settings_repository::UpdateSettingsRepository,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn missing_file_uses_default_and_preference_round_trips() {
        let dir = tempdir().expect("dir");
        let repository = JsonUpdateSettingsRepository::new(dir.path().join("updates.json"));
        assert_eq!(repository.load().expect("load"), None);
        let settings = UpdateSettings {
            auto_check_on_startup: true,
        };
        repository.save(settings).expect("save");
        assert_eq!(repository.load().expect("load"), Some(settings));
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "unknown",
                br#"{"schemaVersion":1,"autoCheckOnStartup":true,"channel":"beta"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "invalid",
                br#"{"schemaVersion":1,"autoCheckOnStartup":"yes"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "future",
                br#"{"schemaVersion":2,"autoCheckOnStartup":true}"#.as_slice(),
                SettingsError::UnsupportedVersion,
            ),
        ] {
            let dir = tempdir().expect("dir");
            let path = dir.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let repository = JsonUpdateSettingsRepository::new(path.clone());
            assert_eq!(repository.load(), Err(error));
            assert_eq!(repository.save(UpdateSettings::default()), Err(error));
            assert_eq!(fs::read(path).expect("read"), bytes);
        }
    }
}
