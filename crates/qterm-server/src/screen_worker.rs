//! One bounded, private headless-xterm process shared by all retained terminals.
use crate::error::{ApiError, Result};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Mutex, mpsc},
    time::Duration,
};

#[derive(Default)]
pub struct ScreenWorker(Mutex<WorkerState>);
#[derive(Default)]
struct WorkerState {
    process: Option<Process>,
    failed: bool,
}
struct Process {
    child: Child,
    input: ChildStdin,
    replies: mpsc::Receiver<Value>,
}
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl ScreenWorker {
    pub fn call(&self, request: Value) -> Result<Value> {
        let mut slot = self.0.lock().unwrap();
        if slot.failed {
            return Err(unavailable());
        }
        if slot.process.is_none() {
            slot.process = Some(Process::start()?);
        }
        let process = slot.process.as_mut().unwrap();
        let result = (|| {
            serde_json::to_writer(&mut process.input, &request).map_err(|_| unavailable())?;
            process.input.write_all(b"\n").map_err(|_| unavailable())?;
            process.input.flush().map_err(|_| unavailable())?;
            let response = process
                .replies
                .recv_timeout(Duration::from_secs(10))
                .map_err(|_| unavailable())?;
            if response["ok"] != true {
                return Err(unavailable());
            }
            Ok(response)
        })();
        if result.is_err() {
            slot.failed = true;
            slot.process.take();
        }
        // Never silently restart and pretend the old screen state survived.
        result
    }
}
impl Process {
    fn start() -> Result<Self> {
        let worker = std::env::var_os("QTERM_SCREEN_WORKER")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist-server/screen.mjs")
            });
        let node = std::env::var_os("QTERM_NODE").unwrap_or_else(|| "node".into());
        let mut child = Command::new(node)
            .arg("--max-old-space-size=256")
            .arg(worker)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| unavailable())?;
        let input = child.stdin.take().unwrap();
        let output = child.stdout.take().unwrap();
        let (sender, replies) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = String::new();
                // Snapshots are bounded by screen dimensions and 2,000 history rows.
                if reader
                    .read_line(&mut line)
                    .ok()
                    .filter(|n| *n > 0)
                    .is_none()
                {
                    break;
                }
                let Ok(value) = serde_json::from_str(&line) else {
                    break;
                };
                if sender.send(value).is_err() {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            input,
            replies,
        })
    }
}
fn unavailable() -> ApiError {
    ApiError::new(
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "screenUnavailable",
        "终端画面服务不可用；请确认 Node.js 和屏幕组件已安装，后台进程不会因此被结束",
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
