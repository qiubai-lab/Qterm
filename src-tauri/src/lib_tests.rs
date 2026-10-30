use super::{
    BuildMode, ConfigurationStoragePaths, DataPaths, persisted_window_state_flags,
    resolve_active_configuration,
};
use crate::{
    domain::settings::{ConfigurationDirectory, SettingsError},
    infrastructure::persistence::json_settings_repository::JsonConfigurationDirectoryRepository,
    ports::settings_repository::ConfigurationDirectoryRepository,
};
use std::fs;
use tauri_plugin_window_state::StateFlags;
use tempfile::tempdir;

struct FailingConfigurationRepository(SettingsError);

impl ConfigurationDirectoryRepository for FailingConfigurationRepository {
    fn load(&self) -> Result<Option<ConfigurationDirectory>, SettingsError> {
        Err(self.0)
    }

    fn save(&self, _directory: &ConfigurationDirectory) -> Result<(), SettingsError> {
        Err(self.0)
    }
}

#[test]
fn configuration_storage_paths_are_isolated_by_build_mode() {
    let home = std::path::Path::new("/users/demo");

    let development = ConfigurationStoragePaths::for_mode(home, BuildMode::Development);
    let production = ConfigurationStoragePaths::for_mode(home, BuildMode::Production);

    assert_eq!(development.location, home.join(".qterm-location.dev.json"));
    assert_eq!(development.default_root, home.join(".qterm-dev"));
    assert_eq!(production.location, home.join(".qterm-location.json"));
    assert_eq!(production.default_root, home.join(".qterm"));
}

#[test]
fn current_build_mode_matches_debug_assertions() {
    let expected = if cfg!(debug_assertions) {
        BuildMode::Development
    } else {
        BuildMode::Production
    };

    assert_eq!(BuildMode::current(), expected);
}

#[test]
fn configuration_storage_development_ignores_production_locator() {
    let home = tempdir().expect("home");
    let development = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Development);
    let production = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Production);
    let production_root =
        ConfigurationDirectory::from_absolute_path(home.path().join("production-custom"))
            .expect("production root");
    JsonConfigurationDirectoryRepository::new(production.location.clone())
        .save(&production_root)
        .expect("production locator");
    let development_default =
        ConfigurationDirectory::from_absolute_path(development.default_root.clone())
            .expect("development default");

    let active = resolve_active_configuration(
        &JsonConfigurationDirectoryRepository::new(development.location.clone()),
        &development_default,
    );

    assert_eq!(active, development_default);
    assert!(!development.location.exists());
    assert!(production.location.is_file());
}

#[test]
fn configuration_storage_corrupt_development_locator_preserves_both_files() {
    let home = tempdir().expect("home");
    let development = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Development);
    let production = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Production);
    let development_bytes = br#"{"schemaVersion":2,"configurationDirectory":"future"}"#;
    let production_bytes = br#"{"schemaVersion":1,"configurationDirectory":"/production"}"#;
    fs::write(&development.location, development_bytes).expect("development fixture");
    fs::write(&production.location, production_bytes).expect("production fixture");
    let development_default =
        ConfigurationDirectory::from_absolute_path(development.default_root.clone())
            .expect("development default");

    let active = resolve_active_configuration(
        &JsonConfigurationDirectoryRepository::new(development.location.clone()),
        &development_default,
    );

    assert_eq!(active, development_default);
    assert_eq!(
        fs::read(development.location).expect("development bytes"),
        development_bytes
    );
    assert_eq!(
        fs::read(production.location).expect("production bytes"),
        production_bytes
    );
}

#[test]
fn configuration_storage_repository_errors_fall_back_to_the_owned_default() {
    let home = tempdir().expect("home");
    let development = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Development);
    let development_default = ConfigurationDirectory::from_absolute_path(development.default_root)
        .expect("development default");

    for error in [
        SettingsError::Corrupt,
        SettingsError::UnsupportedVersion,
        SettingsError::StorageUnavailable,
    ] {
        assert_eq!(
            resolve_active_configuration(
                &FailingConfigurationRepository(error),
                &development_default,
            ),
            development_default
        );
    }
}

#[test]
fn configuration_storage_production_ignores_development_locator() {
    let home = tempdir().expect("home");
    let development = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Development);
    let production = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Production);
    let development_root =
        ConfigurationDirectory::from_absolute_path(home.path().join("development-custom"))
            .expect("development root");
    JsonConfigurationDirectoryRepository::new(development.location.clone())
        .save(&development_root)
        .expect("development locator");
    let production_default =
        ConfigurationDirectory::from_absolute_path(production.default_root.clone())
            .expect("production default");

    let active = resolve_active_configuration(
        &JsonConfigurationDirectoryRepository::new(production.location.clone()),
        &production_default,
    );

    assert_eq!(active, production_default);
    assert!(!production.location.exists());
    assert!(development.location.is_file());
}

