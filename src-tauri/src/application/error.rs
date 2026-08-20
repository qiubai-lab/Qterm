use std::{error::Error, fmt};

use crate::domain::auth::AuthFailure;
use crate::domain::credential::CredentialError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApplicationErrorCode {
    InvalidProfileId,
    InvalidProfileGroupId,
    InvalidProfileGroupName,
    InvalidProfileName,
    InvalidProfileHost,
    InvalidProfilePort,
    InvalidProfileUsername,
    ProfileAlreadyExists,
    ProfileNotFound,
    ProfileGroupAlreadyExists,
    ProfileGroupNotFound,
    ProfileStorageCorrupt,
    ProfileStorageVersionUnsupported,
    ProfileStorageContainsSensitiveData,
    ProfileStorageUnavailable,
    InvalidNetworkRule,
    NetworkRuleAlreadyExists,
    NetworkRuleNotFound,
    ProfileHasNetworkRules,
    NetworkStorageCorrupt,
    NetworkStorageVersionUnsupported,
    NetworkStorageContainsSensitiveData,
    NetworkStorageUnavailable,
    NetworkForwardUnavailable,
    InvalidCredentials,
    AuthenticationMethodDisabled,
    PrivateKeyMissing,
    PrivateKeyUnreadable,
    PrivateKeyTooLarge,
    PrivateKeyEncrypted,
    InvalidKeyPassphrase,
    UnsupportedPrivateKey,
    CorruptPrivateKey,
    SshAgentUnavailable,
    SshAgentEmpty,
    SshAgentRejected,
    AuthenticationRejected,
    SshConnectionFailed,
    InvalidSessionTarget,
    SessionNotFound,
    SessionNotConnected,
    InvalidTerminalInput,
    TerminalBusy,
    InvalidTransferPath,
    TransferPathNotSelected,
    TransferNotFound,
    InvalidWorkspaceDocument,
    WorkspaceStorageCorrupt,
    WorkspaceStorageVersionUnsupported,
    WorkspaceStorageContainsSensitiveData,
    WorkspaceStorageUnavailable,
    HostKeyDecisionUnavailable,
    KnownHostsUnavailable,
    SessionAlreadyFinished,
    LocalShellUnavailable,
    InvalidFilePath,
    DirectoryUnavailable,
    FileUnavailable,
    FileTooLarge,
    FileNotUtf8,
    FileConflict,
    VaultInvalidMasterPassword,
    VaultWeakMasterPassword,
    VaultAlreadyInitialized,
    VaultNotInitialized,
    VaultLocked,
    VaultCredentialNotFound,
    VaultCorrupt,
    VaultVersionUnsupported,
    VaultStorageUnavailable,
    VaultCryptoFailure,
    InvalidCredential,
    VaultInvalidRecoveryFile,
    VaultRecoveryFileMismatch,
    VaultRecoveryFileStorageUnavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ApplicationError {
    code: ApplicationErrorCode,
    message: &'static str,
    retryable: bool,
}

impl ApplicationError {
    pub fn new(code: ApplicationErrorCode, message: &'static str, retryable: bool) -> Self {
        Self {
            code,
            message,
            retryable,
        }
    }

    pub fn code(self) -> ApplicationErrorCode {
        self.code
    }

    pub fn message(self) -> &'static str {
        self.message
    }

    pub fn retryable(self) -> bool {
        self.retryable
    }
}

impl fmt::Display for ApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for ApplicationError {}

