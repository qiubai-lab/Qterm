use serde::Serialize;

use crate::application::error::{ApplicationError, ApplicationErrorCode};
use crate::domain::credential::CredentialError;
use crate::domain::settings::SettingsError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    code: &'static str,
    message: &'static str,
    retryable: bool,
}

impl From<ApplicationError> for IpcError {
    fn from(error: ApplicationError) -> Self {
        Self {
            code: error_code(error.code()),
            message: error.message(),
            retryable: error.retryable(),
        }
    }
}

impl From<CredentialError> for IpcError {
    fn from(error: CredentialError) -> Self {
        Self::from(ApplicationError::from(error))
    }
}

impl From<SettingsError> for IpcError {
    fn from(error: SettingsError) -> Self {
        match error {
            SettingsError::InvalidAutoLockDuration => Self {
                code: "invalidAutoLockDuration",
                message: "自动锁定时长必须在 60 到 86400 秒之间",
                retryable: false,
            },
            SettingsError::InvalidDataDirectory => Self {
                code: "invalidDataDirectory",
                message: "数据存储位置必须是绝对路径、~ 或 ~/ 下的路径",
                retryable: false,
            },
            SettingsError::Corrupt => Self {
                code: "settingsCorrupt",
                message: "设置文件已损坏，已采用安全默认值且未覆盖原文件",
                retryable: false,
            },
            SettingsError::UnsupportedVersion => Self {
                code: "settingsVersionUnsupported",
                message: "设置文件版本暂不受支持，已采用安全默认值",
                retryable: false,
            },
            SettingsError::StorageUnavailable => Self {
                code: "settingsStorageUnavailable",
                message: "暂时无法访问设置文件",
                retryable: true,
            },
        }
    }
}

