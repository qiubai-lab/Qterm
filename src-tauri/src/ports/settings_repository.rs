use crate::domain::settings::{
    AppearanceSettings, ConfigurationDirectory, SecuritySettings, SettingsError,
};

pub trait AppearanceSettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<AppearanceSettings>, SettingsError>;
    fn save(&self, settings: AppearanceSettings) -> Result<(), SettingsError>;
}

pub trait ConfigurationDirectoryRepository: Send + Sync {
    fn load(&self) -> Result<Option<ConfigurationDirectory>, SettingsError>;
    fn save(&self, directory: &ConfigurationDirectory) -> Result<(), SettingsError>;
}

pub trait SettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError>;
    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError>;
}
