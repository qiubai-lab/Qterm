use std::{fs, io, io::Write, path::PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{AppTheme, AppearanceSettings, SettingsError},
    ports::settings_repository::AppearanceSettingsRepository,
};

const APPEARANCE_VERSION: u64 = 1;
const MAX_BYTES: u64 = 4 * 1024;

pub struct JsonAppearanceSettingsRepository {
    path: PathBuf,
}

impl JsonAppearanceSettingsRepository {
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
            != Some(APPEARANCE_VERSION)
        {
            return Err(SettingsError::UnsupportedVersion);
        }
        serde_json::from_value(value)
            .map(Some)
            .map_err(|_| SettingsError::Corrupt)
    }
}

impl AppearanceSettingsRepository for JsonAppearanceSettingsRepository {
    fn load(&self) -> Result<Option<AppearanceSettings>, SettingsError> {
        Ok(self.document()?.map(|document| AppearanceSettings {
            theme: document.theme.into(),
        }))
    }

    fn save(&self, settings: AppearanceSettings) -> Result<(), SettingsError> {
        if self.path.exists() {
            self.document()?;
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let document = Document {
            schema_version: APPEARANCE_VERSION,
            theme: settings.theme.into(),
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
    theme: ThemeRecord,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum ThemeRecord {
    Dark,
    Light,
}

impl From<ThemeRecord> for AppTheme {
    fn from(value: ThemeRecord) -> Self {
        match value {
            ThemeRecord::Dark => Self::Dark,
            ThemeRecord::Light => Self::Light,
        }
    }
}

impl From<AppTheme> for ThemeRecord {
    fn from(value: AppTheme) -> Self {
        match value {
            AppTheme::Dark => Self::Dark,
            AppTheme::Light => Self::Light,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::JsonAppearanceSettingsRepository;
    use crate::{
        domain::settings::{AppTheme, AppearanceSettings, SettingsError},
        ports::settings_repository::AppearanceSettingsRepository,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn missing_file_uses_default_and_presets_round_trip() {
        let dir = tempdir().expect("dir");
        let repository = JsonAppearanceSettingsRepository::new(dir.path().join("appearance.json"));
        assert_eq!(repository.load().expect("load"), None);
        let light = AppearanceSettings {
            theme: AppTheme::Light,
        };
        repository.save(light).expect("save");
        assert_eq!(repository.load().expect("load"), Some(light));
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "unknown",
                br#"{"schemaVersion":1,"theme":"dark","custom":"secret"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "invalid",
                br#"{"schemaVersion":1,"theme":"system"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "future",
                br#"{"schemaVersion":2,"theme":"light"}"#.as_slice(),
                SettingsError::UnsupportedVersion,
            ),
        ] {
            let dir = tempdir().expect("dir");
            let path = dir.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let repository = JsonAppearanceSettingsRepository::new(path.clone());
            assert_eq!(repository.load(), Err(error));
            assert_eq!(repository.save(AppearanceSettings::default()), Err(error));
            assert_eq!(fs::read(path).expect("read"), bytes);
        }
    }
}
