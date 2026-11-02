//! Recoverable headless screens; process failure never owns or terminates a PTY.
mod process;
mod recovery;
use crate::error::{ApiError, Result};
use process::{Config, Failure, Process};
use recovery::Screen;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct ScreenWorker {
    state: Mutex<WorkerState>,
    config: Config,
}
#[derive(Default)]
struct WorkerState {
    process: Option<Process>,
    screens: BTreeMap<String, Screen>,
    retry_at: Option<Instant>,
}
impl WorkerState {
    fn discard(&mut self, failure: Failure) {
        if let Some(mut process) = self.process.take() {
            process.report(failure);
        } else {
            eprintln!("Qterm screen worker: reason={}", failure.reason());
        }
    }
    fn recover(&mut self, config: &Config) -> std::result::Result<(), Failure> {
        if self.process.is_some() {
            return Ok(());
        }
        let mut process = Process::start(config)?;
        let deadline = Instant::now() + config.timeout;
        let result = (|| {
            for screen in self.screens.values_mut().filter(|screen| !screen.lost) {
                screen.replies.clear();
                let restored = (|| {
                    process.call_until(&screen.restore(), deadline)?;
                    for entry in &screen.tail {
                        let result = process.call_until(&entry.request, deadline)?;
                        // Only previously undelivered query responses may go back to the PTY.
                        if entry.pending_reply
                            && let Some(replies) = result["responses"].as_array()
                        {
                            screen.replies.extend(replies.iter().cloned());
                        }
                    }
                    Ok(())
                })();
                match restored {
                    Ok(()) => {}
                    Err(Failure::Rejected) => {
                        process.report(Failure::Rejected);
                        screen.invalidate();
                    }
                    Err(error) => return Err(error),
                }
            }
            Ok(())
        })();
        self.process = Some(process);
        result
    }
}
impl ScreenWorker {
    pub fn call(&self, request: Value) -> Result<Value> {
        let id = request["id"]
            .as_str()
            .ok_or_else(ApiError::invalid)?
            .to_owned();
        let op = request["op"]
            .as_str()
            .ok_or_else(ApiError::invalid)?
            .to_owned();
        let mut state = self.state.lock().unwrap();
        // Cleanup is idempotent and must never launch a process just to destroy a screen.
        if op == "destroy" {
            state.screens.remove(&id);
            if let Some(process) = state.process.as_mut()
                && let Err(error) = process.call(&request)
            {
                state.discard(error);
            }
            return Ok(json!({"ok":true}));
        }
        if !matches!(op.as_str(), "create" | "write" | "resize" | "snapshot") {
            return Err(ApiError::invalid());
        }
        if op != "create" && !state.screens.contains_key(&id) {
            return Err(ApiError::invalid());
        }
        if op == "create" && state.screens.contains_key(&id) {
            return Err(ApiError::invalid());
        }
        if state.screens.get(&id).is_some_and(|screen| screen.lost) {
            return Err(state_lost());
        }
        let mut response = None;
        if state.retry_at.is_none_or(|when| Instant::now() >= when) {
            // One retry, after reconstructing committed parser state. Never replay PTY input.
            for _ in 0..2 {
                let recovered = state.recover(&self.config);
                if recovered.is_ok() && state.screens.get(&id).is_some_and(|screen| screen.lost) {
                    return Err(state_lost());
                }
                let result =
                    recovered.and_then(|()| state.process.as_mut().unwrap().call(&request));
                match result {
                    Ok(value) => {
                        response = Some(value);
                        state.retry_at = None;
                        break;
                    }
                    Err(error) => state.discard(error),
                }
            }
            if response.is_none() {
                state.retry_at = Some(Instant::now() + Duration::from_secs(1));
            }
        }
        let Some(mut response) = response else {
            if let Some(screen) = state.screens.get_mut(&id) {
                screen.record(request, false);
            }
            return Err(unavailable());
        };
        if op == "create" {
            state.screens.insert(id.clone(), Screen::new(request));
        } else {
            let screen = state.screens.get_mut(&id).unwrap();
            screen.record(request, true);
            if matches!(op.as_str(), "write" | "snapshot") {
                screen.complete(&mut response);
            }
        }
        if state.screens[&id].needs_checkpoint() {
            match state
                .process
                .as_mut()
                .unwrap()
                .call(&json!({"op":"snapshot","id":id}))
            {
                Ok(snapshot) => state.screens.get_mut(&id).unwrap().checkpoint(snapshot),
                // The completed operation remains in the replay tail if checkpointing fails.
                Err(error) => state.discard(error),
            }
        }
        Ok(response)
    }
}
fn unavailable() -> ApiError {
    ApiError::new(
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "screenUnavailable",
        "终端画面暂时不可用，请稍后重连；后台任务仍在运行。若持续失败，请检查服务端画面组件诊断日志",
    )
}
fn state_lost() -> ApiError {
    ApiError::new(
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "screenStateLost",
        "终端画面状态异常或中断期间输出超过恢复缓冲上限，无法完整恢复此画面；后台任务仍在运行，可另开终端检查",
    )
}
pub fn create(
    worker: &ScreenWorker,
    id: &str,
    columns: u32,
    rows: u32,
    windows_pty: Option<Value>,
) -> Result<()> {
    worker.call(
        json!({"op":"create","id":id,"columns":columns,"rows":rows,"windowsPty":windows_pty}),
    )?;
    Ok(())
}

#[cfg(test)]
#[path = "screen_worker/tests.rs"]
mod tests;