impl From<AuthFailure> for ApplicationError {
    fn from(failure: AuthFailure) -> Self {
        match failure {
            AuthFailure::InvalidCredentials => Self::new(
                ApplicationErrorCode::InvalidCredentials,
                "用户名或凭据不正确",
                true,
            ),
            AuthFailure::AuthenticationMethodDisabled => Self::new(
                ApplicationErrorCode::AuthenticationMethodDisabled,
                "服务器未启用此认证方式",
                false,
            ),
            AuthFailure::KeyMissing => Self::new(
                ApplicationErrorCode::PrivateKeyMissing,
                "所选私钥文件不存在",
                false,
            ),
            AuthFailure::KeyUnreadable => Self::new(
                ApplicationErrorCode::PrivateKeyUnreadable,
                "无法读取所选私钥文件",
                false,
            ),
            AuthFailure::KeyTooLarge => Self::new(
                ApplicationErrorCode::PrivateKeyTooLarge,
                "所选私钥文件超过大小限制",
                false,
            ),
            AuthFailure::KeyEncrypted => Self::new(
                ApplicationErrorCode::PrivateKeyEncrypted,
                "该私钥需要口令",
                true,
            ),
            AuthFailure::InvalidPassphrase => Self::new(
                ApplicationErrorCode::InvalidKeyPassphrase,
                "私钥口令不正确或加密私钥已损坏",
                true,
            ),
            AuthFailure::UnsupportedKey => Self::new(
                ApplicationErrorCode::UnsupportedPrivateKey,
                "暂不支持该私钥算法或格式",
                false,
            ),
            AuthFailure::CorruptKey => Self::new(
                ApplicationErrorCode::CorruptPrivateKey,
                "所选文件不是有效的私钥",
                false,
            ),
            AuthFailure::SshAgentUnavailable => Self::new(
                ApplicationErrorCode::SshAgentUnavailable,
                "无法连接系统 SSH Agent",
                true,
            ),
            AuthFailure::SshAgentEmpty => Self::new(
                ApplicationErrorCode::SshAgentEmpty,
                "SSH Agent 中没有可用密钥",
                true,
            ),
            AuthFailure::SshAgentRejected => Self::new(
                ApplicationErrorCode::SshAgentRejected,
                "服务器未接受 SSH Agent 中的密钥",
                true,
            ),
            AuthFailure::ServerRejected => Self::new(
                ApplicationErrorCode::AuthenticationRejected,
                "服务器要求当前版本不支持的额外认证",
                false,
            ),
            AuthFailure::Connection => Self::new(
                ApplicationErrorCode::SshConnectionFailed,
                "SSH 连接在认证期间中断",
                true,
            ),
        }
    }
}

impl From<CredentialError> for ApplicationError {
    fn from(error: CredentialError) -> Self {
        match error {
            CredentialError::InvalidMasterPassword => Self::new(
                ApplicationErrorCode::VaultInvalidMasterPassword,
                "主密码不正确",
                true,
            ),
            CredentialError::WeakMasterPassword => Self::new(
                ApplicationErrorCode::VaultWeakMasterPassword,
                "主密码至少需要 12 个字符",
                true,
            ),
            CredentialError::AlreadyInitialized => Self::new(
                ApplicationErrorCode::VaultAlreadyInitialized,
                "密码保险库已经初始化",
                false,
            ),
            CredentialError::NotInitialized => Self::new(
                ApplicationErrorCode::VaultNotInitialized,
                "密码保险库尚未初始化",
                false,
            ),
            CredentialError::Locked => {
                Self::new(ApplicationErrorCode::VaultLocked, "密码保险库已锁定", true)
            }
            CredentialError::CredentialNotFound => Self::new(
                ApplicationErrorCode::VaultCredentialNotFound,
                "该连接没有保存密码",
                false,
            ),
            CredentialError::CorruptVault => Self::new(
                ApplicationErrorCode::VaultCorrupt,
                "密码保险库已损坏或被篡改",
                false,
            ),
            CredentialError::UnsupportedVaultVersion => Self::new(
                ApplicationErrorCode::VaultVersionUnsupported,
                "密码保险库版本不受支持",
                false,
            ),
            CredentialError::StorageUnavailable => Self::new(
                ApplicationErrorCode::VaultStorageUnavailable,
                "无法访问密码保险库",
                true,
            ),
            CredentialError::CryptoFailure => Self::new(
                ApplicationErrorCode::VaultCryptoFailure,
                "无法完成凭据加密操作",
                false,
            ),
            CredentialError::InvalidCredential => Self::new(
                ApplicationErrorCode::InvalidCredential,
                "凭证名称或内容无效",
                false,
            ),
            CredentialError::InvalidRecoveryFile => Self::new(
                ApplicationErrorCode::VaultInvalidRecoveryFile,
                "所选文件不是有效的 Qterm 恢复密钥",
                false,
            ),
            CredentialError::RecoveryFileMismatch => Self::new(
                ApplicationErrorCode::VaultRecoveryFileMismatch,
                "恢复密钥不属于当前凭证库或已经失效",
                false,
            ),
            CredentialError::RecoveryFileStorageUnavailable => Self::new(
                ApplicationErrorCode::VaultRecoveryFileStorageUnavailable,
                "无法读取或保存恢复密钥文件",
                true,
            ),
        }
    }
}
