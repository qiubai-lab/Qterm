mod commands;
mod dto;
mod files;
mod recovery;
#[cfg(test)]
mod tests;

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use zeroize::Zeroizing;

pub use commands::*;
pub use dto::*;

use crate::{
    application::{
        credential_lifecycle::{CredentialLifecycle, LockReason, LockSchedule, Reschedule},
        credential_workflow::{
            CredentialWorkflowState, PendingPrivateKeySource, PendingPrivateKeySummary,
            PendingRecoveryReset,
        },
    },
    commands::error::IpcError,
    domain::{
        auth::{AuthRequest, SecretBytes, SecretText},
        credential::{
            CredentialError, CredentialKind, CredentialMaterial, CredentialSummary,
            GeneratedPrivateKeyAlgorithm, GeneratedPrivateKeyComment,
        },
    },
    infrastructure::{
        persistence::json_credential_vault::JsonCredentialVault,
        ssh::auth::{generate_private_key_bytes, load_private_key_bytes},
    },
};
use files::{private_key_algorithm_name, read_private_key};

pub struct CredentialState {
    lifecycle: CredentialLifecycle<JsonCredentialVault>,
    workflow: CredentialWorkflowState,
}

pub(crate) struct PrivateKeyImportOutcome {
    pub summary: CredentialSummary,
    pub created: bool,
}

impl CredentialState {
    pub fn new(vault: JsonCredentialVault) -> Self {
        Self {
            lifecycle: CredentialLifecycle::new(vault),
            workflow: CredentialWorkflowState::default(),
        }
    }

    fn remember_pending_recovery_reset(&self, pending: PendingRecoveryReset) {
        self.workflow.remember_recovery_reset(pending);
    }
    fn take_pending_recovery_reset(&self) -> Option<PendingRecoveryReset> {
        self.workflow.take_recovery_reset()
    }
    fn clear_pending_recovery_reset(&self) {
        self.workflow.clear_recovery_reset();
    }
    fn remember_private_key(
        &self,
        source: PendingPrivateKeySource,
        label: String,
        detail: String,
        bytes: Zeroizing<Vec<u8>>,
    ) -> PendingPrivateKeySummary {
        self.workflow
            .remember_private_key(source, label, detail, bytes)
    }
    fn prepare_private_key_path(&self, path: &Path) -> Result<PendingPrivateKeySummary, IpcError> {
        let bytes = read_private_key(path)?;
        let label = path
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("私钥文件")
            .to_owned();
        Ok(self.remember_private_key(
            PendingPrivateKeySource::File,
            label,
            "本地私钥文件".into(),
            bytes,
        ))
    }
    fn prepare_generated_private_key(
        &self,
        algorithm: GeneratedPrivateKeyAlgorithm,
        comment: Option<String>,
    ) -> Result<PendingPrivateKeySummary, IpcError> {
        let comment = GeneratedPrivateKeyComment::parse(comment).map_err(IpcError::from)?;
        let bytes = generate_private_key_bytes(algorithm, comment.as_str())
            .map_err(crate::application::error::ApplicationError::from)
            .map_err(IpcError::from)?;
        let label = match algorithm {
            GeneratedPrivateKeyAlgorithm::Ed25519 => "Ed25519",
            GeneratedPrivateKeyAlgorithm::EcdsaP256 => "ECDSA P-256",
            GeneratedPrivateKeyAlgorithm::EcdsaP384 => "ECDSA P-384",
            GeneratedPrivateKeyAlgorithm::EcdsaP521 => "ECDSA P-521",
        };
        Ok(self.remember_private_key(
            PendingPrivateKeySource::Generated,
            label.into(),
            "已在 Rust 后端生成，尚未保存".into(),
            bytes,
        ))
    }
    fn commit_private_key(
        &self,
        draft_id: &str,
        name: String,
        passphrase: Option<String>,
    ) -> Result<CredentialSummary, IpcError> {
        let (source, bytes) = self
            .workflow
            .private_key(draft_id)
            .ok_or_else(|| IpcError::from(CredentialError::InvalidCredential))?;
        let summary = self.import_private_key_bytes(
            name,
            bytes,
            if source == PendingPrivateKeySource::File {
                passphrase
            } else {
                None
            },
        )?;
        self.workflow.complete_private_key(draft_id);
        Ok(summary)
    }
    fn cancel_private_key(&self, draft_id: &str) {
        self.workflow.complete_private_key(draft_id);
    }

    pub(crate) fn resolve_auth(&self, credential_id: &str) -> Result<AuthRequest, IpcError> {
        match self.lifecycle.load(credential_id).map_err(IpcError::from)? {
            CredentialMaterial::Password(value) => Ok(AuthRequest::Password(value)),
            CredentialMaterial::PrivateKey { data, passphrase } => {
                Ok(AuthRequest::PrivateKeyData { data, passphrase })
            }
        }
    }

    #[cfg(test)]
    fn import_private_key_path(
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
            Err(IpcError::from(CredentialError::CredentialNotFound))
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
