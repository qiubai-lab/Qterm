use std::{fs, io, io::Write, path::PathBuf, sync::Mutex};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};

use crate::{
    domain::settings::{AppTheme, AppearanceSettings, SettingsError, TerminalFontSize},
    ports::settings_repository::AppearanceSettingsRepository,
};

const APPEARANCE_VERSION: u64 = 2;
const MAX_BYTES: u64 = 4 * 1024;

pub struct JsonAppearanceSettingsRepository {
    path: PathBuf,
    writer: Mutex<()>,
}

impl JsonAppearanceSettingsRepository {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            writer: Mutex::new(()),
        }
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
            Some(1) if value.get("terminalFontSize").is_none() => {}
            Some(APPEARANCE_VERSION) if value.get("terminalFontSize").is_some() => {}
            Some(1 | APPEARANCE_VERSION) => return Err(SettingsError::Corrupt),
            _ => return Err(SettingsError::UnsupportedVersion),
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
            terminal_font_size: document.terminal_font_size,
        }))
    }

    fn save(
        &self,
        theme: AppTheme,
        terminal_font_size: Option<TerminalFontSize>,
    ) -> Result<(), SettingsError> {
        let _writer = self
            .writer
            .lock()
            .map_err(|_| SettingsError::StorageUnavailable)?;
        let current = self.load()?.unwrap_or_default();
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| SettingsError::StorageUnavailable)?;
        }
        let document = Document {
            schema_version: APPEARANCE_VERSION,
            theme: theme.into(),
            terminal_font_size: terminal_font_size.unwrap_or(current.terminal_font_size),
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
    #[serde(default)]
    terminal_font_size: TerminalFontSize,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum ThemeRecord {
    Dark,
    Light,
    Cyberpunk,
}

impl From<ThemeRecord> for AppTheme {
    fn from(value: ThemeRecord) -> Self {
        match value {
            ThemeRecord::Dark => Self::Dark,
            ThemeRecord::Light => Self::Light,
            ThemeRecord::Cyberpunk => Self::Cyberpunk,
        }
    }
}

impl From<AppTheme> for ThemeRecord {
    fn from(value: AppTheme) -> Self {
        match value {
            AppTheme::Dark => Self::Dark,
            AppTheme::Light => Self::Light,
            AppTheme::Cyberpunk => Self::Cyberpunk,
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
        for theme in [AppTheme::Light, AppTheme::Cyberpunk] {
            let settings = AppearanceSettings {
                theme,
                ..Default::default()
            };
            repository.save(theme, None).expect("save");
            assert_eq!(repository.load().expect("load"), Some(settings));
        }
    }

    #[test]
    fn upgrades_legacy_on_save_and_preserves_size_for_theme_only_clients() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("appearance.json");
        let original = r#"{"schemaVersion":1,"theme":"light"}"#;
        fs::write(&path, original).unwrap();
        let repository = JsonAppearanceSettingsRepository::new(path.clone());
        let legacy = repository.load().unwrap().unwrap();
        assert_eq!(legacy.theme, AppTheme::Light);
        assert_eq!(serde_json::json!(legacy.terminal_font_size), 13);
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        repository
            .save(AppTheme::Dark, Some(32.try_into().unwrap()))
            .unwrap();
        repository.save(AppTheme::Cyberpunk, None).unwrap();
        let saved = JsonAppearanceSettingsRepository::new(path)
            .load()
            .unwrap()
            .unwrap();
        assert_eq!(saved.theme, AppTheme::Cyberpunk);
        assert_eq!(serde_json::json!(saved.terminal_font_size), 32);
    }

    #[test]
    fn corrupt_unknown_and_future_documents_are_preserved() {
        for (name, bytes, error) in [
            (
                "out-of-range",
                br#"{"schemaVersion":2,"theme":"light","terminalFontSize":33}"#.as_slice(),
                SettingsError::Corrupt,
            ),
            (
                "missing-size",
                br#"{"schemaVersion":2,"theme":"light"}"#.as_slice(),
                SettingsError::Corrupt,
            ),
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
                br#"{"schemaVersion":3,"theme":"light"}"#.as_slice(),
                SettingsError::UnsupportedVersion,
            ),
        ] {
            let dir = tempdir().expect("dir");
            let path = dir.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let repository = JsonAppearanceSettingsRepository::new(path.clone());
            assert_eq!(repository.load(), Err(error));
            assert_eq!(repository.save(AppTheme::Dark, None), Err(error));
            assert_eq!(fs::read(path).expect("read"), bytes);
        }
    }
}
