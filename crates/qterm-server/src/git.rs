use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{Extension, Json, extract::State};
use qterm_core::domain::git::{GitError, GitSnapshot};
use qterm_protocol::git::*;
use std::sync::Arc;
pub(crate) fn git_error(error: GitError) -> ApiError {
    let error = GitIpcError::from(error);
    ApiError {
        status: axum::http::StatusCode::BAD_REQUEST,
        code: error.code.into(),
        message: error.message,
        retryable: error.retryable,
    }
}
fn busy() -> ApiError {
    ApiError::new(
        axum::http::StatusCode::TOO_MANY_REQUESTS,
        "gitBusy",
        "Git 操作繁忙，请稍后重试",
    )
}
pub async fn available(State(state): State<Arc<ServerState>>) -> Json<bool> {
    Json(state.git.available())
}
async fn run<F>(
    state: Arc<ServerState>,
    permit: tokio::sync::OwnedSemaphorePermit,
    operation: F,
) -> Result<Json<GitSnapshotDto>>
where
    F: FnOnce() -> std::result::Result<GitSnapshot, GitError> + Send + 'static,
{
    let snapshot = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        operation()
    })
    .await
    .map_err(|_| git_error(GitError::Io))?
    .map(GitSnapshotDto::from)
    .map_err(git_error)?;
    state.git_observations.publish(
        None,
        serde_json::to_value(&snapshot).map_err(|_| ApiError::storage())?,
    );
    Ok(Json(snapshot))
}
pub async fn git_snapshot(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPathInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || service.snapshot(input.path)).await
}

pub async fn git_initialize(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPathInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || service.initialize(input.path)).await
}

pub async fn git_stage(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPathsInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.stage(input.repository, input.paths)
    })
    .await
}

pub async fn git_initialize_submodule(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitSubmoduleInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.initialize_submodule(input.repository, input.path)
    })
    .await
}

pub async fn git_checkout_submodule(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitSubmoduleInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.checkout_submodule(input.repository, input.path)
    })
    .await
}

pub async fn git_stage_all(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || service.stage_all(input.repository)).await
}

pub async fn git_unstage(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPathsInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.unstage(input.repository, input.paths)
    })
    .await
}

pub async fn git_unstage_all(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.unstage_all(input.repository)
    })
    .await
}

pub async fn git_discard(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPathsInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.discard(input.repository, input.paths)
    })
    .await
}

pub async fn git_commit(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitCommitInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.commit(input.repository, input.message)
    })
    .await
}

pub async fn git_commit_files(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitCommitFilesInput>,
) -> Result<Json<Vec<GitCommitFileDto>>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    tokio::task::spawn_blocking(move || {
        let _permit = _permit;
        service.commit_files(input.repository, input.oid)
    })
    .await
    .map_err(|_| git_error(GitError::Io))?
    .map(|files| files.into_iter().map(Into::into).collect())
    .map(Json)
    .map_err(git_error)
}

pub async fn git_commit_file_diff(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitCommitFileDiffInput>,
) -> Result<Json<GitCommitFileDiffDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    tokio::task::spawn_blocking(move || {
        let _permit = _permit;
        service.commit_file_diff(input.repository, input.oid, input.path)
    })
    .await
    .map_err(|_| git_error(GitError::Io))?
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_conflict_detail(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitConflictDetailInput>,
) -> Result<Json<GitConflictDetailDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    tokio::task::spawn_blocking(move || {
        let _permit = _permit;
        service.conflict_detail(input.repository, input.path)
    })
    .await
    .map_err(|_| git_error(GitError::Io))?
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_change_diff(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitChangeDiffInput>,
) -> Result<Json<GitChangeDiffDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    tokio::task::spawn_blocking(move || {
        let _permit = _permit;
        service.change_diff(input.repository, input.path, input.staged)
    })
    .await
    .map_err(|_| git_error(GitError::Io))?
    .map(Into::into)
    .map(Json)
    .map_err(git_error)
}

pub async fn git_resolve_conflict(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitResolveConflictInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.resolve_conflict(input.repository, input.path, input.resolution.into())
    })
    .await
}

pub async fn git_create_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.create_branch(input.repository, input.name)
    })
    .await
}

pub async fn git_create_branch_from(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitCreateBranchFromInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.create_branch_from(input.repository, input.name, input.source_ref)
    })
    .await
}

pub async fn git_create_branch_from_commit(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitCreateBranchFromCommitInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.create_branch_from_commit(input.repository, input.name, input.oid)
    })
    .await
}

pub async fn git_rename_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRenameBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.rename_branch(input.repository, input.ref_name, input.new_name)
    })
    .await
}

pub async fn git_delete_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitDeleteBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.delete_branch(input.repository, input.ref_name)
    })
    .await
}

pub async fn git_switch_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.switch_branch(input.repository, input.name)
    })
    .await
}

pub async fn git_fetch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || service.fetch(input.repository)).await
}

pub async fn git_pull(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || service.pull(input.repository)).await
}

pub async fn git_push(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitPushInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.push(input.repository, input.remote)
    })
    .await
}

pub async fn git_track_remote_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRemoteBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.track_remote_branch(input.repository, input.ref_name)
    })
    .await
}

pub async fn git_merge_branch(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitMergeBranchInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.merge_branch(input.repository, input.source_ref)
    })
    .await
}

pub async fn git_continue_merge(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.continue_merge(input.repository)
    })
    .await
}

pub async fn git_abort_merge(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Json(input): Json<GitRepositoryInput>,
) -> Result<Json<GitSnapshotDto>> {
    let _permit = state
        .git_operations
        .clone()
        .try_acquire_owned()
        .map_err(|_| busy())?;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    let service = Arc::clone(&state.git);
    run(state, _permit, move || {
        service.abort_merge(input.repository)
    })
    .await
}
