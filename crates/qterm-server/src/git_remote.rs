use crate::{
    auth::Identity,
    error::{ApiError, Result},
    git::git_error,
    state::ServerState,
};
use axum::{Extension, Json, extract::State};
use qterm_core::{
    application::git_service::*,
    domain::{git::RemoteGitAction, transfer::RemotePath},
};
use qterm_protocol::git::*;
use std::sync::Arc;
pub async fn git_remote_execute(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitInput>,
) -> Result<Json<GitSnapshotDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    let action: RemoteGitAction = input.action.into();
    let snapshot = execute_remote_git(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        action,
    )
    .await
    .map(GitSnapshotDto::from)
    .map_err(git_error)?;
    state.git_observations.publish(
        Some((&input.session_id, &input.profile_id)),
        serde_json::to_value(&snapshot).map_err(|_| ApiError::storage())?,
    );
    Ok(Json(snapshot))
}

pub async fn git_remote_commit_files(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitCommitFilesInput>,
) -> Result<Json<Vec<GitCommitFileDto>>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    execute_remote_git_commit_files(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.oid,
    )
    .await
    .map(|files| files.into_iter().map(Into::into).collect())
    .map(Json)
    .map_err(git_error)
}

pub async fn git_remote_commit_file_diff(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitCommitFileDiffInput>,
) -> Result<Json<GitCommitFileDiffDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    execute_remote_git_commit_file_diff(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.oid,
        input.path,
    )
    .await
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_remote_conflict_detail(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitConflictDetailInput>,
) -> Result<Json<GitConflictDetailDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    execute_remote_git_conflict_detail(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
    )
    .await
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_remote_change_diff(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitChangeDiffInput>,
) -> Result<Json<GitChangeDiffDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    execute_remote_git_change_diff(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
        input.staged,
    )
    .await
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_remote_resolve_conflict(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitResolveConflictInput>,
) -> Result<Json<GitSnapshotDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    let snapshot = execute_remote_git_resolve_conflict(
        state.sessions.as_ref(),
        &input.session_id,
        &input.profile_id,
        input.repository,
        input.path,
        input.resolution.into(),
    )
    .await
    .map(GitSnapshotDto::from)
    .map_err(git_error)?;
    state.git_observations.publish(
        Some((&input.session_id, &input.profile_id)),
        serde_json::to_value(&snapshot).map_err(|_| ApiError::storage())?,
    );
    Ok(Json(snapshot))
}

pub async fn git_remote_list_directory(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<RemoteGitDirectoryInput>,
) -> Result<Json<GitDirectoryListingDto>> {
    state.authorize(&owner.0, &input.session_id)?;
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::invalid())?;
    let path = RemotePath::new(input.path).map_err(|_| ApiError::invalid())?;
    state
        .sessions
        .list_git_directory(&input.session_id, &input.profile_id, path)
        .await
        .map(GitDirectoryListingDto::from)
        .map(Json)
        .map_err(ApiError::from)
}
