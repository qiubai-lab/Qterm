//! Bounded stdio transport and redacted diagnostics for the headless process.
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    time::{Duration, Instant},
};

pub(super) const MAX_REPLY: usize = 8 * 1024 * 1024;
pub(super) struct Config {
    pub node: std::ffi::OsString,
    pub worker: PathBuf,
    pub timeout: Duration,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            node: std::env::var_os("QTERM_NODE").unwrap_or_else(|| "node".into()),
            worker: std::env::var_os("QTERM_SCREEN_WORKER")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist-server/screen.mjs")
                }),
            timeout: Duration::from_secs(10),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum Failure {
    Start,
    Io,
    Timeout,
    Protocol,
    Rejected,
}
impl Failure {
    pub fn reason(self) -> &'static str {
        match self {
            Self::Start => "spawn-failed",
            Self::Io => "stdio-closed",
            Self::Timeout => "request-timeout",
            Self::Protocol => "invalid-response",
            Self::Rejected => "operation-failed",
        }
    }
}

pub(super) struct Process {
    child: Child,
    requests: mpsc::SyncSender<Value>,
    replies: mpsc::Receiver<Result<Value, Failure>>,
    diagnostic: Arc<Mutex<&'static str>>,
    timeout: Duration,
}
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Process {
    pub fn start(config: &Config) -> Result<Self, Failure> {
        let mut child = Command::new(&config.node)
            .arg("--max-old-space-size=256")
            .arg(&config.worker)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| Failure::Start)?;
        let mut input = child.stdin.take().unwrap();
        let mut output = BufReader::new(child.stdout.take().unwrap());
        let mut stderr = child.stderr.take().unwrap();
        let diagnostic = Arc::new(Mutex::new("none"));
        let detail = diagnostic.clone();
        std::thread::spawn(move || {
            let mut bytes = [0; 256];
            let mut tail = Vec::new();
            while let Ok(count) = stderr.read(&mut bytes) {
                if count == 0 {
                    break;
                }
                tail.extend_from_slice(&bytes[..count]);
                let text = String::from_utf8_lossy(&tail);
                let reason = if text.contains("heap out of memory")
                    || text.contains("Allocation failed")
                {
                    Some("node-out-of-memory")
                } else if text.contains("MODULE_NOT_FOUND") || text.contains("ERR_MODULE_NOT_FOUND")
                {
                    Some("worker-module-missing")
                } else if text.contains("SyntaxError") {
                    Some("worker-syntax-error")
                } else {
                    None
                };
                if let Some(reason) = reason {
                    *detail.lock().unwrap() = reason;
                }
                if tail.len() > 256 {
                    tail.drain(..tail.len() - 256);
                }
            }
        });
        let (requests, receiver) = mpsc::sync_channel::<Value>(1);
        let (sender, replies) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            for request in receiver {
                let result = (|| {
                    serde_json::to_writer(&mut input, &request).map_err(|_| Failure::Io)?;
                    input.write_all(b"\n").map_err(|_| Failure::Io)?;
                    input.flush().map_err(|_| Failure::Io)?;
                    let mut line = Vec::new();
                    output
                        .by_ref()
                        .take((MAX_REPLY + 1) as u64)
                        .read_until(b'\n', &mut line)
                        .map_err(|_| Failure::Io)?;
                    if line.is_empty() {
                        return Err(Failure::Io);
                    }
                    if line.len() > MAX_REPLY || line.last() != Some(&b'\n') {
                        return Err(Failure::Protocol);
                    }
                    serde_json::from_slice(&line).map_err(|_| Failure::Protocol)
                })();
                let failed = result.is_err();
                if sender.send(result).is_err() || failed {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            requests,
            replies,
            diagnostic,
            timeout: config.timeout,
        })
    }
    pub fn call(&mut self, request: &Value) -> Result<Value, Failure> {
        self.call_until(request, Instant::now() + self.timeout)
    }
    pub fn call_until(&mut self, request: &Value, deadline: Instant) -> Result<Value, Failure> {
        let timeout = deadline
            .checked_duration_since(Instant::now())
            .ok_or(Failure::Timeout)?;
        self.requests
            .try_send(request.clone())
            .map_err(|_| Failure::Io)?;
        let response = self
            .replies
            .recv_timeout(timeout.min(self.timeout))
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => Failure::Timeout,
                mpsc::RecvTimeoutError::Disconnected => Failure::Io,
            })??;
        if response["ok"] != true {
            return Err(Failure::Rejected);
        }
        Ok(response)
    }
    pub fn report(&mut self, failure: Failure) {
        // Never log requests, terminal content, raw stderr, or error objects from Node.
        let status = self.child.try_wait().ok().flatten();
        eprintln!(
            "Qterm screen worker: reason={} exit={status:?} diagnostic={}",
            failure.reason(),
            self.diagnostic.lock().unwrap()
        );
    }
    #[cfg(test)]
    pub fn kill(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
    }
}
