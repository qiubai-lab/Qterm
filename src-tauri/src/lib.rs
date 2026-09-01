mod application;
mod commands;
mod domain;
mod infrastructure;
mod ports;

use commands::browser::{BrowserProxyState, browser_proxy_launch, browser_proxy_list};
use commands::clipboard::{
    ClipboardState, local_terminal_prepare_clipboard_paste, session_cancel_clipboard_staging,
    session_start_clipboard_staging,
};
use commands::credential::{
    CredentialState, credential_cancel_private_key, credential_commit_private_key,
    credential_create_password, credential_delete, credential_list,
    credential_prepare_generated_private_key, credential_prepare_private_key,
    credential_prepare_private_key_path, credential_public_key, credential_rename,
    credential_reveal_password, credential_vault_cancel_master_password_reset,
    credential_vault_change_master_password, credential_vault_clear, credential_vault_initialize,
    credential_vault_lock, credential_vault_prepare_master_password_reset,
    credential_vault_reset_master_password, credential_vault_status, credential_vault_unlock,
};
use commands::files::{
    files_copy_entry, files_create_entry, files_delete_entry, files_list_local,
    files_list_local_roots, files_list_remote, files_read_binary, files_read_text,
    files_rename_entry, files_session_connect, files_write_text,
};
use commands::git::{
    GitState, git_abort_merge, git_available, git_change_diff, git_commit, git_commit_file_diff,
    git_commit_files, git_conflict_detail, git_continue_merge, git_create_branch,
    git_create_branch_from, git_create_branch_from_commit, git_delete_branch, git_discard,
    git_fetch, git_initialize, git_merge_branch, git_pull, git_push, git_remote_change_diff,
    git_remote_commit_file_diff, git_remote_commit_files, git_remote_conflict_detail,
    git_remote_execute, git_remote_list_directory, git_remote_resolve_conflict, git_rename_branch,
    git_resolve_conflict, git_select_repository_directory, git_session_connect, git_snapshot,
    git_stage, git_stage_all, git_switch_branch, git_track_remote_branch, git_unstage,
    git_unstage_all,
};
use commands::local_session::{
    LocalSessionState, local_session_close, local_session_connect, local_session_resize,
    local_session_write, local_terminal_capabilities,
};
use commands::network::{
    NetworkState, network_rule_create, network_rule_delete, network_rule_list, network_rule_start,
    network_rule_stop, network_rule_update, network_session_connect,
};
use commands::profile::{
    ProfileState, profile_clear_unsupported_storage, profile_create, profile_delete,
    profile_group_create, profile_group_delete, profile_group_list, profile_group_update,
    profile_import_ssh_config_commit, profile_import_ssh_config_preview, profile_jump_candidates,
    profile_list, profile_route_requirements, profile_update,
};
use commands::session::{
    SessionState, session_accept_host_key, session_close, session_connect, session_reject_host_key,
    session_resize, session_write,
};
use commands::settings::{
    SettingsState, settings_get, settings_select_configuration_directory,
    settings_update_appearance, settings_update_configuration_directory, settings_update_security,
    settings_update_terminal, settings_update_updates,
};
use commands::transfer::{
    TransferState, transfer_cancel, transfer_download, transfer_select_download_directory,
    transfer_select_download_path, transfer_select_upload_file, transfer_select_upload_files,
    transfer_select_upload_folder, transfer_upload, transfer_upload_dropped,
    transfer_upload_selected,
};
use commands::workspace::{WorkspaceState, workspace_load, workspace_save};
use domain::settings::ConfigurationDirectory;
use infrastructure::git_cli::SystemGitExecutor;
use infrastructure::local::pty::LocalSessionManager;
use infrastructure::persistence::json_appearance_settings_repository::JsonAppearanceSettingsRepository;
use infrastructure::persistence::json_credential_vault::JsonCredentialVault;
use infrastructure::persistence::json_known_host_repository::JsonKnownHostRepository;
use infrastructure::persistence::json_network_repository::JsonNetworkRepository;
use infrastructure::persistence::json_profile_repository::JsonProfileRepository;
use infrastructure::persistence::json_remote_shell_cache::JsonRemoteShellCache;
use infrastructure::persistence::json_settings_repository::{
    JsonConfigurationDirectoryRepository, JsonSettingsRepository,
};
use infrastructure::persistence::json_terminal_settings_repository::JsonTerminalSettingsRepository;
use infrastructure::persistence::json_update_settings_repository::JsonUpdateSettingsRepository;
use infrastructure::persistence::json_workspace_repository::JsonWorkspaceRepository;
use infrastructure::ssh::client::SshSessionManager;
use ports::settings_repository::ConfigurationDirectoryRepository;
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

