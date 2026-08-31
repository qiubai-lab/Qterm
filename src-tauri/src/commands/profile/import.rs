use std::collections::{HashMap, HashSet};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use super::{
    ProfileState,
    dto::{
        SshConfigCandidateDto, SshConfigIdentityDto, SshConfigImportDto, SshConfigImportResultDto,
        SshConfigPreviewDto,
    },
};
use crate::{
    application::{
        error::{ApplicationError, ApplicationErrorCode},
        profile_service::ProfileInput,
        ssh_config_import::{
            ImportIdentity, ImportIdentityStatus, ImportedCredential, SshConfigCandidate,
            SshConfigImportCommitError, SshConfigImportCommitter, allocate_import_name,
            candidate_already_imported, commit_ssh_config_import,
        },
    },
    commands::{credential::CredentialState, error::IpcError, native_dialog},
    domain::profile::ConnectionProfile,
    infrastructure::ssh::config_import::{
        IdentityFileStatus, SshConfigCandidate as ParsedCandidate, SshConfigImportError,
        candidates_by_alias, parse_ssh_config,
    },
};

struct CommandImportCommitter<'a> {
    profiles: &'a ProfileState,
    credentials: &'a CredentialState,
}

impl SshConfigImportCommitter for CommandImportCommitter<'_> {
    type Error = IpcError;

    fn import_or_reuse_private_key(
        &mut self,
        name: String,
        path: &std::path::Path,
        passphrase: Option<String>,
    ) -> Result<ImportedCredential, Self::Error> {
        self.credentials
            .import_or_reuse_private_key_path(name, path, passphrase)
            .map(|outcome| ImportedCredential {
                id: outcome.summary.id.as_str().to_owned(),
                created: outcome.created,
            })
    }

    fn create_profiles(&mut self, inputs: Vec<ProfileInput>) -> Result<usize, Self::Error> {
        self.profiles
            .create_many(inputs)
            .map(|profiles| profiles.len())
    }

    fn rollback_credential(&mut self, credential_id: &str) {
        self.credentials.delete_imported_credential(credential_id);
    }
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
    let Some(path) = native_dialog::pick_file(picker)
        .await
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
    let candidates = preview_candidate_dtos(
        &existing,
        preview
            .candidates
            .into_iter()
            .map(import_candidate)
            .collect(),
    );
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
    let (config_path, home) = profiles.ssh_config_source(&input.preview_id)?;
    let preview = parse_ssh_config(&config_path, &home).map_err(ssh_config_error)?;
    let candidates = candidates_by_alias(preview)
        .into_iter()
        .map(|(alias, candidate)| (alias, import_candidate(candidate)))
        .collect::<HashMap<_, _>>();
    let existing = profiles.service.list().map_err(IpcError::from)?;
    let items = input.items.into_iter().map(Into::into).collect();
    let mut committer = CommandImportCommitter {
        profiles: &profiles,
        credentials: &credentials,
    };
    let outcome = commit_ssh_config_import(&existing, &candidates, items, &mut committer).map_err(
        |error| match error {
            SshConfigImportCommitError::InvalidSelection => invalid_import_selection(),
            SshConfigImportCommitError::Operation(error) => error,
        },
    )?;
    profiles.complete_ssh_config(&input.preview_id);
    Ok(outcome.into())
}

fn import_candidate(candidate: ParsedCandidate) -> SshConfigCandidate {
    SshConfigCandidate {
        alias: candidate.alias,
        host: candidate.host,
        port: candidate.port,
        username: candidate.username,
        identity_files: candidate
            .identity_files
            .into_iter()
            .map(|identity| {
                let reuse_key =
                    dunce::canonicalize(&identity.path).unwrap_or_else(|_| identity.path.clone());
                ImportIdentity {
                    index: identity.index,
                    path: identity.path,
                    reuse_key,
                    file_name: identity.file_name,
                    status: match identity.status {
                        IdentityFileStatus::Available => ImportIdentityStatus::Available,
                        IdentityFileStatus::Unavailable => ImportIdentityStatus::Unavailable,
                        IdentityFileStatus::TooLarge => ImportIdentityStatus::TooLarge,
                        IdentityFileStatus::DynamicPath => ImportIdentityStatus::DynamicPath,
                    },
                }
            })
            .collect(),
        warnings: candidate.warnings,
    }
}

pub(super) fn preview_candidate_dtos(
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

pub(super) fn invalid_import_selection() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::SshConfigImportSelectionInvalid,
        "所选连接已发生变化，请返回预览后重试",
        false,
    ))
}

pub(super) fn expired_import_preview() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::SshConfigImportSelectionInvalid,
        "SSH Config 导入预览已失效，请重新选择配置文件",
        false,
    ))
}
