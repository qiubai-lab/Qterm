use crate::domain::settings::{
    AppearanceSettings, ConfigurationDirectory, SecuritySettings, SettingsError, TerminalSettings,
    UpdateSettings,
};

pub trait AppearanceSettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<AppearanceSettings>, SettingsError>;
    fn save(&self, settings: AppearanceSettings) -> Result<(), SettingsError>;
}

pub trait UpdateSettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<UpdateSettings>, SettingsError>;
    fn save(&self, settings: UpdateSettings) -> Result<(), SettingsError>;
}

pub trait TerminalSettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<TerminalSettings>, SettingsError>;
    fn save(&self, settings: TerminalSettings) -> Result<(), SettingsError>;
}

pub trait ConfigurationDirectoryRepository: Send + Sync {
    fn load(&self) -> Result<Option<ConfigurationDirectory>, SettingsError>;
    fn save(&self, directory: &ConfigurationDirectory) -> Result<(), SettingsError>;
}

pub trait SettingsRepository: Send + Sync {
    fn load(&self) -> Result<Option<SecuritySettings>, SettingsError>;
    fn save(&self, settings: SecuritySettings) -> Result<(), SettingsError>;
}
