use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::{
    ChangeMasterPasswordDto, ClearVaultDto, CommitPrivateKeyDto, CreatePasswordDto,
    CredentialIdDto, CredentialState, CredentialSummaryDto, FileOperationDto, MasterPasswordDto,
    PrepareGeneratedPrivateKeyDto, PrivateKeyDraftDto, PrivateKeyDraftIdDto, PrivateKeyPathDto,
    RenameCredentialDto, ResetMasterPasswordDto, VaultStatusDto, emit_status,
    recovery::{
        pick_recovery_open_path, pick_recovery_save_path, read_recovery_file,
        remove_uncommitted_recovery_file, write_recovery_file,
    },
};
use crate::{
    application::{credential_lifecycle::LockReason, credential_workflow::PendingRecoveryReset},
    commands::{error::IpcError, native_dialog, profile::ProfileState, settings::SettingsState},
    domain::{
        auth::SecretText,
        credential::{CredentialError, CredentialMaterial, RecoveryKeyFile},
    },
    infrastructure::ssh::auth::load_private_key_bytes,
};

pub(super) fn validate_clear_confirmation(confirmation: &str) -> Result<(), IpcError> {
    if confirmation == "确认清除" {
        Ok(())
    } else {
        Err(IpcError::from(CredentialError::InvalidCredential))
    }
}

