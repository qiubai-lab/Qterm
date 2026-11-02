//! Bounded, single-writer security event journal. Never receives request bodies or credentials.
mod model;
mod storage;
pub mod transport;
pub use model::{Event, Kind, Source};
use model::{Page, Query};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    thread,
    time::Duration,
};

enum Command {
    Record(Event),
    Query(Query, tokio::sync::oneshot::Sender<Result<Page, ()>>),
}
#[derive(Default)]
struct Health {
    failed: AtomicBool,
    dropped: AtomicU64,
}
pub struct AccessLog {
    sender: Option<SyncSender<Command>>,
    worker: Option<thread::JoinHandle<()>>,
    health: Arc<Health>,
}
impl AccessLog {
    pub fn new(directory: PathBuf) -> Arc<Self> {
        let (sender, receiver) = mpsc::sync_channel(1024);
        let health = Arc::new(Health::default());
        let status = health.clone();
        let worker = thread::spawn(move || {
            let mut store = storage::Storage::new(directory);
            let mut events = match store.load() {
                Ok((events, damaged)) => {
                    status.dropped.store(damaged, Ordering::Relaxed);
                    events
                }
                Err(_) => {
                    status.failed.store(true, Ordering::Relaxed);
                    VecDeque::new()
                }
            };
            loop {
                let command = receiver.recv_timeout(Duration::from_secs(60));
                if store.prune(0).is_err() {
                    status.failed.store(true, Ordering::Relaxed);
                }
                if store.take_pruned() {
                    // Reload only after segment removal, so same-millisecond records from
                    // deleted segments cannot remain accessible through the memory cache.
                    match store.load() {
                        Ok((retained, _)) => events = retained,
                        Err(_) => {
                            events.clear();
                            status.failed.store(true, Ordering::Relaxed);
                        }
                    }
                }
                events.retain(|event| {
                    event.timestamp >= model::now().saturating_sub(storage::RETENTION)
                });
                match command {
                    Ok(Command::Record(event)) => {
                        if store.append(&event).is_ok() {
                            events.push_back(event);
                        } else {
                            status.failed.store(true, Ordering::Relaxed);
                            status.dropped.fetch_add(1, Ordering::Relaxed);
                            eprintln!("Access log: cannot persist security event");
                        }
                    }
                    Ok(Command::Query(query, reply)) => {
                        let result = model::page(&events, query).map(|mut page| {
                            page.dropped_events = status.dropped.load(Ordering::Relaxed);
                            page.recording_healthy =
                                !status.failed.load(Ordering::Relaxed) && page.dropped_events == 0;
                            page
                        });
                        let _ = reply.send(result);
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            }
        });
        Arc::new(Self {
            sender: Some(sender),
            worker: Some(worker),
            health,
        })
    }
    pub fn record(&self, kind: Kind, success: bool, reason: &str, source: Source) {
        if self
            .sender
            .as_ref()
            .unwrap()
            .try_send(Command::Record(Event::new(kind, success, reason, source)))
            .is_err()
        {
            self.health.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
    async fn query(&self, query: Query) -> crate::error::Result<Page> {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        self.sender
            .as_ref()
            .unwrap()
            .try_send(Command::Query(query, sender))
            .map_err(|_| crate::error::ApiError::storage())?;
        receiver
            .await
            .map_err(|_| crate::error::ApiError::storage())?
            .map_err(|_| {
                crate::error::ApiError::new(
                    axum::http::StatusCode::BAD_REQUEST,
                    "invalidLogCursor",
                    "筛选条件无效或记录已过期，请刷新列表",
                )
            })
    }
}
impl Drop for AccessLog {
    fn drop(&mut self) {
        self.sender.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
mod admission_tests;
#[cfg(test)]
mod storage_tests;
#[cfg(test)]
mod tests;
