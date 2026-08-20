use crate::{
    domain::settings::{DataDirectory, SecuritySettings, SettingsError},
    ports::settings_repository::{DataDirectoryRepository, SettingsRepository},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsWarning {
    Corrupt,
    UnsupportedVersion,
    StorageUnavailable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettingsSnapshot {
    pub data_directory: DataDirectory,
    pub active_data_directory: DataDirectory,
    pub security: SecuritySettings,
    pub warning: Option<SettingsWarning>,
}

pub struct SettingsService<S, D> {
    security_repository: S,
    data_directory_repository: D,
    default_data_directory: DataDirectory,
    active_data_directory: DataDirectory,
}

impl<S: SettingsRepository, D: DataDirectoryRepository> SettingsService<S, D> {
    pub fn new(
        security_repository: S,
        data_directory_repository: D,
        default_data_directory: DataDirectory,
        active_data_directory: DataDirectory,
    ) -> Self {
        Self {
            security_repository,
            data_directory_repository,
            default_data_directory,
            active_data_directory,
        }
    }

    pub fn snapshot(&self) -> SettingsSnapshot {
        let (data_directory, directory_warning) = match self.data_directory_repository.load() {
            Ok(value) => (
                value.unwrap_or_else(|| self.default_data_directory.clone()),
                None,
            ),
            Err(error) => (
                self.default_data_directory.clone(),
                Some(warning_for(error)),
            ),
        };
        let (security, security_warning) = match self.security_repository.load() {
            Ok(value) => (value.unwrap_or_default(), None),
            Err(error) => (SecuritySettings::default(), Some(warning_for(error))),
        };
        SettingsSnapshot {
            data_directory,
            active_data_directory: self.active_data_directory.clone(),
            security,
            warning: directory_warning.or(security_warning),
        }
    }

    pub fn update_security(
        &self,
        settings: SecuritySettings,
    ) -> Result<SettingsSnapshot, SettingsError> {
        self.security_repository.save(settings)?;
        Ok(self.snapshot())
    }

    pub fn update_data_directory(
        &self,
        directory: DataDirectory,
    ) -> Result<SettingsSnapshot, SettingsError> {
        self.data_directory_repository.save(&directory)?;
        Ok(self.snapshot())
    }
}

fn warning_for(error: SettingsError) -> SettingsWarning {
    match error {
        SettingsError::Corrupt
        | SettingsError::InvalidAutoLockDuration
        | SettingsError::InvalidDataDirectory => SettingsWarning::Corrupt,
        SettingsError::UnsupportedVersion => SettingsWarning::UnsupportedVersion,
        SettingsError::StorageUnavailable => SettingsWarning::StorageUnavailable,
    }
}
