use crate::domain::settings::{ConfigurationDirectory, SecuritySettings, SettingsError};

pub trait ConfigurationDirectoryRepository: Send + Sync {
    fn load(&self) -> Result<Option<ConfigurationDirectory>, SettingsError>;
    fn save(&self, directory: &ConfigurationDirectory) -> Result<(), SettingsError>;
}

pub trait SettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError>;
    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError>;
}
