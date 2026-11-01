use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use qterm_core::{
    application::error::ApplicationError, domain::credential::CredentialError,
    infrastructure::ssh::client::SessionControlError,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiError {
    #[serde(skip)]
    pub status: StatusCode,
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
impl ApiError {
    pub fn new(status: StatusCode, code: &str, message: &str) -> Self {
        Self {
            status,
            code: code.into(),
            message: message.into(),
            retryable: false,
        }
    }
    pub fn invalid() -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalidRequest", "请求参数无效")
    }
    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", "请重新登录")
    }
    pub fn forbidden() -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", "无法访问此资源")
    }
    pub fn storage() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "storageUnavailable",
            "存储暂时不可用",
        )
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self)).into_response()
    }
}
impl From<ApplicationError> for ApiError {
    fn from(value: ApplicationError) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: qterm_protocol::errors::error_code(value.code()).into(),
            message: value.message().into(),
            retryable: value.retryable(),
        }
    }
}
impl From<CredentialError> for ApiError {
    fn from(value: CredentialError) -> Self {
        ApplicationError::from(value).into()
    }
}
impl From<SessionControlError> for ApiError {
    fn from(value: SessionControlError) -> Self {
        let (code, message) = match value {
            SessionControlError::FileConflict => ("fileConflict", "文件已被修改，请重新读取后保存"),
            SessionControlError::FileTooLarge => ("fileTooLarge", "文件超过大小限制"),
            SessionControlError::SessionNotConnected => ("sessionNotConnected", "SSH 会话尚未连接"),
            _ => ("sessionOperationFailed", "SSH 操作失败，请检查连接和权限"),
        };
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }
}
pub type Result<T> = std::result::Result<T, ApiError>;
