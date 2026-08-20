use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use uuid::Uuid;

type EventSink = Arc<dyn Fn(LocalSessionEvent) + Send + Sync>;
type OutputSink = Arc<dyn Fn(Vec<u8>) + Send + Sync>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalTerminalCapabilities {
    pub windows_pty: Option<WindowsPtyCapabilities>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowsPtyCapabilities {
    pub backend: &'static str,
    pub build_number: u32,
}

pub fn terminal_capabilities() -> LocalTerminalCapabilities {
    LocalTerminalCapabilities {
        windows_pty: windows_pty_capabilities(),
    }
}

#[cfg(windows)]
fn windows_pty_capabilities() -> Option<WindowsPtyCapabilities> {
    Some(WindowsPtyCapabilities {
        backend: "conpty",
        build_number: windows_version::OsVersion::current().build,
    })
}

#[cfg(not(windows))]
fn windows_pty_capabilities() -> Option<WindowsPtyCapabilities> {
    None
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocalSessionEvent {
    Connected,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocalSessionError {
    StartFailed,
    SessionNotFound,
    InvalidTerminalInput,
    ControlUnavailable,
}

struct LocalSession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

#[derive(Clone, Default)]
pub struct LocalSessionManager {
    sessions: Arc<Mutex<HashMap<String, Arc<LocalSession>>>>,
}

impl LocalSessionManager {
    pub fn connect(
        &self,
        size: PtySize,
        terminal_output: OutputSink,
        events: EventSink,
    ) -> Result<String, LocalSessionError> {
        let pair = native_pty_system()
            .openpty(size)
            .map_err(|_| LocalSessionError::StartFailed)?;
        let mut command = CommandBuilder::new_default_prog();
        command.env("TERM", "xterm-256color");
        #[cfg(windows)]
        command.env(
            "PROMPT",
            format!(
                "$E]7;file://localhost/$P$E\\{}",
                std::env::var("PROMPT").unwrap_or_else(|_| "$P$G".into())
            ),
        );
        #[cfg(unix)]
        {
            let integration =
                "printf '\\033]7;file://%s%s\\033\\\\' \"${HOSTNAME:-localhost}\" \"$PWD\"";
            let existing = std::env::var("PROMPT_COMMAND").unwrap_or_default();
            command.env(
                "PROMPT_COMMAND",
                if existing.is_empty() {
                    integration.into()
                } else {
                    format!("{integration};{existing}")
                },
            );
        }
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| LocalSessionError::StartFailed)?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| LocalSessionError::StartFailed)?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| LocalSessionError::StartFailed)?;
        let session = Arc::new(LocalSession {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            killer: Mutex::new(child.clone_killer()),
        });
        let session_id = Uuid::new_v4().to_string();
        self.sessions
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?
            .insert(session_id.clone(), session);

        thread::spawn(move || {
            let mut buffer = vec![0; 8192];
            while let Ok(read) = reader.read(&mut buffer) {
                if read == 0 {
                    break;
                }
                terminal_output(buffer[..read].to_vec());
            }
        });

        let sessions = Arc::clone(&self.sessions);
        let finished_id = session_id.clone();
        let finished_events = Arc::clone(&events);
        thread::spawn(move || {
            let _ = child.wait();
            if let Ok(mut entries) = sessions.lock() {
                entries.remove(&finished_id);
            }
            finished_events(LocalSessionEvent::Closed);
        });

        events(LocalSessionEvent::Connected);
        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: Vec<u8>) -> Result<(), LocalSessionError> {
        if data.is_empty() || data.len() > 64 * 1024 {
            return Err(LocalSessionError::InvalidTerminalInput);
        }
        let session = self.session(session_id)?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?;
        writer
            .write_all(&data)
            .and_then(|_| writer.flush())
            .map_err(|_| LocalSessionError::ControlUnavailable)
    }

    pub fn resize(&self, session_id: &str, size: PtySize) -> Result<(), LocalSessionError> {
        let session = self.session(session_id)?;
        session
            .master
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?
            .resize(size)
            .map_err(|_| LocalSessionError::ControlUnavailable)
    }

    pub fn close(&self, session_id: &str) -> Result<(), LocalSessionError> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?
            .remove(session_id)
            .ok_or(LocalSessionError::SessionNotFound)?;
        let _ = session
            .killer
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?
            .kill();
        Ok(())
    }

    fn session(&self, session_id: &str) -> Result<Arc<LocalSession>, LocalSessionError> {
        self.sessions
            .lock()
            .map_err(|_| LocalSessionError::ControlUnavailable)?
            .get(session_id)
            .cloned()
            .ok_or(LocalSessionError::SessionNotFound)
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::mpsc, time::Duration};

    use portable_pty::PtySize;

    use super::{LocalSessionEvent, LocalSessionManager};

    #[test]
    fn default_shell_routes_terminal_io_and_can_be_closed() {
        let manager = LocalSessionManager::default();
        let (output_tx, output_rx) = mpsc::channel::<Vec<u8>>();
        let (event_tx, event_rx) = mpsc::channel::<LocalSessionEvent>();
        let session_id = manager
            .connect(
                PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                },
                Arc::new(move |data| {
                    let _ = output_tx.send(data);
                }),
                Arc::new(move |event| {
                    let _ = event_tx.send(event);
                }),
            )
            .expect("start default shell");

        assert_eq!(
            event_rx.recv_timeout(Duration::from_secs(5)),
            Ok(LocalSessionEvent::Connected)
        );
        let mut output = Vec::new();
        for _ in 0..20 {
            if let Ok(chunk) = output_rx.recv_timeout(Duration::from_millis(250)) {
                output.extend(chunk);
                if output.windows(4).any(|window| window == b"\x1b[6n") {
                    manager
                        .write(&session_id, b"\x1b[1;1R".to_vec())
                        .expect("answer cursor position query");
                    break;
                }
            }
        }
        manager
            .write(&session_id, b"echo qterm-local-ready\r".to_vec())
            .expect("write command");

        for _ in 0..40 {
            if let Ok(chunk) = output_rx.recv_timeout(Duration::from_millis(250)) {
                output.extend(chunk);
                if String::from_utf8_lossy(&output).contains("qterm-local-ready") {
                    break;
                }
            }
        }
        assert!(
            String::from_utf8_lossy(&output).contains("qterm-local-ready"),
            "local shell output was: {:?}",
            String::from_utf8_lossy(&output)
        );
        manager.close(&session_id).expect("close shell");
    }

    use std::sync::Arc;
}