#[tauri::command]
pub fn credential_vault_status(
    state: State<'_, CredentialState>,
) -> Result<VaultStatusDto, IpcError> {
    state
        .lifecycle
        .status()
        .map(|value| VaultStatusDto {
            initialized: value.initialized,
            unlocked: value.unlocked,
            legacy: value.legacy,
        })
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn credential_vault_initialize(
    input: MasterPasswordDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
    settings: State<'_, SettingsState>,
) -> Result<FileOperationDto, IpcError> {
    let Some(path) = pick_recovery_save_path(&app, "保存 Qterm 恢复密钥")
        .await
        .map_err(IpcError::from)?
    else {
        return Ok(FileOperationDto { completed: false });
    };
    let recovery = state
        .lifecycle
        .prepare_initial_recovery()
        .map_err(IpcError::from)?;
    let recovery_for_vault = RecoveryKeyFile::new(recovery.expose().to_vec());
    write_recovery_file(&path, &recovery).map_err(IpcError::from)?;
    let schedule = state
        .lifecycle
        .initialize(
            SecretText::new(input.master_password),
            recovery_for_vault,
            settings.security(),
        )
        .map_err(|error| {
            remove_uncommitted_recovery_file(&path);
            IpcError::from(error)
        })?;
    CredentialState::schedule(&app, schedule);
    Ok(FileOperationDto { completed: true })
}

#[tauri::command]
pub fn credential_vault_unlock(
    input: MasterPasswordDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
    settings: State<'_, SettingsState>,
) -> Result<(), IpcError> {
    let schedule = state
        .lifecycle
        .unlock(SecretText::new(input.master_password), settings.security())
        .map_err(IpcError::from)?;
    CredentialState::schedule(&app, schedule);
    Ok(())
}

#[tauri::command]
pub fn credential_vault_change_master_password(
    input: ChangeMasterPasswordDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
    settings: State<'_, SettingsState>,
) -> Result<(), IpcError> {
    let schedule = state
        .lifecycle
        .change_master_password(
            SecretText::new(input.old_password),
            SecretText::new(input.new_password),
            settings.security(),
        )
        .map_err(IpcError::from)?;
    CredentialState::schedule(&app, schedule);
    Ok(())
}

#[tauri::command]
pub async fn credential_vault_prepare_master_password_reset(
    app: AppHandle,
    state: State<'_, CredentialState>,
) -> Result<FileOperationDto, IpcError> {
    state.clear_pending_recovery_reset();
    let Some(current_path) = pick_recovery_open_path(&app)
        .await
        .map_err(IpcError::from)?
    else {
        return Ok(FileOperationDto { completed: false });
    };
    let current = read_recovery_file(&current_path).map_err(IpcError::from)?;
    let current_for_commit = RecoveryKeyFile::new(current.expose().to_vec());
    let replacement = state
        .lifecycle
        .prepare_recovery_reset(current)
        .map_err(IpcError::from)?;
    state.remember_pending_recovery_reset(PendingRecoveryReset {
        current: current_for_commit,
        replacement,
    });
    Ok(FileOperationDto { completed: true })
}

#[tauri::command]
pub fn credential_vault_cancel_master_password_reset(state: State<'_, CredentialState>) {
    state.clear_pending_recovery_reset();
}

#[tauri::command]
pub async fn credential_vault_reset_master_password(
    input: ResetMasterPasswordDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
    settings: State<'_, SettingsState>,
) -> Result<FileOperationDto, IpcError> {
    let Some(replacement_path) = pick_recovery_save_path(&app, "保存新的 Qterm 恢复密钥")
        .await
        .map_err(IpcError::from)?
    else {
        return Ok(FileOperationDto { completed: false });
    };
    let Some(pending) = state.take_pending_recovery_reset() else {
        return Err(IpcError::from(CredentialError::InvalidRecoveryFile));
    };
    if let Err(error) = write_recovery_file(&replacement_path, &pending.replacement) {
        state.remember_pending_recovery_reset(pending);
        return Err(IpcError::from(error));
    }
    let schedule = state
        .lifecycle
        .reset_master_password(
            pending.current,
            pending.replacement,
            SecretText::new(input.new_password),
            settings.security(),
        )
        .map_err(|error| {
            remove_uncommitted_recovery_file(&replacement_path);
            IpcError::from(error)
        })?;
    CredentialState::schedule(&app, schedule);
    Ok(FileOperationDto { completed: true })
}

#[tauri::command]
pub fn credential_vault_lock(app: AppHandle) {
    CredentialState::lock(&app, LockReason::Manual);
}

#[tauri::command]
pub fn credential_vault_clear(
    input: ClearVaultDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
    profiles: State<'_, ProfileState>,
) -> Result<(), IpcError> {
    validate_clear_confirmation(&input.confirmation)?;
    profiles.clear_all_credential_references()?;
    state.lifecycle.clear().map_err(IpcError::from)?;
    emit_status(&app, LockReason::Manual);
    Ok(())
}

#[tauri::command]
pub fn credential_list(
    state: State<'_, CredentialState>,
) -> Result<Vec<CredentialSummaryDto>, IpcError> {
    state
        .lifecycle
        .list()
        .map(|items| items.into_iter().map(CredentialSummaryDto::from).collect())
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn credential_create_password(
    input: CreatePasswordDto,
    state: State<'_, CredentialState>,
) -> Result<CredentialSummaryDto, IpcError> {
    state
        .lifecycle
        .create_password(input.name, SecretText::new(input.password))
        .map(CredentialSummaryDto::from)
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn credential_rename(
    input: RenameCredentialDto,
    state: State<'_, CredentialState>,
) -> Result<CredentialSummaryDto, IpcError> {
    state
        .lifecycle
        .rename(&input.credential_id, input.name)
        .map(CredentialSummaryDto::from)
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn credential_prepare_private_key(
    app: AppHandle,
    state: State<'_, CredentialState>,
) -> Result<Option<PrivateKeyDraftDto>, IpcError> {
    let Some(path) = native_dialog::pick_file(app.dialog().file().set_title("导入 SSH 私钥"))
        .await
        .and_then(|file| file.into_path().ok())
    else {
        return Ok(None);
    };
    state
        .prepare_private_key_path(&path)
        .map(PrivateKeyDraftDto::from)
        .map(Some)
}

#[tauri::command]
pub fn credential_prepare_private_key_path(
    input: PrivateKeyPathDto,
    state: State<'_, CredentialState>,
) -> Result<PrivateKeyDraftDto, IpcError> {
    state
        .prepare_private_key_path(Path::new(&input.path))
        .map(PrivateKeyDraftDto::from)
}

#[tauri::command]
pub fn credential_prepare_generated_private_key(
    input: PrepareGeneratedPrivateKeyDto,
    state: State<'_, CredentialState>,
) -> Result<PrivateKeyDraftDto, IpcError> {
    state
        .prepare_generated_private_key(input.algorithm.into(), input.comment)
        .map(PrivateKeyDraftDto::from)
}

#[tauri::command]
pub fn credential_commit_private_key(
    input: CommitPrivateKeyDto,
    state: State<'_, CredentialState>,
) -> Result<CredentialSummaryDto, IpcError> {
    state
        .commit_private_key(&input.draft_id, input.name, input.passphrase)
        .map(CredentialSummaryDto::from)
}

#[tauri::command]
pub fn credential_cancel_private_key(
    input: PrivateKeyDraftIdDto,
    state: State<'_, CredentialState>,
) {
    state.cancel_private_key(&input.draft_id);
}

#[tauri::command]
pub fn credential_reveal_password(
    input: CredentialIdDto,
    state: State<'_, CredentialState>,
) -> Result<String, IpcError> {
    match state
        .lifecycle
        .load(&input.credential_id)
        .map_err(IpcError::from)?
    {
        CredentialMaterial::Password(value) => Ok(value.expose().to_owned()),
        CredentialMaterial::PrivateKey { .. } => {
            Err(IpcError::from(CredentialError::InvalidCredential))
        }
    }
}

#[tauri::command]
pub fn credential_public_key(
    input: CredentialIdDto,
    state: State<'_, CredentialState>,
) -> Result<String, IpcError> {
    match state
        .lifecycle
        .load(&input.credential_id)
        .map_err(IpcError::from)?
    {
        CredentialMaterial::PrivateKey { data, passphrase } => {
            load_private_key_bytes(data.expose(), passphrase.as_ref())
                .and_then(|key| key.openssh_public_key())
                .map_err(crate::application::error::ApplicationError::from)
                .map_err(IpcError::from)
        }
        CredentialMaterial::Password(_) => Err(IpcError::from(CredentialError::InvalidCredential)),
    }
}

#[tauri::command]
pub fn credential_delete(
    input: CredentialIdDto,
    state: State<'_, CredentialState>,
    profiles: State<'_, ProfileState>,
) -> Result<(), IpcError> {
    state.ensure_exists(&input.credential_id)?;
    profiles.clear_credential_references(&input.credential_id)?;
    state
        .lifecycle
        .delete(&input.credential_id)
        .map_err(IpcError::from)
}
