mod dto;
mod import;
#[cfg(test)]
mod tests;

use tauri::State;

pub use dto::*;
pub use import::{profile_import_ssh_config_commit, profile_import_ssh_config_preview};

use crate::{
    application::{
        error::{ApplicationError, ApplicationErrorCode},
        profile_service::{
            ProfileInput, ProfileService, clear_unsupported_portable_config,
            delete_profile_with_network_rules,
        },
        ssh_config_import::SshConfigImportSession,
    },
    commands::{error::IpcError, network::NetworkState, session::SessionState},
    domain::profile::{AuthPreference, ConnectionProfile},
    infrastructure::persistence::json_profile_repository::JsonProfileRepository,
};

pub struct ProfileState {
    service: ProfileService<JsonProfileRepository>,
    pending_ssh_config: SshConfigImportSession,
}

impl ProfileState {
    pub fn new(repository: JsonProfileRepository) -> Self {
        Self {
            service: ProfileService::new(repository),
            pending_ssh_config: SshConfigImportSession::default(),
        }
    }

    pub(crate) fn clear_credential_references(&self, credential_id: &str) -> Result<(), IpcError> {
        self.service
            .clear_credential_references(credential_id)
            .map_err(IpcError::from)
    }
    pub(crate) fn clear_all_credential_references(&self) -> Result<(), IpcError> {
        self.service
            .clear_all_credential_references()
            .map_err(IpcError::from)
    }
    pub(crate) fn profile(&self, id: &str) -> Result<ConnectionProfile, IpcError> {
        self.service
            .list()
            .map_err(IpcError::from)?
            .into_iter()
            .find(|profile| profile.id().as_str() == id)
            .ok_or_else(|| {
                IpcError::from(ApplicationError::new(
                    ApplicationErrorCode::ProfileNotFound,
                    "连接配置不存在",
                    false,
                ))
            })
    }
    pub(crate) fn route(&self, id: &str) -> Result<Vec<ConnectionProfile>, IpcError> {
        self.service.route(id).map_err(IpcError::from)
    }
    fn create_many(&self, inputs: Vec<ProfileInput>) -> Result<Vec<ConnectionProfile>, IpcError> {
        self.service.create_many(inputs).map_err(IpcError::from)
    }
    fn remember_ssh_config(&self, path: std::path::PathBuf, home: std::path::PathBuf) -> String {
        self.pending_ssh_config.remember(path, home)
    }
    fn ssh_config_source(
        &self,
        preview_id: &str,
    ) -> Result<(std::path::PathBuf, std::path::PathBuf), IpcError> {
        self.pending_ssh_config
            .source(preview_id)
            .ok_or_else(import::expired_import_preview)
    }
    fn complete_ssh_config(&self, preview_id: &str) {
        self.pending_ssh_config.complete(preview_id);
    }
}

#[tauri::command]
pub fn profile_list(state: State<'_, ProfileState>) -> Result<Vec<ProfileDto>, IpcError> {
    state
        .service
        .list()
        .map(|profiles| profiles.iter().map(ProfileDto::from).collect())
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_jump_candidates(
    current_profile_id: Option<String>,
    selected_profile_ids: Vec<String>,
    state: State<'_, ProfileState>,
) -> Result<Vec<JumpCandidateDto>, IpcError> {
    state
        .service
        .jump_candidates(current_profile_id.as_deref(), &selected_profile_ids)
        .map(|candidates| candidates.into_iter().map(JumpCandidateDto::from).collect())
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_route_requirements(
    profile_id: String,
    state: State<'_, ProfileState>,
) -> Result<ProfileRouteRequirementsDto, IpcError> {
    state
        .route(&profile_id)
        .map(|route| ProfileRouteRequirementsDto {
            uses_credential: route.iter().any(|profile| {
                matches!(
                    profile.auth_preference(),
                    AuthPreference::Password | AuthPreference::PrivateKey
                ) && profile.credential_id().is_some()
            }),
            route_names: route
                .into_iter()
                .map(|profile| profile.name().to_owned())
                .collect(),
        })
}

#[tauri::command]
pub fn profile_create(
    input: CreateProfileDto,
    state: State<'_, ProfileState>,
) -> Result<ProfileDto, IpcError> {
    state
        .service
        .create(input.into())
        .map(|profile| ProfileDto::from(&profile))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_update(
    id: String,
    input: CreateProfileDto,
    state: State<'_, ProfileState>,
) -> Result<ProfileDto, IpcError> {
    state
        .service
        .update(&id, input.into())
        .map(|profile| ProfileDto::from(&profile))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_delete(
    id: String,
    state: State<'_, ProfileState>,
    network: State<'_, NetworkState>,
    sessions: State<'_, SessionState>,
) -> Result<ProfileDeleteResultDto, IpcError> {
    let deleted_network_rules =
        delete_profile_with_network_rules(&state.service, &network.service, &id)
            .map_err(IpcError::from)?;
    sessions.manager().close_profile_network_sessions(&id);
    sessions.manager().close_profile_git_sessions(&id);
    Ok(ProfileDeleteResultDto {
        deleted_network_rules,
    })
}

#[tauri::command]
pub fn profile_clear_unsupported_storage(
    state: State<'_, ProfileState>,
    network: State<'_, NetworkState>,
    sessions: State<'_, SessionState>,
) -> Result<(), IpcError> {
    clear_unsupported_portable_config(&state.service, &network.service)?;
    sessions.manager().close_all_network_sessions();
    Ok(())
}

#[tauri::command]
pub fn profile_group_list(
    state: State<'_, ProfileState>,
) -> Result<Vec<ProfileGroupDto>, IpcError> {
    state
        .service
        .list_groups()
        .map(|groups| groups.iter().map(ProfileGroupDto::from).collect())
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_group_create(
    input: ProfileGroupInputDto,
    state: State<'_, ProfileState>,
) -> Result<ProfileGroupDto, IpcError> {
    state
        .service
        .create_group(input.into())
        .map(|group| ProfileGroupDto::from(&group))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_group_update(
    id: String,
    input: ProfileGroupInputDto,
    state: State<'_, ProfileState>,
) -> Result<ProfileGroupDto, IpcError> {
    state
        .service
        .update_group(&id, input.into())
        .map(|group| ProfileGroupDto::from(&group))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn profile_group_delete(id: String, state: State<'_, ProfileState>) -> Result<(), IpcError> {
    state.service.delete_group(&id).map_err(IpcError::from)
}