fn error_code(code: ApplicationErrorCode) -> &'static str {
    match code {
        ApplicationErrorCode::InvalidProfileId => "invalidProfileId",
        ApplicationErrorCode::InvalidProfileGroupId => "invalidProfileGroupId",
        ApplicationErrorCode::InvalidProfileGroupName => "invalidProfileGroupName",
        ApplicationErrorCode::InvalidProfileName => "invalidProfileName",
        ApplicationErrorCode::InvalidProfileHost => "invalidProfileHost",
        ApplicationErrorCode::InvalidProfilePort => "invalidProfilePort",
        ApplicationErrorCode::InvalidProfileUsername => "invalidProfileUsername",
        ApplicationErrorCode::ProfileAlreadyExists => "profileAlreadyExists",
        ApplicationErrorCode::ProfileNotFound => "profileNotFound",
        ApplicationErrorCode::ProfileGroupAlreadyExists => "profileGroupAlreadyExists",
        ApplicationErrorCode::ProfileGroupNotFound => "profileGroupNotFound",
        ApplicationErrorCode::ProfileStorageCorrupt => "profileStorageCorrupt",
        ApplicationErrorCode::ProfileStorageVersionUnsupported => {
            "profileStorageVersionUnsupported"
        }
        ApplicationErrorCode::ProfileStorageContainsSensitiveData => {
            "profileStorageContainsSensitiveData"
        }
        ApplicationErrorCode::ProfileStorageUnavailable => "profileStorageUnavailable",
        ApplicationErrorCode::SshConfigNotFound => "sshConfigNotFound",
        ApplicationErrorCode::SshConfigUnreadable => "sshConfigUnreadable",
        ApplicationErrorCode::SshConfigTooLarge => "sshConfigTooLarge",
        ApplicationErrorCode::SshConfigInvalid => "sshConfigInvalid",
        ApplicationErrorCode::SshConfigImportSelectionInvalid => "sshConfigImportSelectionInvalid",
        ApplicationErrorCode::InvalidNetworkRule => "invalidNetworkRule",
        ApplicationErrorCode::NetworkRuleAlreadyExists => "networkRuleAlreadyExists",
        ApplicationErrorCode::NetworkRuleNotFound => "networkRuleNotFound",
        ApplicationErrorCode::NetworkStorageCorrupt => "networkStorageCorrupt",
        ApplicationErrorCode::NetworkStorageVersionUnsupported => {
            "networkStorageVersionUnsupported"
        }
        ApplicationErrorCode::NetworkStorageContainsSensitiveData => {
            "networkStorageContainsSensitiveData"
        }
        ApplicationErrorCode::NetworkStorageUnavailable => "networkStorageUnavailable",
        ApplicationErrorCode::NetworkForwardUnavailable => "networkForwardUnavailable",
        ApplicationErrorCode::InvalidCredentials => "invalidCredentials",
        ApplicationErrorCode::AuthenticationMethodDisabled => "authenticationMethodDisabled",
        ApplicationErrorCode::PrivateKeyMissing => "privateKeyMissing",
        ApplicationErrorCode::PrivateKeyUnreadable => "privateKeyUnreadable",
        ApplicationErrorCode::PrivateKeyTooLarge => "privateKeyTooLarge",
        ApplicationErrorCode::PrivateKeyEncrypted => "privateKeyEncrypted",
        ApplicationErrorCode::InvalidKeyPassphrase => "invalidKeyPassphrase",
        ApplicationErrorCode::UnsupportedPrivateKey => "unsupportedPrivateKey",
        ApplicationErrorCode::CorruptPrivateKey => "corruptPrivateKey",
        ApplicationErrorCode::SshAgentUnavailable => "sshAgentUnavailable",
        ApplicationErrorCode::SshAgentEmpty => "sshAgentEmpty",
        ApplicationErrorCode::SshAgentRejected => "sshAgentRejected",
        ApplicationErrorCode::AuthenticationRejected => "authenticationRejected",
        ApplicationErrorCode::SshConnectionFailed => "sshConnectionFailed",
        ApplicationErrorCode::InvalidSessionTarget => "invalidSessionTarget",
        ApplicationErrorCode::SessionNotFound => "sessionNotFound",
        ApplicationErrorCode::SessionNotConnected => "sessionNotConnected",
        ApplicationErrorCode::InvalidTerminalInput => "invalidTerminalInput",
        ApplicationErrorCode::TerminalBusy => "terminalBusy",
        ApplicationErrorCode::InvalidTransferPath => "invalidTransferPath",
        ApplicationErrorCode::TransferPathNotSelected => "transferPathNotSelected",
        ApplicationErrorCode::TransferNotFound => "transferNotFound",
        ApplicationErrorCode::InvalidWorkspaceDocument => "invalidWorkspaceDocument",
        ApplicationErrorCode::WorkspaceStorageCorrupt => "workspaceStorageCorrupt",
        ApplicationErrorCode::WorkspaceStorageVersionUnsupported => {
            "workspaceStorageVersionUnsupported"
        }
        ApplicationErrorCode::WorkspaceStorageContainsSensitiveData => {
            "workspaceStorageContainsSensitiveData"
        }
        ApplicationErrorCode::WorkspaceStorageUnavailable => "workspaceStorageUnavailable",
        ApplicationErrorCode::HostKeyDecisionUnavailable => "hostKeyDecisionUnavailable",
        ApplicationErrorCode::KnownHostsUnavailable => "knownHostsUnavailable",
        ApplicationErrorCode::SessionAlreadyFinished => "sessionAlreadyFinished",
        ApplicationErrorCode::LocalShellUnavailable => "localShellUnavailable",
        ApplicationErrorCode::InvalidFilePath => "invalidFilePath",
        ApplicationErrorCode::DirectoryUnavailable => "directoryUnavailable",
        ApplicationErrorCode::FileUnavailable => "fileUnavailable",
        ApplicationErrorCode::FileTooLarge => "fileTooLarge",
        ApplicationErrorCode::FileNotUtf8 => "fileNotUtf8",
        ApplicationErrorCode::FileConflict => "fileConflict",
        ApplicationErrorCode::VaultInvalidMasterPassword => "vaultInvalidMasterPassword",
        ApplicationErrorCode::VaultWeakMasterPassword => "vaultWeakMasterPassword",
        ApplicationErrorCode::VaultAlreadyInitialized => "vaultAlreadyInitialized",
        ApplicationErrorCode::VaultNotInitialized => "vaultNotInitialized",
        ApplicationErrorCode::VaultLocked => "vaultLocked",
        ApplicationErrorCode::VaultCredentialNotFound => "vaultCredentialNotFound",
        ApplicationErrorCode::VaultCorrupt => "vaultCorrupt",
        ApplicationErrorCode::VaultVersionUnsupported => "vaultVersionUnsupported",
        ApplicationErrorCode::VaultStorageUnavailable => "vaultStorageUnavailable",
        ApplicationErrorCode::VaultCryptoFailure => "vaultCryptoFailure",
        ApplicationErrorCode::InvalidCredential => "invalidCredential",
        ApplicationErrorCode::VaultInvalidRecoveryFile => "vaultInvalidRecoveryFile",
        ApplicationErrorCode::VaultRecoveryFileMismatch => "vaultRecoveryFileMismatch",
        ApplicationErrorCode::VaultRecoveryFileStorageUnavailable => {
            "vaultRecoveryFileStorageUnavailable"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::IpcError;
    use crate::application::error::{ApplicationError, ApplicationErrorCode};

    #[test]
    fn application_errors_map_to_stable_ipc_shape() {
        let ipc_error = IpcError::from(ApplicationError::new(
            ApplicationErrorCode::ProfileStorageUnavailable,
            "暂时无法访问连接配置文件",
            true,
        ));
        let value = serde_json::to_value(ipc_error).expect("serialize IPC error");

        assert_eq!(value["code"], "profileStorageUnavailable");
        assert_eq!(value["message"], "暂时无法访问连接配置文件");
        assert_eq!(value["retryable"], true);
    }

    #[test]
    fn authentication_errors_use_stable_codes() {
        let ipc_error = IpcError::from(ApplicationError::new(
            ApplicationErrorCode::InvalidKeyPassphrase,
            "私钥口令不正确或加密私钥已损坏",
            true,
        ));
        let value = serde_json::to_value(ipc_error).expect("serialize IPC error");

        assert_eq!(value["code"], "invalidKeyPassphrase");
        assert_eq!(value["retryable"], true);
    }
}
