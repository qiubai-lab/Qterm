use std::path::{Path, PathBuf};

pub const MIN_AUTO_LOCK_SECONDS: u32 = 60;
pub const MAX_AUTO_LOCK_SECONDS: u32 = 86_400;
pub const DEFAULT_CREDENTIAL_AUTO_LOCK_SECONDS: u32 = 3_600;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AppTheme {
    #[default]
    Dark,
    Light,
    Cyberpunk,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AppearanceSettings {
    pub theme: AppTheme,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SecuritySettings {
    pub credential_auto_lock_after_seconds: Option<u32>,
    pub terminal_auto_lock_after_seconds: Option<u32>,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            credential_auto_lock_after_seconds: Some(DEFAULT_CREDENTIAL_AUTO_LOCK_SECONDS),
            terminal_auto_lock_after_seconds: None,
        }
    }
}

impl SecuritySettings {
    pub fn new(
        credential_auto_lock_after_seconds: Option<u32>,
        terminal_auto_lock_after_seconds: Option<u32>,
    ) -> Result<Self, SettingsError> {
        if [
            credential_auto_lock_after_seconds,
            terminal_auto_lock_after_seconds,
        ]
        .into_iter()
        .flatten()
        .any(|seconds| !(MIN_AUTO_LOCK_SECONDS..=MAX_AUTO_LOCK_SECONDS).contains(&seconds))
        {
            return Err(SettingsError::InvalidAutoLockDuration);
        }
        Ok(Self {
            credential_auto_lock_after_seconds,
            terminal_auto_lock_after_seconds,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConfigurationDirectory(PathBuf);

impl ConfigurationDirectory {
    pub fn default_for(home: &Path) -> Self {
        Self(home.join(".qterm"))
    }

    pub fn from_input(input: &str, home: &Path) -> Result<Self, SettingsError> {
        let input = input.trim().replace('\\', "/");
        if input.is_empty() || matches!(input.as_str(), "~" | "~/.qterm") {
            return Ok(Self::default_for(home));
        }
        let path = if let Some(suffix) = input.strip_prefix("~/") {
            home.join(suffix)
        } else {
            PathBuf::from(input)
        };
        Self::from_absolute_path(path)
    }

    pub fn from_absolute_path(path: PathBuf) -> Result<Self, SettingsError> {
        if !path.is_absolute() {
            return Err(SettingsError::InvalidConfigurationDirectory);
        }
        Ok(Self(path))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsError {
    InvalidAutoLockDuration,
    InvalidConfigurationDirectory,
    Corrupt,
    UnsupportedVersion,
    StorageUnavailable,
}

#[cfg(test)]
mod tests {
    use super::{
        AppTheme, AppearanceSettings, ConfigurationDirectory, DEFAULT_CREDENTIAL_AUTO_LOCK_SECONDS,
        MAX_AUTO_LOCK_SECONDS, MIN_AUTO_LOCK_SECONDS, SecuritySettings, SettingsError,
    };

    #[test]
    fn defaults_are_secure() {
        assert_eq!(AppearanceSettings::default().theme, AppTheme::Dark);
        assert_eq!(
            SecuritySettings::default(),
            SecuritySettings {
                credential_auto_lock_after_seconds: Some(DEFAULT_CREDENTIAL_AUTO_LOCK_SECONDS),
                terminal_auto_lock_after_seconds: None,
            }
        );
    }

    #[test]
    fn validates_timeout_range_and_allows_disabled() {
        assert!(SecuritySettings::new(None, None).is_ok());
        assert!(
            SecuritySettings::new(Some(MIN_AUTO_LOCK_SECONDS), Some(MAX_AUTO_LOCK_SECONDS)).is_ok()
        );
        assert_eq!(
            SecuritySettings::new(Some(MIN_AUTO_LOCK_SECONDS - 1), None),
            Err(SettingsError::InvalidAutoLockDuration)
        );
        assert_eq!(
            SecuritySettings::new(None, Some(MAX_AUTO_LOCK_SECONDS + 1)),
            Err(SettingsError::InvalidAutoLockDuration)
        );
    }

    #[test]
    fn configuration_directory_defaults_to_qterm_under_home() {
        let home = std::path::Path::new("/users/demo");
        let expected = home.join(".qterm");
        for input in ["", "   ", "~", "~/.qterm", "~\\.qterm"] {
            assert_eq!(
                ConfigurationDirectory::from_input(input, home)
                    .expect("configuration directory")
                    .path(),
                expected
            );
        }
    }

    #[test]
    fn configuration_directory_expands_tilde_and_rejects_relative_paths() {
        let home = std::env::temp_dir().join("qterm-core-data-home");
        assert_eq!(
            ConfigurationDirectory::from_input("~/portable/qterm", &home)
                .expect("path")
                .path(),
            home.join("portable/qterm")
        );
        assert_eq!(
            ConfigurationDirectory::from_input("relative/qterm", &home),
            Err(SettingsError::InvalidConfigurationDirectory)
        );
    }
}
