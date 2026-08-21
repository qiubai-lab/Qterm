use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use zeroize::Zeroizing;

use crate::{
    application::credential_lifecycle::{
        CredentialLifecycle, LockReason, LockSchedule, Reschedule,
    },
    commands::{error::IpcError, profile::ProfileState, settings::SettingsState},
    domain::{
        auth::{AuthRequest, SecretBytes, SecretText},
        credential::{
            CredentialError, CredentialKind, CredentialMaterial, CredentialSummary,
            GeneratedPrivateKeyAlgorithm, GeneratedPrivateKeyComment, RecoveryKeyFile,
        },
    },
    infrastructure::{
        persistence::json_credential_vault::JsonCredentialVault,
        ssh::auth::{generate_private_key_bytes, load_private_key_bytes},
    },
};

const MAX_PRIVATE_KEY_BYTES: u64 = 1024 * 1024;
const MAX_RECOVERY_FILE_BYTES: u64 = 4 * 1024;

pub struct CredentialState {
    lifecycle: CredentialLifecycle<JsonCredentialVault>,
    pending_recovery_reset: Mutex<Option<PendingRecoveryReset>>,
}

pub(crate) struct PrivateKeyImportOutcome {
    pub summary: CredentialSummary,
    pub created: bool,
}

struct PendingRecoveryReset {
    current: RecoveryKeyFile,
    replacement: RecoveryKeyFile,
}

impl CredentialState {
    pub fn new(vault: JsonCredentialVault) -> Self {
        Self {
            lifecycle: CredentialLifecycle::new(vault),
            pending_recovery_reset: Mutex::new(None),
        }
    }

