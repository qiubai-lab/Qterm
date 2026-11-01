//! Bounded cancellation registry. A cancellation arriving before its upload remains effective.
use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct Transfers(Mutex<HashMap<String, Entry>>);
struct Entry {
    owner: String,
    expires: Instant,
    started: bool,
    cancelled: Arc<AtomicBool>,
}
impl Transfers {
    fn access<T>(
        &self,
        owner: &str,
        id: &str,
        action: impl FnOnce(&mut Entry) -> Result<T>,
    ) -> Result<T> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(ApiError::invalid());
        }
        let mut entries = self.0.lock().unwrap();
        entries.retain(|_, entry| entry.expires > Instant::now());
        if !entries.contains_key(id) && entries.len() >= 10_064 {
            return Err(ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "transferLimit",
                "传输请求过于频繁",
            ));
        }
        let entry = entries.entry(id.into()).or_insert_with(|| Entry {
            owner: owner.into(),
            expires: Instant::now() + Duration::from_secs(660),
            started: false,
            cancelled: Arc::new(AtomicBool::new(false)),
        });
        if entry.owner != owner {
            return Err(ApiError::forbidden());
        }
        action(entry)
    }
    // A folder selection may contain 10,000 sequential requests. Keep bounded
    // replay tombstones for a full selection plus pending cancellations.
    pub fn start(&self, owner: &str, id: &str) -> Result<Arc<AtomicBool>> {
        self.access(owner, id, |entry| {
            if entry.started || entry.cancelled.load(Ordering::Relaxed) {
                return Err(ApiError::invalid());
            }
            entry.started = true;
            Ok(entry.cancelled.clone())
        })
    }
    pub fn finish(&self, id: &str) {
        if let Some(entry) = self.0.lock().unwrap().get_mut(id) {
            entry.expires = Instant::now() + Duration::from_secs(60);
        }
    }
    pub fn cancel(&self, owner: &str, id: &str) -> Result<()> {
        self.access(owner, id, |entry| {
            entry.cancelled.store(true, Ordering::Relaxed);
            Ok(())
        })
    }
    pub fn clear(&self) {
        let mut entries = self.0.lock().unwrap();
        for entry in entries.values() {
            entry.cancelled.store(true, Ordering::Relaxed);
        }
        entries.clear();
    }
}
pub async fn cancel(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    state.transfer_tasks.cancel(&owner.0, &id)?;
    Ok(Json(serde_json::Value::Null))
}

pub struct Operation {
    state: Arc<ServerState>,
    id: String,
    owner: String,
    pub cancelled: Arc<AtomicBool>,
}
impl Operation {
    pub fn start(state: &Arc<ServerState>, owner: &str, id: String) -> Result<Self> {
        Ok(Self {
            cancelled: state.transfer_tasks.start(owner, &id)?,
            state: state.clone(),
            id,
            owner: owner.into(),
        })
    }
    pub fn check(&self) -> Result<()> {
        if !self.state.auth.valid(&self.owner) {
            return Err(ApiError::unauthorized());
        }
        if self.cancelled.load(Ordering::Relaxed) {
            Err(ApiError::new(
                axum::http::StatusCode::CONFLICT,
                "transferCancelled",
                "传输已取消",
            ))
        } else {
            Ok(())
        }
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.state.transfer_tasks.finish(&self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_before_registration_prevents_transfer_and_is_owner_scoped() {
        let registry = Transfers::default();
        let id = uuid::Uuid::new_v4().to_string();
        registry.cancel("one", &id).unwrap();
        assert!(registry.start("one", &id).is_err());
        assert!(registry.cancel("two", &id).is_err());
    }
    #[test]
    fn a_folder_can_complete_more_than_sixty_four_entries_without_losing_replay_protection() {
        let registry = Transfers::default();
        let first = uuid::Uuid::new_v4().to_string();
        registry.start("one", &first).unwrap();
        registry.finish(&first);
        for _ in 0..100 {
            let id = uuid::Uuid::new_v4().to_string();
            registry.start("one", &id).unwrap();
            registry.finish(&id);
        }
        assert!(registry.start("one", &first).is_err());
    }
    #[test]
    fn active_transfer_observes_cancellation_and_cannot_replay() {
        let registry = Transfers::default();
        let id = uuid::Uuid::new_v4().to_string();
        let flag = registry.start("one", &id).unwrap();
        registry.cancel("one", &id).unwrap();
        assert!(flag.load(Ordering::Relaxed));
        assert!(registry.start("one", &id).is_err());
    }
}