#[cfg(desktop)]
fn persisted_window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::MAXIMIZED
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BuildMode {
    Development,
    Production,
}

impl BuildMode {
    fn current() -> Self {
        if cfg!(debug_assertions) {
            Self::Development
        } else {
            Self::Production
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ConfigurationStoragePaths {
    location: std::path::PathBuf,
    default_root: std::path::PathBuf,
}

impl ConfigurationStoragePaths {
    fn for_mode(home: &std::path::Path, mode: BuildMode) -> Self {
        let (location, default_root) = match mode {
            BuildMode::Development => (".qterm-location.dev.json", ".qterm-dev"),
            BuildMode::Production => (".qterm-location.json", ".qterm"),
        };
        Self {
            location: home.join(location),
            default_root: home.join(default_root),
        }
    }
}

fn resolve_active_configuration<R: ConfigurationDirectoryRepository>(
    repository: &R,
    default: &ConfigurationDirectory,
) -> ConfigurationDirectory {
    repository
        .load()
        .unwrap_or(None)
        .unwrap_or_else(|| default.clone())
}

#[derive(Debug, PartialEq, Eq)]
struct DataPaths {
    root: std::path::PathBuf,
    data: std::path::PathBuf,
    device: std::path::PathBuf,
    cache: std::path::PathBuf,
    profiles: std::path::PathBuf,
    credentials: std::path::PathBuf,
    network: std::path::PathBuf,
    known_hosts: std::path::PathBuf,
    workspaces: std::path::PathBuf,
    settings: std::path::PathBuf,
    appearance: std::path::PathBuf,
    updates: std::path::PathBuf,
    terminal: std::path::PathBuf,
    remote_shells: std::path::PathBuf,
    browser_profiles: std::path::PathBuf,
}

impl DataPaths {
    fn from_root(root: std::path::PathBuf) -> Self {
        let data = root.join("data");
        let device = root.join("device");
        let cache = root.join("cache");
        Self {
            profiles: data.join("connections.json"),
            credentials: data.join("secrets.vault"),
            network: data.join("network-forwards.json"),
            known_hosts: device.join("known-hosts.json"),
            workspaces: device.join("workspaces.json"),
            settings: device.join("settings.json"),
            appearance: device.join("appearance.json"),
            updates: device.join("updates.json"),
            terminal: device.join("terminal.json"),
            remote_shells: cache.join("remote-shells.json"),
            browser_profiles: cache.join("browser-profiles"),
            root,
            data,
            device,
            cache,
        }
    }

    fn initialize(&self) -> std::io::Result<()> {
        for directory in [&self.data, &self.device, &self.cache] {
            std::fs::create_dir_all(directory)?;
        }
        Ok(())
    }
}

/// Starts the desktop runtime and acts as the composition root for adapters.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(persisted_window_state_flags())
            .build(),
    );

    builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                window.state::<TransferState>().approve_drop_paths(paths);
            }
        })
        .setup(|app| {
            let home = app.path().home_dir()?;
            let configuration_storage =
                ConfigurationStoragePaths::for_mode(&home, BuildMode::current());
            let default_configuration =
                ConfigurationDirectory::from_absolute_path(configuration_storage.default_root)
                    .map_err(|_| std::io::Error::other("Qterm home directory must be absolute"))?;
            let configuration_location_path = configuration_storage.location;
            let configuration_repository =
                JsonConfigurationDirectoryRepository::new(configuration_location_path.clone());
            let active_configuration =
                resolve_active_configuration(&configuration_repository, &default_configuration);
            let paths = DataPaths::from_root(active_configuration.path().to_path_buf());
            paths.initialize()?;
            app.manage(ClipboardState::new(paths.cache.join("clipboard")));
            app.manage(SettingsState::new(
                JsonSettingsRepository::new(paths.settings.clone()),
                JsonConfigurationDirectoryRepository::new(configuration_location_path),
                default_configuration,
                active_configuration,
                JsonAppearanceSettingsRepository::new(paths.appearance.clone()),
                JsonUpdateSettingsRepository::new(paths.updates.clone()),
                JsonTerminalSettingsRepository::new(paths.terminal.clone()),
            ));
            app.manage(ProfileState::new(JsonProfileRepository::new(
                paths.profiles,
            )));
            app.manage(CredentialState::new(JsonCredentialVault::new(
                paths.credentials,
            )));
            app.manage(NetworkState::new(JsonNetworkRepository::new(paths.network)));
            app.manage(BrowserProxyState::new(paths.browser_profiles));
            app.manage(TransferState::new());
            app.manage(WorkspaceState::new(JsonWorkspaceRepository::new(
                paths.workspaces,
            )));
            app.manage(SessionState::new(SshSessionManager::new(
                JsonKnownHostRepository::new(paths.known_hosts),
                JsonRemoteShellCache::new(paths.remote_shells),
            )));
            app.manage(LocalSessionState::new(LocalSessionManager::default()));
            app.manage(GitState::new(SystemGitExecutor::discover()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            browser_proxy_list,
            browser_proxy_launch,
            profile_list,
            profile_jump_candidates,
            profile_route_requirements,
            profile_create,
            profile_update,
            profile_delete,
            profile_clear_unsupported_storage,
            profile_group_list,
            profile_group_create,
            profile_group_update,
            profile_group_delete,
            profile_import_ssh_config_preview,
            profile_import_ssh_config_commit,
            network_rule_list,
            network_rule_create,
            network_rule_update,
            network_rule_delete,
            network_session_connect,
            network_rule_start,
            network_rule_stop,
            credential_vault_status,
            credential_vault_initialize,
            credential_vault_unlock,
            credential_vault_change_master_password,
            credential_vault_prepare_master_password_reset,
            credential_vault_reset_master_password,
            credential_vault_cancel_master_password_reset,
            credential_vault_lock,
            credential_vault_clear,
            credential_list,
            credential_create_password,
            credential_rename,
            credential_prepare_private_key,
            credential_prepare_private_key_path,
            credential_prepare_generated_private_key,
            credential_commit_private_key,
            credential_cancel_private_key,
            credential_public_key,
            credential_reveal_password,
            credential_delete,
            settings_get,
            settings_select_configuration_directory,
            settings_update_configuration_directory,
            settings_update_security,
            settings_update_appearance,
            settings_update_updates,
            settings_update_terminal,
            session_connect,
            session_accept_host_key,
            session_reject_host_key,
            session_close,
            session_write,
            session_resize,
            session_start_clipboard_staging,
            session_cancel_clipboard_staging,
            local_terminal_prepare_clipboard_paste,
            local_terminal_capabilities,
            local_session_connect,
            local_session_write,
            local_session_resize,
            local_session_close,
            files_list_local,
            files_list_local_roots,
            files_list_remote,
            files_read_text,
            files_read_binary,
            files_write_text,
            files_copy_entry,
            files_create_entry,
            files_rename_entry,
            files_delete_entry,
            files_session_connect,
            transfer_select_upload_file,
            transfer_select_upload_files,
            transfer_select_upload_folder,
            transfer_select_download_path,
            transfer_select_download_directory,
            transfer_upload,
            transfer_upload_dropped,
            transfer_upload_selected,
            transfer_download,
            transfer_cancel,
            workspace_load,
            workspace_save,
            git_available,
            git_session_connect,
            git_remote_execute,
            git_remote_commit_files,
            git_remote_commit_file_diff,
            git_remote_change_diff,
            git_remote_conflict_detail,
            git_remote_resolve_conflict,
            git_remote_list_directory,
            git_select_repository_directory,
            git_snapshot,
            git_initialize,
            git_stage,
            git_stage_all,
            git_unstage,
            git_unstage_all,
            git_discard,
            git_commit,
            git_commit_files,
            git_commit_file_diff,
            git_change_diff,
            git_conflict_detail,
            git_resolve_conflict,
            git_create_branch,
            git_create_branch_from,
            git_create_branch_from_commit,
            git_rename_branch,
            git_delete_branch,
            git_switch_branch,
            git_fetch,
            git_pull,
            git_push,
            git_track_remote_branch,
            git_merge_branch,
            git_continue_merge,
            git_abort_merge
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Qterm");
}

#[cfg(test)]
mod tests {
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
        let development_default =
            ConfigurationDirectory::from_absolute_path(development.default_root)
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
}
