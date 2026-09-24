use super::pty::LocalSessionError;
use crate::infrastructure::shell_startup::{STARTUP_TIMEOUT, ShellStartup};
use portable_pty::CommandBuilder;
use std::{
    io::Read,
    sync::{Arc, mpsc},
    thread,
};

pub(super) fn command(
    startup: &ShellStartup,
    osc7: bool,
) -> Result<CommandBuilder, LocalSessionError> {
    #[cfg(unix)]
    {
        use crate::domain::history_free_shell;
        let mut command = CommandBuilder::new("bash");
        command.args(history_free_shell::BASH_ARGUMENTS);
        for key in ["BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS"] {
            command.env_remove(key);
        }
        for (key, value) in history_free_shell::environment(osc7, None, startup.marker()) {
            command.env(key, value);
        }
        Ok(command)
    }
    #[cfg(not(unix))]
    {
        let _ = (startup, osc7);
        Err(LocalSessionError::HistoryFreeUnavailable)
    }
}

pub(super) fn read_until_ready(
    mut reader: Box<dyn Read + Send>,
    output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
    mut startup: ShellStartup,
) -> Result<(), LocalSessionError> {
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut ready = false;
        let mut buffer = [0; 8192];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 {
                break;
            }
            if ready {
                output(buffer[..count].to_vec());
            } else {
                match startup.push(&buffer[..count]) {
                    Ok(Some(data)) => {
                        output(data);
                        ready = true;
                        if ready_tx.send(()).is_err() {
                            return;
                        }
                    }
                    Ok(None) => {}
                    Err(()) => return,
                }
            }
        }
    });
    ready_rx
        .recv_timeout(STARTUP_TIMEOUT)
        .map_err(|_| LocalSessionError::HistoryFreeUnavailable)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(not(unix))]
    #[test]
    fn unsupported_local_platform_never_falls_back() {
        assert!(matches!(
            command(&ShellStartup::new(), true),
            Err(LocalSessionError::HistoryFreeUnavailable)
        ));
    }

    #[test]
    fn handshake_delivers_output_without_the_marker_and_rejects_early_eof() {
        let startup = ShellStartup::new();
        let bytes = format!("before{}after", startup.marker()).into_bytes();
        let output = Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured = output.clone();
        read_until_ready(
            Box::new(std::io::Cursor::new(bytes)),
            Arc::new(move |bytes| captured.lock().unwrap().extend(bytes)),
            startup,
        )
        .unwrap();
        assert_eq!(*output.lock().unwrap(), b"beforeafter");
        assert_eq!(
            read_until_ready(
                Box::new(std::io::Cursor::new(b"failed")),
                Arc::new(|_| {}),
                ShellStartup::new()
            ),
            Err(LocalSessionError::HistoryFreeUnavailable)
        );
    }
}