    fn remember_pending_recovery_reset(&self, pending: PendingRecoveryReset) {
        *self
            .pending_recovery_reset
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pending);
    }

    fn take_pending_recovery_reset(&self) -> Option<PendingRecoveryReset> {
        self.pending_recovery_reset
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }

    fn clear_pending_recovery_reset(&self) {
        let _ = self.take_pending_recovery_reset();
    }
    pub(crate) fn resolve_auth(&self, credential_id: &str) -> Result<AuthRequest, IpcError> {
        match self.lifecycle.load(credential_id).map_err(IpcError::from)? {
            CredentialMaterial::Password(value) => Ok(AuthRequest::Password(value)),
            CredentialMaterial::PrivateKey { data, passphrase } => {
                Ok(AuthRequest::PrivateKeyData { data, passphrase })
            }
        }
    }

    pub(crate) fn import_private_key_path(
        &self,
        name: String,
        path: &Path,
        passphrase: Option<String>,
    ) -> Result<CredentialSummary, IpcError> {
        let bytes = read_private_key(path)?;
        self.import_private_key_bytes(name, bytes, passphrase)
    }

    fn import_private_key_bytes(
        &self,
        name: String,
        bytes: Zeroizing<Vec<u8>>,
        passphrase: Option<String>,
    ) -> Result<CredentialSummary, IpcError> {
        let passphrase = passphrase.map(SecretText::new);
        let loaded = load_private_key_bytes(&bytes, passphrase.as_ref())
            .map_err(crate::application::error::ApplicationError::from)?;
        let algorithm = private_key_algorithm_name(loaded.algorithm());
        self.lifecycle
            .import_private_key(
                name,
                SecretBytes::new(bytes.to_vec()),
                passphrase,
                algorithm.into(),
            )
            .map_err(IpcError::from)
    }

    pub(crate) fn generate_private_key(
        &self,
        name: String,
        algorithm: GeneratedPrivateKeyAlgorithm,
        comment: Option<String>,
    ) -> Result<CredentialSummary, IpcError> {
        let comment = GeneratedPrivateKeyComment::parse(comment).map_err(IpcError::from)?;
        let bytes = generate_private_key_bytes(algorithm, comment.as_str())
            .map_err(crate::application::error::ApplicationError::from)
            .map_err(IpcError::from)?;
        self.import_private_key_bytes(name, bytes, None)
    }

    pub(crate) fn import_or_reuse_private_key_path(
        &self,
        name: String,
        path: &Path,
        passphrase: Option<String>,
    ) -> Result<PrivateKeyImportOutcome, IpcError> {
        let bytes = read_private_key(path)?;
        let passphrase = passphrase.map(SecretText::new);
        let loaded = load_private_key_bytes(&bytes, passphrase.as_ref())
            .map_err(crate::application::error::ApplicationError::from)?;
        let public_key_fingerprint = loaded.public_key_fingerprint();

        for summary in self.lifecycle.list().map_err(IpcError::from)? {
            if summary.kind != CredentialKind::PrivateKey {
                continue;
            }
            let existing = self
                .lifecycle
                .load(summary.id.as_str())
                .map_err(IpcError::from)?;
            let CredentialMaterial::PrivateKey {
                data,
                passphrase: existing_passphrase,
            } = existing
            else {
                continue;
            };
            let Ok(existing_key) =
                load_private_key_bytes(data.expose(), existing_passphrase.as_ref())
            else {
                continue;
            };
            if existing_key.public_key_fingerprint() == public_key_fingerprint {
                return Ok(PrivateKeyImportOutcome {
                    summary,
                    created: false,
                });
            }
        }

        let algorithm = private_key_algorithm_name(loaded.algorithm());
        let summary = self
            .lifecycle
            .import_private_key(
                name,
                SecretBytes::new(bytes.to_vec()),
                passphrase,
                algorithm.into(),
            )
            .map_err(IpcError::from)?;
        Ok(PrivateKeyImportOutcome {
            summary,
            created: true,
        })
    }

    pub(crate) fn delete_imported_credential(&self, credential_id: &str) {
        let _ = self.lifecycle.delete(credential_id);
    }

    fn ensure_exists(&self, credential_id: &str) -> Result<(), IpcError> {
        if self
            .lifecycle
            .list()
            .map_err(IpcError::from)?
            .iter()
            .any(|item| item.id.as_str() == credential_id)
        {
            Ok(())
        } else {
            Err(IpcError::from(
                crate::domain::credential::CredentialError::CredentialNotFound,
            ))
        }
    }

    pub(crate) fn schedule(app: &AppHandle, schedule: Option<LockSchedule>) {
        let Some(schedule) = schedule else { return };
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(schedule.delay).await;
            let state = app.state::<CredentialState>();
            if state.lifecycle.lock_if_generation(schedule.generation) {
                emit_status(&app, LockReason::Timeout);
            }
        });
    }

    pub(crate) fn lock(app: &AppHandle, reason: LockReason) -> bool {
        let state = app.state::<CredentialState>();
        let changed = state.lifecycle.lock(reason);
        if changed {
            emit_status(app, reason);
        }
        changed
    }

    pub(crate) fn reschedule(app: &AppHandle, settings: crate::domain::settings::SecuritySettings) {
        let state = app.state::<CredentialState>();
        match state.lifecycle.reschedule(settings) {
            Reschedule::None => {}
            Reschedule::Schedule(schedule) => Self::schedule(app, Some(schedule)),
            Reschedule::LockNow => {
                Self::lock(app, LockReason::Timeout);
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MasterPasswordDto {
    master_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ChangeMasterPasswordDto {
    old_password: String,
    new_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ResetMasterPasswordDto {
    new_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ClearVaultDto {
    confirmation: String,
}

fn validate_clear_confirmation(confirmation: &str) -> Result<(), IpcError> {
    if confirmation == "确认清除" {
        Ok(())
    } else {
        Err(IpcError::from(
            crate::domain::credential::CredentialError::InvalidCredential,
        ))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreatePasswordDto {
    name: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ImportPrivateKeyDto {
    name: String,
    passphrase: Option<String>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum GeneratePrivateKeyAlgorithmDto {
    Ed25519,
    EcdsaP256,
}

impl From<GeneratePrivateKeyAlgorithmDto> for GeneratedPrivateKeyAlgorithm {
    fn from(value: GeneratePrivateKeyAlgorithmDto) -> Self {
        match value {
            GeneratePrivateKeyAlgorithmDto::Ed25519 => Self::Ed25519,
            GeneratePrivateKeyAlgorithmDto::EcdsaP256 => Self::EcdsaP256,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeneratePrivateKeyDto {
    name: String,
    algorithm: GeneratePrivateKeyAlgorithmDto,
    comment: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CredentialIdDto {
    credential_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusDto {
    initialized: bool,
    unlocked: bool,
    legacy: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationDto {
    completed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatusChangedDto {
    unlocked: bool,
    reason: &'static str,
}

fn emit_status(app: &AppHandle, reason: LockReason) {
    let _ = app.emit(
        "credential-vault-status-changed",
        VaultStatusChangedDto {
            unlocked: false,
            reason: reason.as_str(),
        },
    );
}

async fn wait_for_dialog_result<T, F>(show: F) -> Result<T, CredentialError>
where
    T: Send + 'static,
    F: FnOnce(Box<dyn FnOnce(T) + Send>),
{
    let (sender, receiver) = oneshot::channel();
    show(Box::new(move |result| {
        let _ = sender.send(result);
    }));
    receiver
        .await
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)
}

async fn pick_recovery_save_path(
    app: &AppHandle,
    title: &str,
) -> Result<Option<PathBuf>, CredentialError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());
    let dialog = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(recovery_file_name(timestamp))
        .add_filter("Qterm 恢复密钥", &["key"]);
    wait_for_dialog_result(move |complete| dialog.save_file(complete))
        .await
        .map(|file| file.and_then(|value| value.into_path().ok()))
}

async fn pick_recovery_open_path(app: &AppHandle) -> Result<Option<PathBuf>, CredentialError> {
    let dialog = app
        .dialog()
        .file()
        .set_title("选择 Qterm 恢复密钥")
        .add_filter("Qterm 恢复密钥", &["key"]);
    wait_for_dialog_result(move |complete| dialog.pick_file(complete))
        .await
        .map(|file| file.and_then(|value| value.into_path().ok()))
}

fn recovery_file_name(timestamp: u64) -> String {
    format!("qterm-recovery-{timestamp}.key")
}

fn recovery_file_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

fn write_recovery_file(path: &Path, recovery: &RecoveryKeyFile) -> Result<(), CredentialError> {
    let mut file = recovery_file_options()
        .open(path)
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    let result = file
        .write_all(recovery.expose())
        .and_then(|()| file.sync_all())
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable);
    drop(file);
    if result.is_err() {
        remove_uncommitted_recovery_file(path);
    }
    result
}

fn read_recovery_file(path: &Path) -> Result<RecoveryKeyFile, CredentialError> {
    let file = File::open(path).map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    let metadata = file
        .metadata()
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_RECOVERY_FILE_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_RECOVERY_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| CredentialError::RecoveryFileStorageUnavailable)?;
    if bytes.len() as u64 > MAX_RECOVERY_FILE_BYTES {
        return Err(CredentialError::InvalidRecoveryFile);
    }
    Ok(RecoveryKeyFile::new(bytes.to_vec()))
}

fn remove_uncommitted_recovery_file(path: &Path) {
    let _ = fs::remove_file(path);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSummaryDto {
    id: String,
    name: String,
    kind: &'static str,
    detail: Option<String>,
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
pub async fn credential_import_private_key(
    input: ImportPrivateKeyDto,
    app: AppHandle,
    state: State<'_, CredentialState>,
) -> Result<Option<CredentialSummaryDto>, IpcError> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title("导入 SSH 私钥")
        .blocking_pick_file()
        .and_then(|file| file.into_path().ok())
    else {
        return Ok(None);
    };
    state
        .import_private_key_path(input.name, &path, input.passphrase)
        .map(CredentialSummaryDto::from)
        .map(Some)
}

#[tauri::command]
pub fn credential_generate_private_key(
    input: GeneratePrivateKeyDto,
    state: State<'_, CredentialState>,
) -> Result<CredentialSummaryDto, IpcError> {
    state
        .generate_private_key(input.name, input.algorithm.into(), input.comment)
        .map(CredentialSummaryDto::from)
}

fn read_private_key(path: &Path) -> Result<Zeroizing<Vec<u8>>, IpcError> {
    let file = File::open(path).map_err(|_| {
        crate::application::error::ApplicationError::from(
            crate::domain::auth::AuthFailure::KeyUnreadable,
        )
    })?;
    let metadata = file.metadata().map_err(|_| {
        crate::application::error::ApplicationError::from(
            crate::domain::auth::AuthFailure::KeyUnreadable,
        )
    })?;
    if !metadata.is_file() || metadata.len() > MAX_PRIVATE_KEY_BYTES {
        return Err(IpcError::from(
            crate::application::error::ApplicationError::from(
                crate::domain::auth::AuthFailure::KeyTooLarge,
            ),
        ));
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_PRIVATE_KEY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            crate::application::error::ApplicationError::from(
                crate::domain::auth::AuthFailure::KeyUnreadable,
            )
        })?;
    if bytes.len() as u64 > MAX_PRIVATE_KEY_BYTES {
        return Err(IpcError::from(
            crate::application::error::ApplicationError::from(
                crate::domain::auth::AuthFailure::KeyTooLarge,
            ),
        ));
    }
    Ok(bytes)
}

fn private_key_algorithm_name(algorithm: crate::domain::auth::PrivateKeyAlgorithm) -> &'static str {
    match algorithm {
        crate::domain::auth::PrivateKeyAlgorithm::Ed25519 => "ed25519",
        crate::domain::auth::PrivateKeyAlgorithm::EcdsaP256 => "ecdsa-p256",
        crate::domain::auth::PrivateKeyAlgorithm::EcdsaP384 => "ecdsa-p384",
        crate::domain::auth::PrivateKeyAlgorithm::EcdsaP521 => "ecdsa-p521",
    }
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
        CredentialMaterial::PrivateKey { .. } => Err(IpcError::from(
            crate::domain::credential::CredentialError::InvalidCredential,
        )),
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
        CredentialMaterial::Password(_) => Err(IpcError::from(
            crate::domain::credential::CredentialError::InvalidCredential,
        )),
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

impl From<crate::domain::credential::CredentialSummary> for CredentialSummaryDto {
    fn from(value: crate::domain::credential::CredentialSummary) -> Self {
        Self {
            id: value.id.as_str().into(),
            name: value.name,
            kind: match value.kind {
                CredentialKind::Password => "password",
                CredentialKind::PrivateKey => "privateKey",
            },
            detail: value.detail,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ClearVaultDto, CreatePasswordDto, CredentialState, GeneratePrivateKeyDto,
        ImportPrivateKeyDto, PendingRecoveryReset, ResetMasterPasswordDto, read_recovery_file,
        recovery_file_name, validate_clear_confirmation, wait_for_dialog_result,
        write_recovery_file,
    };
    use crate::domain::{
        auth::SecretText,
        credential::{CredentialError, RecoveryKeyFile},
        settings::SecuritySettings,
    };
    use crate::infrastructure::persistence::json_credential_vault::JsonCredentialVault;
    use russh::keys::ssh_key::{
        LineEnding, PrivateKey,
        private::{Ed25519Keypair, KeypairData},
    };
    use serde_json::json;
    use tempfile::tempdir;
    #[test]
    fn secret_inputs_reject_unknown_fields() {
        assert!(
            serde_json::from_value::<CreatePasswordDto>(
                json!({"name":"prod","password":"secret","privateKey":"forbidden"})
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<ImportPrivateKeyDto>(
                json!({"name":"key","passphrase":null,"path":"forbidden"})
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<GeneratePrivateKeyDto>(json!({
                "name": "generated",
                "algorithm": "rsa",
                "comment": null
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<GeneratePrivateKeyDto>(json!({
                "name": "generated",
                "algorithm": "ed25519",
                "comment": null,
                "privateKey": "forbidden"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<ClearVaultDto>(json!({
                "confirmation": "确认清除",
                "password": "forbidden"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<ResetMasterPasswordDto>(json!({
                "newPassword": "new-master-password",
                "recoveryKey": "forbidden"
            }))
            .is_err()
        );
        assert!(validate_clear_confirmation("确认清除").is_ok());
        assert!(validate_clear_confirmation(" 确认清除").is_err());
        assert!(validate_clear_confirmation("确认").is_err());
    }

    #[test]
    fn recovery_files_are_created_once_and_read_with_a_strict_size_limit() {
        let dir = tempdir().expect("dir");
        let path = dir.path().join("recovery.key");
        let recovery = RecoveryKeyFile::new(br#"{"schemaVersion":1}"#.to_vec());
        write_recovery_file(&path, &recovery).expect("write");
        assert_eq!(
            read_recovery_file(&path).expect("read").expose(),
            recovery.expose()
        );
        assert_eq!(
            write_recovery_file(&path, &recovery),
            Err(CredentialError::RecoveryFileStorageUnavailable)
        );

        let oversized = dir.path().join("oversized.key");
        std::fs::write(&oversized, vec![0; 4 * 1024 + 1]).expect("fixture");
        assert!(matches!(
            read_recovery_file(&oversized),
            Err(CredentialError::InvalidRecoveryFile)
        ));
    }

    #[test]
    fn recovery_file_name_uses_only_the_qterm_prefix_and_timestamp() {
        assert_eq!(
            recovery_file_name(1_787_136_000),
            "qterm-recovery-1787136000.key"
        );
    }

    #[tokio::test]
    async fn dialog_result_bridge_handles_selection_and_cancellation() {
        let selected = wait_for_dialog_result(|complete| complete(Some("recovery.key")))
            .await
            .expect("selected result");
        assert_eq!(selected, Some("recovery.key"));

        let cancelled = wait_for_dialog_result(|complete| complete(None::<&str>))
            .await
            .expect("cancelled result");
        assert_eq!(cancelled, None);
    }

    #[tokio::test]
    async fn dialog_result_bridge_reports_a_dropped_callback() {
        let result = wait_for_dialog_result::<Option<&str>, _>(drop).await;
        assert_eq!(result, Err(CredentialError::RecoveryFileStorageUnavailable));
    }

    #[test]
    fn pending_recovery_material_is_consumed_or_explicitly_cleared() {
        let dir = tempdir().expect("dir");
        let state = CredentialState::new(JsonCredentialVault::new(dir.path().join("vault.json")));
        state.remember_pending_recovery_reset(PendingRecoveryReset {
            current: RecoveryKeyFile::new(vec![1]),
            replacement: RecoveryKeyFile::new(vec![2]),
        });
        let pending = state.take_pending_recovery_reset().expect("pending");
        assert_eq!(pending.current.expose(), &[1]);
        assert_eq!(pending.replacement.expose(), &[2]);
        assert!(state.take_pending_recovery_reset().is_none());

        state.remember_pending_recovery_reset(PendingRecoveryReset {
            current: RecoveryKeyFile::new(vec![3]),
            replacement: RecoveryKeyFile::new(vec![4]),
        });
        state.clear_pending_recovery_reset();
        assert!(state.take_pending_recovery_reset().is_none());
    }

    #[test]
    fn ssh_config_import_reuses_public_key_identity_not_credential_name() {
        let dir = tempdir().expect("dir");
        let state = CredentialState::new(JsonCredentialVault::new_for_test(
            dir.path().join("vault.json"),
        ));
        let recovery = state
            .lifecycle
            .prepare_initial_recovery()
            .expect("recovery");
        state
            .lifecycle
            .initialize(
                SecretText::new("correct-master-password".into()),
                recovery,
                SecuritySettings::default(),
            )
            .expect("initialize");

        let first_path = dir.path().join("first-key");
        let same_key_path = dir.path().join("same-key-different-comment");
        let second_path = dir.path().join("second-key");
        for (path, seed, comment) in [
            (&first_path, 7_u8, "first-comment"),
            (&same_key_path, 7_u8, "different-comment"),
            (&second_path, 8_u8, "first-comment"),
        ] {
            let pair = Ed25519Keypair::from_seed(&[seed; 32]);
            let key = PrivateKey::new(KeypairData::from(pair), comment)
                .expect("private key")
                .to_openssh(LineEnding::LF)
                .expect("encode key");
            std::fs::write(path, key.as_bytes()).expect("write key");
        }

        let original = state
            .import_private_key_path("同名凭证".into(), &first_path, None)
            .expect("initial import");
        let reused = state
            .import_or_reuse_private_key_path("另一个名称".into(), &same_key_path, None)
            .expect("reuse same public key");
        let distinct = state
            .import_or_reuse_private_key_path("同名凭证".into(), &second_path, None)
            .expect("import different public key");

        assert!(!reused.created);
        assert_eq!(reused.summary.id, original.id);
        assert!(distinct.created);
        assert_ne!(distinct.summary.id, original.id);
        assert_eq!(distinct.summary.name, "同名凭证");
    }
}
