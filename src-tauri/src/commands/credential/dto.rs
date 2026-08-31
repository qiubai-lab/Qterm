use serde::{Deserialize, Serialize};

use crate::{
    application::credential_workflow::{PendingPrivateKeySource, PendingPrivateKeySummary},
    domain::credential::{CredentialKind, CredentialSummary, GeneratedPrivateKeyAlgorithm},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MasterPasswordDto {
    pub(super) master_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ChangeMasterPasswordDto {
    pub(super) old_password: String,
    pub(super) new_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ResetMasterPasswordDto {
    pub(super) new_password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ClearVaultDto {
    pub(super) confirmation: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreatePasswordDto {
    pub(super) name: String,
    pub(super) password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RenameCredentialDto {
    pub(super) credential_id: String,
    pub(super) name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PrivateKeyPathDto {
    pub(super) path: String,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum GeneratePrivateKeyAlgorithmDto {
    Ed25519,
    EcdsaP256,
    EcdsaP384,
    EcdsaP521,
}

impl From<GeneratePrivateKeyAlgorithmDto> for GeneratedPrivateKeyAlgorithm {
    fn from(value: GeneratePrivateKeyAlgorithmDto) -> Self {
        match value {
            GeneratePrivateKeyAlgorithmDto::Ed25519 => Self::Ed25519,
            GeneratePrivateKeyAlgorithmDto::EcdsaP256 => Self::EcdsaP256,
            GeneratePrivateKeyAlgorithmDto::EcdsaP384 => Self::EcdsaP384,
            GeneratePrivateKeyAlgorithmDto::EcdsaP521 => Self::EcdsaP521,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PrepareGeneratedPrivateKeyDto {
    pub(super) algorithm: GeneratePrivateKeyAlgorithmDto,
    pub(super) comment: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CommitPrivateKeyDto {
    pub(super) draft_id: String,
    pub(super) name: String,
    pub(super) passphrase: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PrivateKeyDraftIdDto {
    pub(super) draft_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateKeyDraftDto {
    id: String,
    source: &'static str,
    label: String,
    detail: String,
}

impl From<PendingPrivateKeySummary> for PrivateKeyDraftDto {
    fn from(value: PendingPrivateKeySummary) -> Self {
        Self {
            id: value.id,
            source: if value.source == PendingPrivateKeySource::File {
                "file"
            } else {
                "generated"
            },
            label: value.label,
            detail: value.detail,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CredentialIdDto {
    pub(super) credential_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusDto {
    pub(super) initialized: bool,
    pub(super) unlocked: bool,
    pub(super) legacy: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationDto {
    pub(super) completed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSummaryDto {
    id: String,
    name: String,
    kind: &'static str,
    detail: Option<String>,
}

impl From<CredentialSummary> for CredentialSummaryDto {
    fn from(value: CredentialSummary) -> Self {
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