#[test]
fn configuration_storage_saves_only_the_owned_locator_and_target() {
    let home = tempdir().expect("home");
    let development = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Development);
    let production = ConfigurationStoragePaths::for_mode(home.path(), BuildMode::Production);
    let development_root =
        ConfigurationDirectory::from_absolute_path(home.path().join("development-custom"))
            .expect("development root");
    let production_root =
        ConfigurationDirectory::from_absolute_path(home.path().join("production-custom"))
            .expect("production root");
    let development_repository =
        JsonConfigurationDirectoryRepository::new(development.location.clone());
    let production_repository =
        JsonConfigurationDirectoryRepository::new(production.location.clone());

    development_repository
        .save(&development_root)
        .expect("save development root");
    let development_locator_bytes =
        fs::read(&development.location).expect("development locator bytes");
    assert!(!production.location.exists());
    for partition in ["data", "device", "cache"] {
        assert!(development_root.path().join(partition).is_dir());
        assert!(!production_root.path().join(partition).exists());
    }

    production_repository
        .save(&production_root)
        .expect("save production root");
    assert_eq!(
        fs::read(&development.location).expect("unchanged development locator"),
        development_locator_bytes
    );
    assert!(production.location.is_file());
    for partition in ["data", "device", "cache"] {
        assert!(production_root.path().join(partition).is_dir());
    }
}

#[test]
fn data_paths_are_partitioned_under_the_users_qterm_root() {
    let home = std::path::Path::new("user-home");
    let paths = DataPaths::from_root(home.join(".qterm"));
    let root = home.join(".qterm");
    let data = root.join("data");
    let device = root.join("device");
    let cache = root.join("cache");

    assert_eq!(paths.root, root);
    assert_eq!(paths.data, data);
    assert_eq!(paths.device, device);
    assert_eq!(paths.cache, cache);
    assert_eq!(paths.profiles, data.join("connections.json"));
    assert_eq!(paths.credentials, data.join("secrets.vault"));
    assert_eq!(paths.network, data.join("network-forwards.json"));
    assert_eq!(paths.known_hosts, device.join("known-hosts.json"));
    assert_eq!(paths.workspaces, device.join("workspaces.json"));
    assert_eq!(paths.settings, device.join("settings.json"));
    assert_eq!(paths.appearance, device.join("appearance.json"));
    assert_eq!(paths.terminal, device.join("terminal.json"));
    assert_eq!(paths.remote_shells, cache.join("remote-shells.json"));
    assert_eq!(paths.browser_profiles, cache.join("browser-profiles"));
}

#[test]
fn initializes_partition_directories_without_touching_legacy_root_files() {
    let home = tempdir().expect("home");
    let legacy = home.path().join(".qterm").join("connections.json");
    fs::create_dir_all(legacy.parent().expect("legacy parent")).expect("legacy root");
    fs::write(&legacy, b"legacy-bytes").expect("legacy fixture");
    let paths = DataPaths::from_root(home.path().join(".qterm"));

    paths.initialize().expect("initialize partitions");

    assert!(paths.data.is_dir());
    assert!(paths.device.is_dir());
    assert!(paths.cache.is_dir());
    assert_eq!(
        fs::read(legacy).expect("unchanged legacy file"),
        b"legacy-bytes"
    );
    assert!(
        !paths.profiles.exists(),
        "legacy profiles must not be copied"
    );
}

#[test]
fn custom_configuration_directory_moves_all_qterm_partitions_together() {
    let custom = std::path::Path::new("custom-qterm");
    let paths = DataPaths::from_root(custom.to_path_buf());

    assert_eq!(paths.root, custom);
    assert_eq!(paths.data, custom.join("data"));
    assert_eq!(paths.profiles, custom.join("data/connections.json"));
    assert_eq!(paths.credentials, custom.join("data/secrets.vault"));
    assert_eq!(paths.network, custom.join("data/network-forwards.json"));
    assert_eq!(paths.device, custom.join("device"));
    assert_eq!(paths.known_hosts, custom.join("device/known-hosts.json"));
    assert_eq!(paths.settings, custom.join("device/settings.json"));
    assert_eq!(paths.appearance, custom.join("device/appearance.json"));
    assert_eq!(paths.terminal, custom.join("device/terminal.json"));
    assert_eq!(paths.cache, custom.join("cache"));
    assert_eq!(paths.remote_shells, custom.join("cache/remote-shells.json"));
}

#[test]
fn window_state_persists_only_size_and_maximized_state() {
    let flags = persisted_window_state_flags();

    assert!(flags.contains(StateFlags::SIZE));
    assert!(flags.contains(StateFlags::MAXIMIZED));
    assert!(!flags.intersects(
        StateFlags::POSITION
            | StateFlags::VISIBLE
            | StateFlags::DECORATIONS
            | StateFlags::FULLSCREEN
    ));
}
