use crate::error::{ApiError, Result};
use axum::{
    Json,
    response::{IntoResponse, Response},
};
use qterm_core::{
    application::{file_service as files, local_file_listing},
    domain::files::{DirectoryListing, FileDocument},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::PathBuf;

fn path(value: String) -> Result<PathBuf> {
    if value.is_empty() || value.len() > 4096 || value.contains('\0') {
        return Err(ApiError::invalid());
    }
    let path = if value == "~" {
        dirs::home_dir().ok_or_else(ApiError::storage)?
    } else if let Some(suffix) = value.strip_prefix("~/") {
        dirs::home_dir().ok_or_else(ApiError::storage)?.join(suffix)
    } else {
        value.into()
    };
    if !path.is_absolute() {
        return Err(ApiError::invalid());
    }
    Ok(path)
}
fn error(value: files::FileServiceError) -> ApiError {
    let code = match value {
        files::FileServiceError::Conflict => "fileConflict",
        files::FileServiceError::TooLarge => "fileTooLarge",
        files::FileServiceError::NotUtf8 => "fileNotUtf8",
        _ => "fileUnavailable",
    };
    ApiError::new(
        axum::http::StatusCode::BAD_REQUEST,
        code,
        &value.to_string(),
    )
}
fn listing(value: DirectoryListing) -> Value {
    json!({"path":value.path,"entries":value.entries.into_iter().map(|e|json!({"name":e.name,"path":e.path,"isDirectory":e.is_directory,"isSymlink":e.is_symlink,"size":e.size,"modifiedAt":e.modified_at,"permissionMode":e.permission_mode})).collect::<Vec<_>>()})
}
fn document(value: FileDocument) -> Result<Value> {
    let size = value.bytes.len();
    Ok(
        json!({"content":String::from_utf8(value.bytes).map_err(|_|ApiError::invalid())?,"size":size,"revision":value.revision,"modifiedAt":value.modified_at}),
    )
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    path: String,
}
pub async fn list(Json(input): Json<Request>) -> Result<Json<Value>> {
    Ok(Json(listing(
        local_file_listing::list(&path(input.path)?)
            .await
            .map_err(error)?,
    )))
}
pub async fn roots() -> Json<Value> {
    #[cfg(windows)]
    let roots = (b'A'..=b'Z')
        .map(|letter| format!("{}:\\", letter as char))
        .filter(|path| std::path::Path::new(path).is_dir())
        .collect::<Vec<_>>();
    #[cfg(not(windows))]
    let roots = vec!["/".to_owned()];
    Json(json!(
        roots
            .into_iter()
            .map(|path| json!({"name":path,"path":path}))
            .collect::<Vec<_>>()
    ))
}
pub async fn read(Json(input): Json<Request>) -> Result<Json<Value>> {
    Ok(Json(document(
        files::read_local_text(&path(input.path)?)
            .await
            .map_err(error)?,
    )?))
}
pub async fn binary(Json(input): Json<Request>) -> Result<Response> {
    let file = files::read_local_binary(&path(input.path)?)
        .await
        .map_err(error)?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/octet-stream")],
        file.bytes,
    )
        .into_response())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Write {
    path: String,
    content: String,
    expected_revision: String,
}
pub async fn write(Json(input): Json<Write>) -> Result<Json<Value>> {
    Ok(Json(document(
        files::write_local_text(&path(input.path)?, input.content, &input.expected_revision)
            .await
            .map_err(error)?,
    )?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    path: String,
    target_name: String,
}
pub async fn rename(Json(input): Json<Mutation>) -> Result<Json<Value>> {
    files::rename_local_entry(&path(input.path)?, &input.target_name)
        .await
        .map_err(error)?;
    Ok(Json(Value::Null))
}
pub async fn copy(Json(input): Json<Mutation>) -> Result<Json<Value>> {
    files::copy_local_file(&path(input.path)?, &input.target_name)
        .await
        .map_err(error)?;
    Ok(Json(Value::Null))
}
pub async fn delete(Json(input): Json<Request>) -> Result<Json<Value>> {
    files::delete_local_entry(&path(input.path)?)
        .await
        .map_err(error)?;
    Ok(Json(Value::Null))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    directory: String,
    name: String,
    is_directory: bool,
}
pub async fn create(Json(input): Json<Create>) -> Result<Json<Value>> {
    files::create_local_entry(&path(input.directory)?, &input.name, input.is_directory)
        .await
        .map_err(error)?;
    Ok(Json(Value::Null))
}
