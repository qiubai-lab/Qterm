use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Login,
    Resume,
    Takeover,
    Logout,
    Connected,
    Disconnected,
    Revoked,
    VaultUnlock,
    VaultLock,
    VaultInitialize,
    VaultPasswordChange,
    VaultReset,
    VaultClear,
    WorkbenchUnlock,
    WorkbenchLock,
    AccessDenied,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub ip: Option<String>,
    pub browser: Option<String>,
    pub session: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub timestamp: u64,
    pub kind: Kind,
    pub success: bool,
    pub reason: String,
    pub source: Source,
}
impl Event {
    pub fn new(kind: Kind, success: bool, reason: &str, source: Source) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: now(),
            kind,
            success,
            reason: reason.into(),
            source,
        }
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Query {
    pub before: Option<String>,
    pub from: Option<u64>,
    pub to: Option<u64>,
    pub kind: Option<Kind>,
    pub success: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub entries: Vec<Event>,
    pub next_cursor: Option<String>,
    pub recording_healthy: bool,
    pub dropped_events: u64,
}

pub fn page(events: &std::collections::VecDeque<Event>, query: Query) -> Result<Page, ()> {
    if query.from.zip(query.to).is_some_and(|(from, to)| from > to) {
        return Err(());
    }
    let end = match query.before {
        Some(id) => events.iter().position(|event| event.id == id).ok_or(())?,
        None => events.len(),
    };
    let mut matching = events.iter().take(end).rev().filter(|event| {
        query.from.is_none_or(|from| event.timestamp >= from)
            && query.to.is_none_or(|to| event.timestamp <= to)
            && query.kind.is_none_or(|kind| event.kind == kind)
            && query.success.is_none_or(|success| event.success == success)
    });
    let entries: Vec<_> = matching.by_ref().take(50).cloned().collect();
    let next_cursor = matching
        .next()
        .and_then(|_| entries.last().map(|event| event.id.clone()));
    Ok(Page {
        entries,
        next_cursor,
        recording_healthy: true,
        dropped_events: 0,
    })
}
