use serde::{Deserialize, Serialize};

use qterm_core::{
    application::{
        profile_service::{JumpCandidate, ProfileGroupInput, ProfileInput},
        ssh_config_import::{ImportIdentityStatus, SshConfigImportItem, SshConfigImportOutcome},
    },
    domain::profile::{AuthPreference, ConnectionProfile, JumpRouteError, ProfileGroup},
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreateProfileDto {
    pub name: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub auth_preference: AuthPreferenceDto,
    pub credential_id: Option<String>,
    pub group_id: Option<String>,
    pub jump_profile_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthPreferenceDto {
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
    pub uses_credential: bool,
    pub route_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProfileGroupInputDto {
    pub name: String,
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
    pub index: u32,
    pub file_name: String,
    pub status: SshConfigIdentityStatusDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigCandidateDto {
    pub alias: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub already_imported: bool,
    pub importable: bool,
    pub identities: Vec<SshConfigIdentityDto>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigPreviewDto {
    pub preview_id: String,
    pub source_name: String,
    pub candidates: Vec<SshConfigCandidateDto>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SshConfigImportItemDto {
    pub alias: String,
    pub identity_file_index: Option<u32>,
    pub passphrase: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SshConfigImportDto {
    pub preview_id: String,
    pub items: Vec<SshConfigImportItemDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigImportResultDto {
    imported: usize,
    imported_private_keys: usize,
    reused_private_keys: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDeleteResultDto {
    pub deleted_network_rules: usize,
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
impl From<ImportIdentityStatus> for SshConfigIdentityStatusDto {
    fn from(value: ImportIdentityStatus) -> Self {
        match value {
            ImportIdentityStatus::Available => Self::Available,
            ImportIdentityStatus::Unavailable => Self::Unavailable,
            ImportIdentityStatus::TooLarge => Self::TooLarge,
            ImportIdentityStatus::DynamicPath => Self::DynamicPath,
        }
    }
}
impl From<SshConfigImportItemDto> for SshConfigImportItem {
    fn from(value: SshConfigImportItemDto) -> Self {
        Self {
            alias: value.alias,
            identity_file_index: value.identity_file_index,
            passphrase: value.passphrase,
        }
    }
}
impl From<SshConfigImportOutcome> for SshConfigImportResultDto {
    fn from(value: SshConfigImportOutcome) -> Self {
        Self {
            imported: value.imported,
            imported_private_keys: value.imported_private_keys,
            reused_private_keys: value.reused_private_keys,
        }
    }
}
