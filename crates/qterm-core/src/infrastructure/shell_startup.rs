//! Bounded, per-process handshake; no terminal input is accepted before it completes.
use std::time::Duration;

pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_STARTUP_BYTES: usize = 64 * 1024;

pub struct ShellStartup {
    marker: String,
    output: Vec<u8>,
    received: usize,
}

impl ShellStartup {
    pub fn new() -> Self {
        Self {
            marker: format!("\x1b] QTERM-READY-{}\x07", uuid::Uuid::new_v4()),
            output: Vec::new(),
            received: 0,
        }
    }

    pub fn marker(&self) -> &str {
        &self.marker
    }

    /// Returns output without the private handshake, once initialization is complete.
    pub fn push(&mut self, bytes: &[u8]) -> Result<Option<Vec<u8>>, ()> {
        self.account(bytes.len())?;
        self.output.extend_from_slice(bytes);
        let Some(index) = self
            .output
            .windows(self.marker.len())
            .position(|w| w == self.marker.as_bytes())
        else {
            return Ok(None);
        };
        self.output.drain(index..index + self.marker.len());
        Ok(Some(std::mem::take(&mut self.output)))
    }

    pub fn account(&mut self, count: usize) -> Result<(), ()> {
        self.received = self.received.saturating_add(count);
        if self.received > MAX_STARTUP_BYTES {
            Err(())
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_every_split_and_preserves_terminal_output() {
        let reference = ShellStartup::new();
        for split in 0..reference.marker.len() {
            let mut startup = ShellStartup {
                marker: reference.marker.clone(),
                output: b"banner".to_vec(),
                received: 6,
            };
            assert_eq!(
                startup.push(&reference.marker.as_bytes()[..split]),
                Ok(None)
            );
            let rest = [&reference.marker.as_bytes()[split..], b"prompt"].concat();
            assert_eq!(startup.push(&rest), Ok(Some(b"bannerprompt".to_vec())));
        }
    }

    #[test]
    fn an_echoed_exec_request_is_not_a_ready_shell() {
        let mut startup = ShellStartup::new();
        let command =
            crate::domain::history_free_shell::remote_command(true, None, startup.marker());
        assert!(!command.contains(startup.marker()));
        assert_eq!(startup.push(command.as_bytes()), Ok(None));
    }

    #[test]
    fn rejects_unbounded_output_and_does_not_accept_another_sessions_marker() {
        let mut startup = ShellStartup::new();
        assert_eq!(
            startup.push(ShellStartup::new().marker().as_bytes()),
            Ok(None)
        );
        assert_eq!(startup.push(&vec![b'x'; MAX_STARTUP_BYTES]), Err(()));
    }
}
