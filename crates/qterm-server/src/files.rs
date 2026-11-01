use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::State,
    response::{IntoResponse, Response},
};
use qterm_core::domain::{
    files::{FileDocument, MAX_IMAGE_FILE_BYTES, MAX_TEXT_FILE_BYTES},
    transfer::RemotePath,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileRequest {
    pub session_id: String,
    pub path: String,
}
pub fn remote_path(path: String) -> Result<RemotePath> {
    RemotePath::new(path).map_err(|_| ApiError::invalid())
}
pub async fn list(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<FileRequest>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    let listing = state
        .sessions
        .list_directory(&input.session_id, remote_path(input.path)?)
        .await?;
    Ok(Json(
        json!({"path":listing.path,"entries":listing.entries.into_iter().map(|e|json!({"name":e.name,"path":e.path,"isDirectory":e.is_directory,"isSymlink":e.is_symlink,"size":e.size,"modifiedAt":e.modified_at,"permissionMode":e.permission_mode})).collect::<Vec<_>>()}),
    ))
}
fn document(value: FileDocument) -> Result<Value> {
    let size = value.bytes.len();
    let text = String::from_utf8(value.bytes).map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::BAD_REQUEST,
            "fileNotUtf8",
            "文件不是 UTF-8 文本",
        )
    })?;
    Ok(json!({"content":text,"size":size,"revision":value.revision,"modifiedAt":value.modified_at}))
}
pub async fn read(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<FileRequest>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    Ok(Json(document(
        state
            .sessions
            .read_file(
                &input.session_id,
                remote_path(input.path)?,
                MAX_TEXT_FILE_BYTES,
            )
            .await?,
    )?))
}
pub async fn binary(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<FileRequest>,
) -> Result<Response> {
    state.authorize(&owner.0, &input.session_id)?;
    let file = state
        .sessions
        .read_file(
            &input.session_id,
            remote_path(input.path)?,
            MAX_IMAGE_FILE_BYTES,
        )
        .await?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/octet-stream")],
        file.bytes,
    )
        .into_response())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Write {
    session_id: String,
    path: String,
    content: String,
    expected_revision: String,
}
pub async fn write(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Write>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    if input.content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(ApiError::invalid());
    }
    Ok(Json(document(
        state
            .sessions
            .write_text_file(
                &input.session_id,
                remote_path(input.path)?,
                input.content,
                input.expected_revision,
            )
            .await?,
    )?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    session_id: String,
    path: String,
    target_name: String,
}
pub async fn rename(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Mutation>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    state
        .sessions
        .rename_entry(
            &input.session_id,
            remote_path(input.path)?,
            input.target_name,
        )
        .await?;
    Ok(Json(Value::Null))
}
pub async fn copy(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Mutation>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    state
        .sessions
        .copy_file(
            &input.session_id,
            remote_path(input.path)?,
            input.target_name,
        )
        .await?;
    Ok(Json(Value::Null))
}
pub async fn delete(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<FileRequest>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    state
        .sessions
        .delete_entry(&input.session_id, remote_path(input.path)?)
        .await?;
    Ok(Json(Value::Null))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    session_id: String,
    directory: String,
    name: String,
    is_directory: bool,
}
pub async fn create(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<Create>,
) -> Result<Json<Value>> {
    state.authorize(&owner.0, &input.session_id)?;
    state
        .sessions
        .create_entry(
            &input.session_id,
            remote_path(input.directory)?,
            input.name,
            input.is_directory,
        )
        .await?;
    Ok(Json(Value::Null))
}
