//! Synchronous desktop adapters may call SSH outside an entered Tokio runtime.
//! Server calls use their existing executor; desktop uses a process-owned fallback.
use std::{future::Future, sync::OnceLock};

pub fn spawn<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => handle.spawn(future),
        Err(_) => RUNTIME
            .get_or_init(|| tokio::runtime::Runtime::new().expect("Qterm task runtime"))
            .spawn(future),
    }
}
