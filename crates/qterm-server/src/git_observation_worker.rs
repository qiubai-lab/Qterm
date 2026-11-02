//! One serialized snapshot calculation per subscribed repository; no clients means no work.
use crate::{
    data_access::Permit,
    error::{ApiError, Result},
    git::git_error,
    git_observation::{Feed, Target},
    state::ServerState,
};
use qterm_core::{application::git_service::execute_remote_git, domain::git::RemoteGitAction};
use qterm_protocol::git::GitSnapshotDto;
use serde_json::Value;
use std::{
    sync::{Arc, Weak},
    time::Duration,
};
use tokio::sync::watch;

async fn sample(state: &Arc<ServerState>, owner: &str, target: &Target) -> Result<Value> {
    target.authorize(state, owner)?;
    let permit = Permit::new(state, owner)?;
    let slot = state
        .git_operations
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| ApiError::storage())?;
    permit.check()?;
    let snapshot = match target {
        Target::Local { path } => {
            let service = state.git.clone();
            let path = path.clone();
            tokio::task::spawn_blocking(move || {
                let _slot = slot;
                service.snapshot(path)
            })
            .await
            .map_err(|_| ApiError::storage())?
            .map_err(git_error)?
        }
        Target::Remote {
            session_id,
            profile_id,
            path,
        } => {
            let _slot = slot;
            execute_remote_git(
                state.sessions.as_ref(),
                session_id,
                profile_id,
                RemoteGitAction::Snapshot { path: path.clone() },
            )
            .await
            .map_err(git_error)?
        }
    };
    permit.check()?;
    serde_json::to_value(GitSnapshotDto::from(snapshot)).map_err(|_| ApiError::storage())
}
pub async fn run(state: Weak<ServerState>, owner: String, target: Target, feed: Weak<Feed>) {
    let (dirty, mut events) = watch::channel(0u64);
    let mut watcher = None;
    let mut interval = Duration::from_secs(15);
    let mut failures = 0;
    loop {
        let Some(state) = state.upgrade() else {
            return;
        };
        let Some(expected) = feed.upgrade().map(|v| *v.changes.borrow()) else {
            return;
        };
        if Permit::new(&state, &owner).is_err() {
            return;
        }
        let value = sample(&state, &owner, &target).await;
        match value {
            Ok(value) => {
                failures = 0;
                if let Target::Local { .. } = target
                    && watcher.is_none()
                {
                    let path = value["repositoryPath"].as_str().unwrap_or_default();
                    watcher =
                        crate::git_local_watch::start(std::path::Path::new(path), dirty.clone())
                            .ok();
                    if watcher.is_some() {
                        interval = Duration::from_secs(60);
                        dirty.send_modify(|v| *v += 1);
                    }
                }
                if let Some(feed) = feed.upgrade() {
                    feed.publish(value, Some(expected));
                } else {
                    return;
                }
            }
            Err(error) => {
                failures += 1;
                if let Some(feed) = feed.upgrade() {
                    feed.fail(error, expected);
                }
            }
        }
        drop(state);
        tokio::select! {
            _=events.changed()=>{
                // Coalesce a burst without indefinitely postponing updates during continuous writes.
                tokio::time::sleep(Duration::from_millis(350)).await;
                events.borrow_and_update();
            },
            _=tokio::time::sleep(if failures>0{Duration::from_secs(5)}else{interval})=>{},
        }
    }
}
