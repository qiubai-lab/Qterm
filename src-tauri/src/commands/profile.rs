use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    application::{
        error::{ApplicationError, ApplicationErrorCode},
        profile_service::{
            JumpCandidate, ProfileGroupInput, ProfileInput, ProfileService,
            clear_unsupported_portable_config, delete_profile_with_network_rules,
        },
        ssh_config_import::{
            SshConfigImportSession, allocate_import_name, candidate_already_imported,
            imported_profile_input,
        },
    },
    commands::{credential::CredentialState, error::IpcError},
    commands::{network::NetworkState, session::SessionState},
    domain::profile::{AuthPreference, ConnectionProfile, JumpRouteError, ProfileGroup},
    infrastructure::{
        persistence::json_profile_repository::JsonProfileRepository,
        ssh::config_import::{
            IdentityFileStatus, SshConfigCandidate, SshConfigImportError, candidates_by_alias,
            parse_ssh_config,
        },
    },
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
            .ok_or_else(expired_import_preview)
    }

    fn complete_ssh_config(&self, preview_id: &str) {
        self.pending_ssh_config.complete(preview_id);
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
    jump_profile_ids: Vec<String>,
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
    #[serde(default)]
    jump_profile_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpCandidateDto {
    profile: ProfileDto,
    selectable: bool,
    reason_code: Option<&'static str>,
    reason: Option<&'static str>,
    uses_credential: bool,
    route_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRouteRequirementsDto {
    uses_credential: bool,
    route_names: Vec<String>,
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

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SshConfigIdentityStatusDto {
    Available,
    Unavailable,
    TooLarge,
    DynamicPath,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigIdentityDto {
    index: u32,
    file_name: String,
    status: SshConfigIdentityStatusDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigCandidateDto {
    alias: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    already_imported: bool,
    importable: bool,
    identities: Vec<SshConfigIdentityDto>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigPreviewDto {
    preview_id: String,
    source_name: String,
    candidates: Vec<SshConfigCandidateDto>,
    warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SshConfigImportItemDto {
    alias: String,
    identity_file_index: Option<u32>,
    passphrase: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SshConfigImportDto {
    preview_id: String,
    items: Vec<SshConfigImportItemDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigImportResultDto {
    imported: usize,
    imported_private_keys: usize,
    reused_private_keys: usize,
}

struct SelectedSshConfigCandidate {
    candidate: SshConfigCandidate,
    profile_name: String,
    identity_file_index: Option<u32>,
    passphrase: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDeleteResultDto {
    deleted_network_rules: usize,
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

#[tauri::command]
pub async fn profile_import_ssh_config_preview(
    app: AppHandle,
    state: State<'_, ProfileState>,
) -> Result<Option<SshConfigPreviewDto>, IpcError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| ssh_config_error(SshConfigImportError::NotFound))?;
    let ssh_directory = home.join(".ssh");
    let mut picker = app.dialog().file().set_title("选择 SSH Config 文件");
    if ssh_directory.is_dir() {
        picker = picker.set_directory(&ssh_directory);
    }
    let Some(path) = picker
        .blocking_pick_file()
        .and_then(|selection| selection.into_path().ok())
    else {
        return Ok(None);
    };
    let preview = parse_ssh_config(&path, &home).map_err(ssh_config_error)?;
    let existing = state.service.list().map_err(IpcError::from)?;
    let source_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("SSH Config")
        .to_owned();
    let preview_id = state.remember_ssh_config(path, home);
    let candidates = preview_candidate_dtos(&existing, preview.candidates);
    Ok(Some(SshConfigPreviewDto {
        preview_id,
        source_name,
        candidates,
        warnings: preview.warnings,
    }))
}

#[tauri::command]
pub fn profile_import_ssh_config_commit(
    input: SshConfigImportDto,
    profiles: State<'_, ProfileState>,
    credentials: State<'_, CredentialState>,
) -> Result<SshConfigImportResultDto, IpcError> {
    if input.items.is_empty() {
        return Err(invalid_import_selection());
    }
    let (config_path, home) = profiles.ssh_config_source(&input.preview_id)?;
    let preview = parse_ssh_config(&config_path, &home).map_err(ssh_config_error)?;
    let candidates = candidates_by_alias(preview);
    let existing = profiles.service.list().map_err(IpcError::from)?;
    let selected = select_import_candidates(input.items, &candidates, &existing)?;

    let mut credential_by_path = HashMap::<std::path::PathBuf, String>::new();
    let mut created_credential_ids = Vec::new();
    let mut reused_credential_ids = HashSet::new();
    let mut profile_inputs = Vec::with_capacity(selected.len());
    for selected_candidate in selected {
        let SelectedSshConfigCandidate {
            candidate,
            profile_name,
            identity_file_index: identity_index,
            passphrase,
        } = selected_candidate;
        let credential_id = if let Some(identity_index) = identity_index {
            let identity = candidate
                .identity_files
                .iter()
                .find(|identity| identity.index == identity_index as usize)
                .filter(|identity| identity.status == IdentityFileStatus::Available)
                .ok_or_else(invalid_import_selection)?;
            let key = dunce::canonicalize(&identity.path).unwrap_or_else(|_| identity.path.clone());
            if let Some(id) = credential_by_path.get(&key) {
                Some(id.clone())
            } else {
                let outcome = match credentials.import_or_reuse_private_key_path(
                    format!("{} 私钥", candidate.alias),
                    &identity.path,
                    passphrase,
                ) {
                    Ok(created) => created,
                    Err(error) => {
                        rollback_credentials(&credentials, &created_credential_ids);
                        return Err(error);
                    }
                };
                let id = outcome.summary.id.as_str().to_owned();
                credential_by_path.insert(key, id.clone());
                if outcome.created {
                    created_credential_ids.push(id.clone());
                } else if !created_credential_ids.contains(&id) {
                    reused_credential_ids.insert(id.clone());
                }
                Some(id)
            }
        } else {
            None
        };
        profile_inputs.push(imported_profile_input(
            candidate,
            profile_name,
            credential_id,
        ));
    }

    let imported_private_keys = created_credential_ids.len();
    match profiles.create_many(profile_inputs) {
        Ok(imported) => {
            profiles.complete_ssh_config(&input.preview_id);
            Ok(SshConfigImportResultDto {
                imported: imported.len(),
                imported_private_keys,
                reused_private_keys: reused_credential_ids.len(),
            })
        }
        Err(error) => {
            rollback_credentials(&credentials, &created_credential_ids);
            Err(error)
        }
    }
}

fn select_import_candidates(
    items: Vec<SshConfigImportItemDto>,
    candidates: &HashMap<String, SshConfigCandidate>,
    existing: &[ConnectionProfile],
) -> Result<Vec<SelectedSshConfigCandidate>, IpcError> {
    let mut aliases = HashSet::new();
    let mut used_names = existing
        .iter()
        .map(|profile| profile.name().to_lowercase())
        .collect::<HashSet<_>>();
    let mut selected = Vec::with_capacity(items.len());
    for item in items {
        if !aliases.insert(item.alias.clone()) {
            return Err(invalid_import_selection());
        }
        let candidate = candidates
            .get(&item.alias)
            .cloned()
            .ok_or_else(invalid_import_selection)?;
        if candidate.host.is_empty()
            || candidate.username.is_empty()
            || candidate_already_imported(existing, &candidate)
        {
            return Err(invalid_import_selection());
        }
        if let Some(identity_index) = item.identity_file_index
            && !candidate.identity_files.iter().any(|identity| {
                identity.index == identity_index as usize
                    && identity.status == IdentityFileStatus::Available
            })
        {
            return Err(invalid_import_selection());
        }
        let profile_name = allocate_import_name(&candidate.alias, &mut used_names);
        selected.push(SelectedSshConfigCandidate {
            candidate,
            profile_name,
            identity_file_index: item.identity_file_index,
            passphrase: item.passphrase,
        });
    }
    Ok(selected)
}

fn preview_candidate_dtos(
    existing: &[ConnectionProfile],
    candidates: Vec<SshConfigCandidate>,
) -> Vec<SshConfigCandidateDto> {
    let mut used_names = existing
        .iter()
        .map(|profile| profile.name().to_lowercase())
        .collect::<HashSet<_>>();
    candidates
        .into_iter()
        .map(|mut candidate| {
            let already_imported = candidate_already_imported(existing, &candidate);
            let importable = !already_imported
                && !candidate.host.is_empty()
                && !candidate.username.is_empty()
                && candidate.port > 0;
            let name = if importable {
                allocate_import_name(&candidate.alias, &mut used_names)
            } else {
                candidate.alias.clone()
            };
            if name != candidate.alias {
                candidate.warnings.push(format!(
                    "连接名称“{}”已存在，导入后将保存为“{}”",
                    candidate.alias, name
                ));
            }
            SshConfigCandidateDto {
                name,
                alias: candidate.alias,
                host: candidate.host,
                port: candidate.port,
                username: candidate.username,
                already_imported,
                importable,
                identities: candidate
                    .identity_files
                    .into_iter()
                    .map(|identity| SshConfigIdentityDto {
                        index: u32::try_from(identity.index).unwrap_or(u32::MAX),
                        file_name: identity.file_name,
                        status: identity.status.into(),
                    })
                    .collect(),
                warnings: candidate.warnings,
            }
        })
        .collect()
}

fn rollback_credentials(credentials: &CredentialState, credential_ids: &[String]) {
    for credential_id in credential_ids {
        credentials.delete_imported_credential(credential_id);
    }
}

fn ssh_config_error(error: SshConfigImportError) -> IpcError {
    let (code, message, retryable) = match error {
        SshConfigImportError::NotFound => (
            ApplicationErrorCode::SshConfigNotFound,
            "未找到 ~/.ssh/config",
            false,
        ),
        SshConfigImportError::Unreadable => (
            ApplicationErrorCode::SshConfigUnreadable,
            "无法读取 SSH Config",
            true,
        ),
        SshConfigImportError::TooLarge => (
            ApplicationErrorCode::SshConfigTooLarge,
            "SSH Config 或 Include 超出安全读取限制",
            false,
        ),
        SshConfigImportError::Invalid => (
            ApplicationErrorCode::SshConfigInvalid,
            "SSH Config 格式无效或 Include 存在循环",
            false,
        ),
    };
    IpcError::from(ApplicationError::new(code, message, retryable))
}

fn invalid_import_selection() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::SshConfigImportSelectionInvalid,
        "所选连接已发生变化，请返回预览后重试",
        false,
    ))
}

fn expired_import_preview() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::SshConfigImportSelectionInvalid,
        "SSH Config 导入预览已失效，请重新选择配置文件",
        false,
    ))
}

impl From<IdentityFileStatus> for SshConfigIdentityStatusDto {
    fn from(value: IdentityFileStatus) -> Self {
        match value {
            IdentityFileStatus::Available => Self::Available,
            IdentityFileStatus::Unavailable => Self::Unavailable,
            IdentityFileStatus::TooLarge => Self::TooLarge,
            IdentityFileStatus::DynamicPath => Self::DynamicPath,
        }
    }
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
            jump_profile_ids: value.jump_profile_ids,
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
            jump_profile_ids: profile
                .jump_profile_ids()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect(),
        }
    }
}

impl From<JumpCandidate> for JumpCandidateDto {
    fn from(candidate: JumpCandidate) -> Self {
        let (reason_code, reason) = candidate
            .error
            .map(jump_candidate_reason)
            .map(|(code, message)| (Some(code), Some(message)))
            .unwrap_or((None, None));
        Self {
            profile: ProfileDto::from(&candidate.profile),
            selectable: reason.is_none(),
            reason_code,
            reason,
            uses_credential: candidate.uses_credential,
            route_names: candidate.route,
        }
    }
}

fn jump_candidate_reason(error: JumpRouteError) -> (&'static str, &'static str) {
    match error {
        JumpRouteError::SelfReference => ("selfReference", "当前连接不能作为自己的跳板"),
        JumpRouteError::TooDeep => ("tooDeep", "连接路径最多支持 4 个跳板节点"),
        JumpRouteError::MissingProfile => ("missingProfile", "该连接的跳板引用已经失效"),
        JumpRouteError::ManualAuthentication => (
            "manualAuthentication",
            "该连接需要每次手动认证，不能作为中间节点",
        ),
        JumpRouteError::MissingCredential => (
            "missingCredential",
            "该连接未关联可用凭证，不能作为中间节点",
        ),
        JumpRouteError::DuplicateProfile => ("duplicateProfile", "该连接已经用于其他跃点"),
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
    use std::collections::{HashMap, HashSet};

    use serde_json::json;

    use super::{
        CreateProfileDto, ProfileDto, ProfileGroupDto, SshConfigCandidateDto, SshConfigIdentityDto,
        SshConfigIdentityStatusDto, SshConfigImportDto, SshConfigImportItemDto,
        SshConfigPreviewDto, allocate_import_name, imported_profile_input, preview_candidate_dtos,
        select_import_candidates,
    };
    use crate::domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    };
    use crate::infrastructure::{
        persistence::json_profile_repository::JsonProfileRepository,
        ssh::config_import::SshConfigCandidate,
    };
    use tempfile::tempdir;

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

        let profile = profile
            .with_group_id(Some(
                ProfileGroupId::parse("group-1").expect("fixture group id"),
            ))
            .with_jump_profile_ids(vec![
                ProfileId::parse("gateway-1").expect("jump id"),
                ProfileId::parse("gateway-2").expect("jump id"),
            ]);
        let value = serde_json::to_value(ProfileDto::from(&profile)).expect("serialize profile");
        let object = value.as_object().expect("profile object");
        assert_eq!(object.get("credentialId"), Some(&json!("credential-1")));
        assert_eq!(object.get("groupId"), Some(&json!("group-1")));
        assert_eq!(
            object.get("jumpProfileIds"),
            Some(&json!(["gateway-1", "gateway-2"]))
        );
        for forbidden in ["password", "passphrase", "privateKeyData"] {
            assert!(!object.contains_key(forbidden));
        }
    }

    #[test]
    fn ssh_config_import_input_rejects_paths_and_key_material() {
        let safe = json!({
            "previewId": "preview-1",
            "items": [{
                "alias": "prod",
                "identityFileIndex": 0,
                "passphrase": "one-time-secret"
            }]
        });
        assert!(serde_json::from_value::<SshConfigImportDto>(safe).is_ok());

        for forbidden in ["privateKeyPath", "privateKeyData", "configPath", "groupId"] {
            let mut unsafe_input = json!({
                "previewId": "preview-1",
                "items": [{
                    "alias": "prod",
                    "identityFileIndex": 0,
                    "passphrase": null
                }]
            });
            unsafe_input
                .as_object_mut()
                .expect("input object")
                .insert(forbidden.to_owned(), json!("/Users/example/.ssh/config"));
            assert!(serde_json::from_value::<SshConfigImportDto>(unsafe_input).is_err());
        }
    }

    #[test]
    fn ssh_config_preview_exposes_only_private_key_metadata() {
        let value = serde_json::to_value(SshConfigPreviewDto {
            preview_id: "preview-1".into(),
            source_name: "config".into(),
            warnings: Vec::new(),
            candidates: vec![SshConfigCandidateDto {
                alias: "prod".into(),
                name: "prod".into(),
                host: "prod.example".into(),
                port: 22,
                username: "deploy".into(),
                already_imported: false,
                importable: true,
                identities: vec![SshConfigIdentityDto {
                    index: 0,
                    file_name: "id_ed25519".into(),
                    status: SshConfigIdentityStatusDto::Available,
                }],
                warnings: Vec::new(),
            }],
        })
        .expect("serialize preview");
        let encoded = value.to_string();
        assert!(encoded.contains("id_ed25519"));
        for forbidden in ["privateKeyPath", "privateKeyData", "/.ssh/"] {
            assert!(!encoded.contains(forbidden));
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

    #[test]
    fn ssh_config_source_is_retrievable_only_by_its_opaque_preview_id() {
        let dir = tempdir().expect("dir");
        let state = super::ProfileState::new(JsonProfileRepository::new(
            dir.path().join("connections.json"),
        ));
        let path = dir.path().join("selected-config");
        let preview_id = state.remember_ssh_config(path.clone(), dir.path().to_owned());

        assert_eq!(
            state.ssh_config_source(&preview_id).expect("source").0,
            path
        );
        let expired = serde_json::to_value(
            state
                .ssh_config_source("different-preview")
                .expect_err("different preview must expire"),
        )
        .expect("serialize expired preview error");
        assert_eq!(
            expired.get("message"),
            Some(&json!("SSH Config 导入预览已失效，请重新选择配置文件"))
        );
        let invalid = serde_json::to_value(super::invalid_import_selection())
            .expect("serialize invalid selection error");
        assert_eq!(
            invalid.get("message"),
            Some(&json!("所选连接已发生变化，请返回预览后重试"))
        );
        state.complete_ssh_config(&preview_id);
        assert!(state.ssh_config_source(&preview_id).is_err());
    }

    #[test]
    fn preview_keeps_same_endpoint_aliases_importable_and_allocates_unique_names() {
        let candidate = |alias: &str| SshConfigCandidate {
            alias: alias.into(),
            host: "10.100.5.28".into(),
            port: 22,
            username: "root".into(),
            identity_files: Vec::new(),
            warnings: Vec::new(),
        };

        let existing = ConnectionProfile::new(
            ProfileId::parse("existing-profile").expect("id"),
            "PROD",
            "different.example",
            22,
            "root",
            AuthPreference::Manual,
            None,
        )
        .expect("existing profile");
        let candidates =
            preview_candidate_dtos(&[existing], vec![candidate("prod"), candidate("PROD")]);

        assert!(candidates.iter().all(|candidate| candidate.importable));
        assert_eq!(candidates[0].name, "prod 1");
        assert_eq!(candidates[1].name, "PROD 2");
        assert!(candidates.iter().all(|candidate| {
            candidate
                .warnings
                .iter()
                .any(|warning| warning.contains("导入后将保存为"))
        }));
    }

    #[test]
    fn preview_marks_only_the_full_connection_identity_as_already_imported() {
        let candidate = |alias: &str| SshConfigCandidate {
            alias: alias.into(),
            host: "10.100.5.28".into(),
            port: 22,
            username: "root".into(),
            identity_files: Vec::new(),
            warnings: Vec::new(),
        };
        let existing = ConnectionProfile::new(
            ProfileId::parse("existing-profile").expect("id"),
            "company-odp2-28",
            "10.100.5.28",
            22,
            "root",
            AuthPreference::Manual,
            None,
        )
        .expect("existing profile");

        let candidates = preview_candidate_dtos(
            &[existing],
            vec![candidate("company-odp2-28"), candidate("test")],
        );

        assert!(candidates[0].already_imported);
        assert!(!candidates[0].importable);
        assert_eq!(candidates[0].name, "company-odp2-28");
        assert!(candidates[0].warnings.is_empty());
        assert!(!candidates[1].already_imported);
        assert!(candidates[1].importable);
        assert_eq!(candidates[1].name, "test");
    }

    #[test]
    fn allocated_import_names_reserve_suffix_space_within_profile_limit() {
        let long_name = "服".repeat(80);
        let mut used = HashSet::from([long_name.to_lowercase()]);

        let allocated = allocate_import_name(&long_name, &mut used);

        assert_eq!(allocated.chars().count(), 80);
        assert!(allocated.ends_with(" 1"));
    }

    #[test]
    fn commit_selection_accepts_all_aliases_that_share_an_endpoint() {
        let candidate = |alias: &str| SshConfigCandidate {
            alias: alias.into(),
            host: "10.100.5.28".into(),
            port: 22,
            username: "root".into(),
            identity_files: Vec::new(),
            warnings: Vec::new(),
        };
        let candidates = HashMap::from([
            ("company-odp2-28".into(), candidate("company-odp2-28")),
            ("test".into(), candidate("test")),
        ]);
        let items = vec![
            SshConfigImportItemDto {
                alias: "company-odp2-28".into(),
                identity_file_index: None,
                passphrase: None,
            },
            SshConfigImportItemDto {
                alias: "test".into(),
                identity_file_index: None,
                passphrase: None,
            },
        ];

        let existing = ConnectionProfile::new(
            ProfileId::parse("existing-profile").expect("id"),
            "saved-name",
            "10.100.5.28",
            22,
            "root",
            AuthPreference::Manual,
            None,
        )
        .expect("existing profile");
        let selected = select_import_candidates(items, &candidates, &[existing])
            .expect("same endpoint aliases should all remain importable");

        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].profile_name, "company-odp2-28");
        assert_eq!(selected[1].profile_name, "test");
    }

    #[test]
    fn commit_selection_rejects_an_already_imported_full_identity() {
        let candidate = SshConfigCandidate {
            alias: "prod".into(),
            host: "prod.example".into(),
            port: 22,
            username: "deploy".into(),
            identity_files: Vec::new(),
            warnings: Vec::new(),
        };
        let candidates = HashMap::from([("prod".into(), candidate)]);
        let existing = ConnectionProfile::new(
            ProfileId::parse("existing-profile").expect("id"),
            "PROD",
            "PROD.EXAMPLE",
            22,
            "deploy",
            AuthPreference::Manual,
            None,
        )
        .expect("existing profile");

        let result = select_import_candidates(
            vec![SshConfigImportItemDto {
                alias: "prod".into(),
                identity_file_index: None,
                passphrase: None,
            }],
            &candidates,
            &[existing],
        );

        assert!(result.is_err());
    }

    #[test]
    fn ssh_config_profiles_are_always_built_ungrouped() {
        let input = imported_profile_input(
            SshConfigCandidate {
                alias: "prod".into(),
                host: "prod.example".into(),
                port: 22,
                username: "deploy".into(),
                identity_files: Vec::new(),
                warnings: Vec::new(),
            },
            "prod".into(),
            None,
        );

        assert!(input.group_id.is_none());
    }
}
