use std::path::{Path, PathBuf};

pub const DEFAULT_DATA_DIRECTORY_NAME: &str = ".qterm";
pub const MIN_AUTO_LOCK_SECONDS: u32 = 60;
pub const MAX_AUTO_LOCK_SECONDS: u32 = 86_400;
pub const DEFAULT_AUTO_LOCK_SECONDS: u32 = 3_600;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DataDirectory(PathBuf);

impl DataDirectory {
    pub fn default_for(home: &Path) -> Self {
        Self(home.join(DEFAULT_DATA_DIRECTORY_NAME))
    }

    pub fn from_input(input: &str, home: &Path) -> Result<Self, SettingsError> {
        let input = input.trim();
        let path =
            if input.is_empty() || input == "~" || input == "~/.qterm" || input == "~\\.qterm" {
                return Ok(Self::default_for(home));
            } else if let Some(relative) = input
                .strip_prefix("~/")
                .or_else(|| input.strip_prefix("~\\"))
            {
                home.join(relative)
            } else {
                PathBuf::from(input)
            };
        if !path.is_absolute() {
            return Err(SettingsError::InvalidDataDirectory);
        }
        Ok(Self(path))
    }

    pub fn from_absolute_path(path: PathBuf) -> Result<Self, SettingsError> {
        if !path.is_absolute() {
            return Err(SettingsError::InvalidDataDirectory);
        }
        Ok(Self(path))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SecuritySettings {
    pub lock_on_windows_session_lock: bool,
    pub auto_lock_after_seconds: Option<u32>,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            lock_on_windows_session_lock: true,
            auto_lock_after_seconds: Some(DEFAULT_AUTO_LOCK_SECONDS),
        }
    }
}

impl SecuritySettings {
    pub fn new(
        lock_on_windows_session_lock: bool,
        auto_lock_after_seconds: Option<u32>,
    ) -> Result<Self, SettingsError> {
        if auto_lock_after_seconds.is_some_and(|seconds| {
            !(MIN_AUTO_LOCK_SECONDS..=MAX_AUTO_LOCK_SECONDS).contains(&seconds)
        }) {
            return Err(SettingsError::InvalidAutoLockDuration);
        }
        Ok(Self {
            lock_on_windows_session_lock,
            auto_lock_after_seconds,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsError {
    InvalidAutoLockDuration,
    InvalidDataDirectory,
    Corrupt,
    UnsupportedVersion,
    StorageUnavailable,
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_AUTO_LOCK_SECONDS, DataDirectory, MAX_AUTO_LOCK_SECONDS, MIN_AUTO_LOCK_SECONDS,
        SecuritySettings, SettingsError,
    };

    #[test]
    fn defaults_are_secure() {
        assert_eq!(
            SecuritySettings::default(),
            SecuritySettings {
                lock_on_windows_session_lock: true,
                auto_lock_after_seconds: Some(DEFAULT_AUTO_LOCK_SECONDS),
            }
        );
    }

    #[test]
    fn validates_timeout_range_and_allows_disabled() {
        assert!(SecuritySettings::new(true, None).is_ok());
        assert!(SecuritySettings::new(true, Some(MIN_AUTO_LOCK_SECONDS)).is_ok());
        assert!(SecuritySettings::new(true, Some(MAX_AUTO_LOCK_SECONDS)).is_ok());
        assert_eq!(
            SecuritySettings::new(true, Some(MIN_AUTO_LOCK_SECONDS - 1)),
            Err(SettingsError::InvalidAutoLockDuration)
        );
    }

    #[test]
    fn data_directory_defaults_empty_and_tilde_to_the_users_qterm_directory() {
        let home = std::path::Path::new("/users/demo");
        let expected = home.join(".qterm");
        for input in ["", "   ", "~", "~/.qterm", "~\\.qterm"] {
            assert_eq!(
                DataDirectory::from_input(input, home).expect("path").path(),
                expected
            );
        }
    }

    #[test]
    fn data_directory_expands_tilde_and_rejects_relative_paths() {
        let home = std::env::temp_dir().join("qterm-domain-home");
        assert_eq!(
            DataDirectory::from_input("~/portable/qterm", &home)
                .expect("path")
                .path(),
            home.join("portable/qterm")
        );
        assert_eq!(
            DataDirectory::from_input("relative/qterm", &home),
            Err(SettingsError::InvalidDataDirectory)
        );
    }
}
