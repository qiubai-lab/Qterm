use crate::{
    domain::settings::{
        AppearanceSettings, ConfigurationDirectory, SecuritySettings, SettingsError,
    },
    ports::settings_repository::{
        AppearanceSettingsRepository, ConfigurationDirectoryRepository, SettingsRepository,
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsWarning {
    Corrupt,
    UnsupportedVersion,
    StorageUnavailable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettingsSnapshot {
    pub configuration_directory: ConfigurationDirectory,
    pub active_configuration_directory: ConfigurationDirectory,
    pub security: SecuritySettings,
    pub appearance: AppearanceSettings,
    pub warning: Option<SettingsWarning>,
}

pub struct SettingsService<S, D, A> {
    security_repository: S,
    configuration_repository: D,
    default_configuration_directory: ConfigurationDirectory,
    active_configuration_directory: ConfigurationDirectory,
    appearance_repository: A,
}

impl<S: SettingsRepository, D: ConfigurationDirectoryRepository, A: AppearanceSettingsRepository>
    SettingsService<S, D, A>
{
    pub fn new(
        security_repository: S,
        configuration_repository: D,
        default_configuration_directory: ConfigurationDirectory,
        active_configuration_directory: ConfigurationDirectory,
        appearance_repository: A,
    ) -> Self {
        Self {
            security_repository,
            configuration_repository,
            default_configuration_directory,
            active_configuration_directory,
            appearance_repository,
        }
    }

    pub fn snapshot(&self) -> SettingsSnapshot {
        let (security, security_warning) = match self.security_repository.load() {
            Ok(value) => (value.unwrap_or_default(), None),
            Err(error) => (SecuritySettings::default(), Some(warning_for(error))),
        };
        let (configuration_directory, configuration_warning) =
            match self.configuration_repository.load() {
                Ok(value) => (
                    value.unwrap_or_else(|| self.default_configuration_directory.clone()),
                    None,
                ),
                Err(error) => (
                    self.default_configuration_directory.clone(),
                    Some(warning_for(error)),
                ),
            };
        let (appearance, appearance_warning) = match self.appearance_repository.load() {
            Ok(value) => (value.unwrap_or_default(), None),
            Err(error) => (AppearanceSettings::default(), Some(warning_for(error))),
        };
        SettingsSnapshot {
            configuration_directory,
            active_configuration_directory: self.active_configuration_directory.clone(),
            security,
            appearance,
            warning: configuration_warning
                .or(security_warning)
                .or(appearance_warning),
        }
    }

    pub fn update_security(
        &self,
        settings: SecuritySettings,
    ) -> Result<SettingsSnapshot, SettingsError> {
        self.security_repository.save(settings)?;
        Ok(self.snapshot())
    }

    pub fn update_configuration_directory(
        &self,
        directory: ConfigurationDirectory,
    ) -> Result<SettingsSnapshot, SettingsError> {
        self.configuration_repository.save(&directory)?;
        Ok(self.snapshot())
    }

    pub fn update_appearance(
        &self,
        settings: AppearanceSettings,
    ) -> Result<SettingsSnapshot, SettingsError> {
        self.appearance_repository.save(settings)?;
        Ok(self.snapshot())
    }
}

fn warning_for(error: SettingsError) -> SettingsWarning {
    match error {
        SettingsError::Corrupt
        | SettingsError::InvalidAutoLockDuration
        | SettingsError::InvalidConfigurationDirectory => SettingsWarning::Corrupt,
        SettingsError::UnsupportedVersion => SettingsWarning::UnsupportedVersion,
        SettingsError::StorageUnavailable => SettingsWarning::StorageUnavailable,
    }
}
