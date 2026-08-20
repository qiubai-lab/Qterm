use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    application::{
        error::{ApplicationError, ApplicationErrorCode},
        profile_service::{ProfileGroupInput, ProfileInput, ProfileService},
    },
    commands::error::IpcError,
    commands::network::NetworkState,
    domain::profile::{AuthPreference, ConnectionProfile, ProfileGroup},
    infrastructure::persistence::json_profile_repository::JsonProfileRepository,
};

pub struct ProfileState {
    service: ProfileService<JsonProfileRepository>,
}

impl ProfileState {
    pub fn new(repository: JsonProfileRepository) -> Self {
        Self {
            service: ProfileService::new(repository),
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
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreateProfileDto {
    name: String,
    host: String,
    port: u32,
    username: String,
    auth_preference: AuthPreferenceDto,
    credential_id: Option<String>,
    group_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum AuthPreferenceDto {
    Password,
    PrivateKey,
    SshAgent,
    Manual,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDto {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_preference: AuthPreferenceDto,
    credential_id: Option<String>,
    group_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProfileGroupInputDto {
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileGroupDto {
    id: String,
    name: String,
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
) -> Result<(), IpcError> {
    if network.has_profile_rules(&id)? {
        return Err(IpcError::from(ApplicationError::new(
            ApplicationErrorCode::ProfileHasNetworkRules,
            "该连接仍有网络转发规则，请先删除相关规则",
            false,
        )));
    }
    state.service.delete(&id).map_err(IpcError::from)
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

impl From<CreateProfileDto> for ProfileInput {
    fn from(value: CreateProfileDto) -> Self {
        Self {
            name: value.name,
            host: value.host,
            port: value.port,
            username: value.username,
            auth_preference: value.auth_preference.into(),
            credential_id: value.credential_id,
            group_id: value.group_id,
        }
    }
}

impl From<ProfileGroupInputDto> for ProfileGroupInput {
    fn from(value: ProfileGroupInputDto) -> Self {
        Self { name: value.name }
    }
}

impl From<AuthPreferenceDto> for AuthPreference {
    fn from(value: AuthPreferenceDto) -> Self {
        match value {
            AuthPreferenceDto::Password => Self::Password,
            AuthPreferenceDto::PrivateKey => Self::PrivateKey,
            AuthPreferenceDto::SshAgent => Self::SshAgent,
            AuthPreferenceDto::Manual => Self::Manual,
        }
    }
}

impl From<AuthPreference> for AuthPreferenceDto {
    fn from(value: AuthPreference) -> Self {
        match value {
            AuthPreference::Password => Self::Password,
            AuthPreference::PrivateKey => Self::PrivateKey,
            AuthPreference::SshAgent => Self::SshAgent,
            AuthPreference::Manual => Self::Manual,
        }
    }
}

impl From<&ConnectionProfile> for ProfileDto {
    fn from(profile: &ConnectionProfile) -> Self {
        Self {
            id: profile.id().as_str().to_owned(),
            name: profile.name().to_owned(),
            host: profile.host().to_owned(),
            port: profile.port(),
            username: profile.username().to_owned(),
            auth_preference: profile.auth_preference().into(),
            credential_id: profile.credential_id().map(|id| id.as_str().to_owned()),
            group_id: profile.group_id().map(|id| id.as_str().to_owned()),
        }
    }
}

impl From<&ProfileGroup> for ProfileGroupDto {
    fn from(group: &ProfileGroup) -> Self {
        Self {
            id: group.id().as_str().to_owned(),
            name: group.name().to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{CreateProfileDto, ProfileDto, ProfileGroupDto};
    use crate::domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    };

    #[test]
    fn profile_input_dto_rejects_secret_and_unknown_fields() {
        let input = json!({
            "name": "Production",
            "host": "example.com",
            "port": 22,
            "username": "deploy",
            "authPreference": "password",
            "password": "must-not-cross-this-command"
        });

        assert!(serde_json::from_value::<CreateProfileDto>(input).is_err());
    }

    #[test]
    fn profile_output_dto_contains_only_non_secret_profile_data() {
        let profile = ConnectionProfile::new(
            ProfileId::parse("profile-1").expect("fixture id"),
            "Production",
            "example.com",
            22,
            "deploy",
            AuthPreference::PrivateKey,
            Some(CredentialId::parse("credential-1").expect("credential")),
        )
        .expect("fixture profile");

        let profile = profile.with_group_id(Some(
            ProfileGroupId::parse("group-1").expect("fixture group id"),
        ));
        let value = serde_json::to_value(ProfileDto::from(&profile)).expect("serialize profile");
        let object = value.as_object().expect("profile object");
        assert_eq!(object.get("credentialId"), Some(&json!("credential-1")));
        assert_eq!(object.get("groupId"), Some(&json!("group-1")));
        for forbidden in ["password", "passphrase", "privateKeyData"] {
            assert!(!object.contains_key(forbidden));
        }
    }

    #[test]
    fn group_output_dto_has_no_nesting_contract() {
        let group = ProfileGroup::new(
            ProfileGroupId::parse("group-1").expect("fixture group id"),
            "Production",
        )
        .expect("fixture group");

        let value = serde_json::to_value(ProfileGroupDto::from(&group)).expect("serialize group");
        assert_eq!(value, json!({ "id": "group-1", "name": "Production" }));
        assert!(value.get("parentId").is_none());
    }
}
