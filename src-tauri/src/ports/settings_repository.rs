use crate::domain::settings::{DataDirectory, SecuritySettings, SettingsError};

pub trait DataDirectoryRepository: Send + Sync {
    fn load(&self) -> Result<Option<DataDirectory>, SettingsError>;
    fn save(&self, directory: &DataDirectory) -> Result<(), SettingsError>;
}

pub trait SettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError>;
    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError>;
}
