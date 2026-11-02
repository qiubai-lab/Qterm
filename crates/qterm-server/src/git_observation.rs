//! Shared, owner-scoped Git observations. Last subscriber dropping releases the worker.
use crate::{
    error::{ApiError, Result},
    state::ServerState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
};
use tokio::sync::watch;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Target {
    Local {
        path: String,
    },
    Remote {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "profileId")]
        profile_id: String,
        path: String,
    },
}
impl Target {
    pub fn normalize(self) -> Result<Self> {
        let path = match &self {
            Self::Local { path } | Self::Remote { path, .. } => path,
        };
        if path.is_empty() || path.len() > 4096 || path.contains('\0') {
            return Err(ApiError::invalid());
        }
        match self {
            Self::Local { path } => Ok(Self::Local {
                path: std::fs::canonicalize(path)
                    .map_err(|_| ApiError::invalid())?
                    .to_string_lossy()
                    .into_owned(),
            }),
            remote => Ok(remote),
        }
    }
    pub fn authorize(&self, state: &ServerState, owner: &str) -> Result<()> {
        if let Self::Remote {
            session_id,
            profile_id,
            ..
        } = self
        {
            state.authorize(owner, session_id)?;
            let sessions = state.retained.lock().unwrap();
            if !sessions
                .get(session_id)
                .is_some_and(|s| s.kind == "git" && s.profile_id.as_deref() == Some(profile_id))
            {
                return Err(ApiError::forbidden());
            }
        }
        Ok(())
    }
}
#[derive(Default)]
pub struct Observations(Mutex<HashMap<(String, Target), Weak<Feed>>>);
pub struct Feed {
    pub changes: watch::Sender<u64>,
    snapshot: Mutex<Result<Value>>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}
impl Feed {
    fn new() -> Self {
        Self {
            changes: watch::channel(0).0,
            snapshot: Mutex::new(Err(ApiError::new(
                axum::http::StatusCode::CONFLICT,
                "snapshotPending",
                "仓库状态正在同步，请稍后重试",
            ))),
            task: Mutex::new(None),
        }
    }
    pub fn publish(&self, value: Value, expected: Option<u64>) {
        let mut current = self.snapshot.lock().unwrap();
        if expected.is_some_and(|v| v != *self.changes.borrow())
            || current.as_ref().is_ok_and(|previous| previous == &value)
        {
            return;
        }
        *current = Ok(value);
        self.changes.send_modify(|version| *version += 1);
    }
    pub fn snapshot(&self, revision: u64) -> Result<Value> {
        let value = self.snapshot.lock().unwrap();
        if revision > *self.changes.borrow() {
            return Err(ApiError::invalid());
        }
        value.clone()
    }
    pub fn fail(&self, error: ApiError, expected: u64) {
        let mut current = self.snapshot.lock().unwrap();
        if expected != *self.changes.borrow()
            || current
                .as_ref()
                .is_err_and(|old| old.code == error.code && old.message == error.message)
        {
            return;
        }
        *current = Err(error);
        self.changes.send_modify(|version| *version += 1);
    }
}
impl Drop for Feed {
    fn drop(&mut self) {
        if let Some(task) = self.task.get_mut().unwrap().take() {
            task.abort();
        }
    }
}
impl Observations {
    pub fn subscribe(
        &self,
        state: &Arc<ServerState>,
        owner: &str,
        target: Target,
    ) -> Result<Arc<Feed>> {
        target.authorize(state, owner)?;
        let key = (owner.to_owned(), target.clone());
        let mut entries = self.0.lock().unwrap();
        entries.retain(|_, value| value.strong_count() > 0);
        if let Some(feed) = entries.get(&key).and_then(Weak::upgrade) {
            return Ok(feed);
        }
        if entries.len() >= 32 {
            return Err(ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "subscriptionLimit",
                "仓库订阅数量已达上限",
            ));
        }
        let feed = Arc::new(Feed::new());
        *feed.task.lock().unwrap() = Some(tokio::spawn(crate::git_observation_worker::run(
            Arc::downgrade(state),
            owner.into(),
            target,
            Arc::downgrade(&feed),
        )));
        entries.insert(key, Arc::downgrade(&feed));
        Ok(feed)
    }
    pub fn snapshot(&self, owner: &str, target: Target, revision: u64) -> Result<Value> {
        let feed = self
            .0
            .lock()
            .unwrap()
            .get(&(owner.into(), target))
            .and_then(Weak::upgrade)
            .ok_or_else(ApiError::invalid)?;
        feed.snapshot(revision)
    }
    pub fn publish(&self, session: Option<(&str, &str)>, value: Value) {
        let Some(path) = value["repositoryPath"].as_str() else {
            return;
        };
        for ((_, target), feed) in self.0.lock().unwrap().iter() {
            let matches = match (target, session) {
                (Target::Local { path: p }, None) => p == path,
                (
                    Target::Remote {
                        path: p,
                        session_id,
                        profile_id,
                    },
                    Some((s, profile)),
                ) => p == path && session_id == s && profile_id == profile,
                _ => false,
            };
            if matches && let Some(feed) = feed.upgrade() {
                feed.publish(value.clone(), None);
            }
        }
    }
}

#[cfg(test)]
#[path = "git_observation_tests.rs"]
mod tests;
