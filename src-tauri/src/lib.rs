mod application;
mod commands;
mod domain;
mod infrastructure;
mod ports;

use commands::credential::{
    CredentialState, credential_create_password, credential_delete, credential_import_private_key,
    credential_list, credential_public_key, credential_reveal_password,
    credential_vault_cancel_master_password_reset, credential_vault_change_master_password,
    credential_vault_clear, credential_vault_initialize, credential_vault_lock,
    credential_vault_prepare_master_password_reset, credential_vault_reset_master_password,
    credential_vault_status, credential_vault_unlock,
};
use commands::files::{
    files_copy_entry, files_create_entry, files_delete_entry, files_list_local, files_list_remote,
    files_read_binary, files_read_text, files_rename_entry, files_session_connect,
    files_write_text,
};
use commands::local_session::{
    LocalSessionState, local_session_close, local_session_connect, local_session_resize,
    local_session_write, local_terminal_capabilities,
};
use commands::profile::{
    ProfileState, profile_create, profile_delete, profile_group_create, profile_group_delete,
    profile_group_list, profile_group_update, profile_list, profile_update,
};
use commands::session::{
    SessionState, session_accept_host_key, session_close, session_connect, session_reject_host_key,
    session_resize, session_write,
};
use commands::settings::{
    SettingsState, settings_get, settings_select_data_directory, settings_update_data_directory,
    settings_update_security,
};
use commands::transfer::{
    TransferState, transfer_cancel, transfer_download, transfer_select_download_directory,
    transfer_select_download_path, transfer_select_upload_file, transfer_upload,
    transfer_upload_dropped,
};
use commands::workspace::{WorkspaceState, workspace_load, workspace_save};
use domain::settings::DataDirectory;
use infrastructure::local::pty::LocalSessionManager;
use infrastructure::persistence::json_credential_vault::JsonCredentialVault;
use infrastructure::persistence::json_known_host_repository::JsonKnownHostRepository;
use infrastructure::persistence::json_profile_repository::JsonProfileRepository;
use infrastructure::persistence::json_settings_repository::{
    JsonDataDirectoryRepository, JsonSettingsRepository,
};
use infrastructure::persistence::json_workspace_repository::JsonWorkspaceRepository;
use infrastructure::ssh::client::SshSessionManager;
use ports::settings_repository::DataDirectoryRepository;
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

#[cfg(desktop)]
fn persisted_window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::MAXIMIZED
}

#[derive(Debug, PartialEq, Eq)]
struct DataPaths {
    profiles: std::path::PathBuf,
    credentials: std::path::PathBuf,
    known_hosts: std::path::PathBuf,
    workspaces: std::path::PathBuf,
    settings: std::path::PathBuf,
}

impl DataPaths {
    fn from_roots(portable_root: &std::path::Path, local_root: &std::path::Path) -> Self {
        Self {
            profiles: portable_root.join("connections.json"),
            credentials: portable_root.join("secrets.vault"),
            known_hosts: local_root.join("known-hosts.json"),
            workspaces: local_root.join("workspaces.json"),
            settings: local_root.join("settings.json"),
        }
    }
}

/// Starts the desktop runtime and acts as the composition root for adapters.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init());
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
            let default_data_directory = DataDirectory::default_for(&home);
            let data_directory_repository = JsonDataDirectoryRepository::new(
                app.path().app_config_dir()?.join("storage-location.json"),
            );
            let active_data_directory = data_directory_repository
                .load()
                .unwrap_or(None)
                .unwrap_or_else(|| default_data_directory.clone());
            std::fs::create_dir_all(active_data_directory.path())?;
            let paths =
                DataPaths::from_roots(active_data_directory.path(), &app.path().app_data_dir()?);
            app.manage(ProfileState::new(JsonProfileRepository::new(
                paths.profiles,
            )));
            app.manage(CredentialState::new(JsonCredentialVault::new(
                paths.credentials,
            )));
            app.manage(SettingsState::new(
                JsonSettingsRepository::new(paths.settings),
                data_directory_repository,
                default_data_directory,
                active_data_directory,
            ));
            app.manage(TransferState::new());
            app.manage(WorkspaceState::new(JsonWorkspaceRepository::new(
                paths.workspaces,
            )));
            app.manage(SessionState::new(SshSessionManager::new(
                JsonKnownHostRepository::new(paths.known_hosts),
            )));
            app.manage(LocalSessionState::new(LocalSessionManager::default()));
            #[cfg(windows)]
            infrastructure::windows::session_lock::install(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            profile_list,
            profile_create,
            profile_update,
            profile_delete,
            profile_group_list,
            profile_group_create,
            profile_group_update,
            profile_group_delete,
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
            credential_import_private_key,
            credential_public_key,
            credential_reveal_password,
            credential_delete,
            settings_get,
            settings_update_security,
            settings_update_data_directory,
            settings_select_data_directory,
            session_connect,
            session_accept_host_key,
            session_reject_host_key,
            session_close,
            session_write,
            session_resize,
            local_terminal_capabilities,
            local_session_connect,
            local_session_write,
            local_session_resize,
            local_session_close,
            files_list_local,
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
            transfer_select_download_path,
            transfer_select_download_directory,
            transfer_upload,
            transfer_upload_dropped,
            transfer_download,
            transfer_cancel,
            workspace_load,
            workspace_save
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Qterm");
}

#[cfg(test)]
mod tests {
    use super::{DataPaths, persisted_window_state_flags};
    use tauri_plugin_window_state::StateFlags;

    #[test]
    fn only_connections_and_credentials_follow_the_portable_root() {
        let portable_root = std::path::Path::new("portable-root");
        let local_root = std::path::Path::new("local-root");
        let paths = DataPaths::from_roots(portable_root, local_root);

        assert_eq!(paths.profiles.parent(), Some(portable_root));
        assert_eq!(paths.credentials.parent(), Some(portable_root));
        assert_eq!(paths.known_hosts.parent(), Some(local_root));
        assert_eq!(paths.workspaces.parent(), Some(local_root));
        assert_eq!(paths.settings.parent(), Some(local_root));
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
