use commands::configuration_merge::{
    ConfigurationMergeState, configuration_merge_cancel, configuration_merge_commit,
    configuration_merge_preview, configuration_merge_select, configuration_merge_unlock_source,
};
use commands::notification::{
    NotificationState, notification_body_settings_get, notification_body_settings_update,
    notification_settings_get, notification_settings_update, terminal_notification_send,
};
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
    GitState, git_abort_merge, git_available, git_change_diff, git_checkout_submodule, git_commit,
    git_commit_file_diff, git_commit_files, git_conflict_detail, git_continue_merge,
    git_create_branch, git_create_branch_from, git_create_branch_from_commit, git_delete_branch,
    git_discard, git_fetch, git_initialize, git_initialize_submodule, git_merge_branch, git_pull,
    git_push, git_remote_change_diff, git_remote_commit_file_diff, git_remote_commit_files,
    git_remote_conflict_detail, git_remote_execute, git_remote_list_directory,
    git_remote_resolve_conflict, git_rename_branch, git_resolve_conflict,
    git_select_repository_directory, git_session_connect, git_snapshot, git_stage, git_stage_all,
    git_switch_branch, git_track_remote_branch, git_unstage, git_unstage_all,
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
        #[cfg(feature = "cef-integration-test")]
        if let Some(root) = std::env::var_os("QTERM_CEF_PROBE_DATA") {
            return Self {
                location: std::path::PathBuf::from(&root).join("locator.json"),
                default_root: std::path::PathBuf::from(root),
            };
        }
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
    let home = dirs::home_dir().expect("home directory");
    let configuration_storage = ConfigurationStoragePaths::for_mode(&home, BuildMode::current());
    let default_configuration =
        ConfigurationDirectory::from_absolute_path(configuration_storage.default_root)
            .expect("Qterm home directory must be absolute");
    let configuration_location_path = configuration_storage.location;
    let configuration_repository =
        JsonConfigurationDirectoryRepository::new(configuration_location_path.clone());
    let active_configuration =
        resolve_active_configuration(&configuration_repository, &default_configuration);
    let paths = DataPaths::from_root(active_configuration.path().to_path_buf());
    paths
        .initialize()
        .expect("initialize configuration directories");

    let cef_root = paths.cache.join("cef-v1");
    std::fs::create_dir_all(&cef_root).expect("create CEF root");
    let cef_root = cef_root.canonicalize().expect("resolve CEF root");
    let runtime = infrastructure::cef_runtime::runtime(&cef_root);
    let builder = tauri::Builder::default()
        .runtime(runtime)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(infrastructure::external_links::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(infrastructure::macos_menu::build)
        .on_menu_event(infrastructure::macos_menu::handle);
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
        .setup(move |app| {
            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window("main")
                && let Some(product_name) = app.config().product_name.as_deref()
            {
                window.set_title(product_name)?;
            }
            app.manage(infrastructure::web::WebHost::new(cef_root));
            app.manage(commands::web_tabs::WebTabState::new(
                infrastructure::persistence::json_web_tabs::JsonWebTabs::new(paths.cache.join("web-tabs/sessions.json")),
            ));
            app.manage(commands::web_library::WebLibraryState::new(
                infrastructure::persistence::json_web_library::JsonWebLibrary::new(paths.device.join("web-library.json")),
            ));
            infrastructure::persistence::configuration_merge::FileConfigurationMergeStorage::recover(&paths.root).map_err(std::io::Error::other)?;
            let credential_vault = JsonCredentialVault::new(paths.credentials.clone());
            app.manage(ConfigurationMergeState::new(paths.root.clone(), credential_vault.clone()));
            app.manage(NotificationState::new(
                paths.device.join("notifications.json"),
            ));
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
            app.manage(CredentialState::new(credential_vault));
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
            infrastructure::web::initialize_main(app.handle())?;
            Ok(())
        })
        .invoke_handler(infrastructure::web::trusted_handler(tauri::generate_handler![
                commands::web::web_shutdown, commands::web::web_supported, commands::web::web_open, commands::web::web_accept_popup, commands::web::web_reject_popup, commands::web::web_close, commands::web::web_sync, commands::web::web_action, commands::web::web_metrics, commands::web::web_snapshot, commands::web::web_clear_data,
            commands::web_library::web_library,
            commands::web_tabs::web_tab_cache,
            configuration_merge_select, configuration_merge_preview, configuration_merge_commit, configuration_merge_cancel, configuration_merge_unlock_source,
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
            notification_settings_get,
            notification_settings_update,
            terminal_notification_send,
            commands::terminal_image::terminal_image_save,
            notification_body_settings_get,
            notification_body_settings_update,
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
            git_initialize_submodule,
            git_checkout_submodule,
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
        ]))
        .build(tauri::generate_context!())
        .expect("failed to build Qterm")
        .run(infrastructure::web::on_event);
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
