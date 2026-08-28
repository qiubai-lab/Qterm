use std::fmt;

pub const MAX_INITIAL_DIRECTORY_BYTES: usize = 4 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InitialDirectory(String);

impl InitialDirectory {
    pub fn new(value: String) -> Option<Self> {
        (!value.is_empty() && value.len() <= MAX_INITIAL_DIRECTORY_BYTES && !value.contains('\0'))
            .then_some(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct HostEndpoint {
    host: String,
    port: u16,
}

impl HostEndpoint {
    pub fn new(host: impl AsRef<str>, port: u32) -> Result<Self, SessionValidationError> {
        let host = host.as_ref().trim();
        if host.is_empty() || host.len() > 253 || host.chars().any(char::is_whitespace) {
            return Err(SessionValidationError::Host);
        }
        let port = u16::try_from(port).map_err(|_| SessionValidationError::Port)?;
        if port == 0 {
            return Err(SessionValidationError::Port);
        }
        Ok(Self {
            host: host.to_owned(),
            port,
        })
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

pub fn validate_username(username: &str) -> Result<String, SessionValidationError> {
    let username = username.trim();
    if username.is_empty()
        || username.len() > 128
        || username
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        Err(SessionValidationError::Username)
    } else {
        Ok(username.to_owned())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PresentedHostKey {
    algorithm: String,
    encoded: String,
    fingerprint: String,
}

impl PresentedHostKey {
    pub fn new(algorithm: String, encoded: String, fingerprint: String) -> Self {
        Self {
            algorithm,
            encoded,
            fingerprint,
        }
    }

    pub fn algorithm(&self) -> &str {
        &self.algorithm
    }

    pub fn encoded(&self) -> &str {
        &self.encoded
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HostKeyCheck {
    Trusted,
    Unknown,
    Changed { trusted_fingerprint: String },
}

pub fn classify_host_key(
    trusted: Option<&PresentedHostKey>,
    presented: &PresentedHostKey,
) -> HostKeyCheck {
    match trusted {
        None => HostKeyCheck::Unknown,
        Some(trusted) if trusted.encoded == presented.encoded => HostKeyCheck::Trusted,
        Some(trusted) => HostKeyCheck::Changed {
            trusted_fingerprint: trusted.fingerprint.clone(),
        },
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionState {
    Connecting,
    AwaitingHostKey,
    Authenticating,
    Connected,
    Closing,
    Closed,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionFailure {
    ConnectionFailed,
    HostKeyChanged,
    HostKeyRejected,
    HostKeyDecisionTimeout,
    KnownHostsUnavailable,
    Authentication(crate::domain::auth::AuthFailure),
    TunnelOpenFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RouteNodeRole {
    Jump,
    Target,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RouteStage {
    Connect,
    VerifyHostKey,
    Authenticate,
    OpenTunnel,
    StartSession,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteNodeMetadata {
    pub profile_id: String,
    pub name: String,
    pub endpoint: HostEndpoint,
    pub index: usize,
    pub total: usize,
    pub role: RouteNodeRole,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionEvent {
    StateChanged(SessionState),
    RouteProgress {
        node: RouteNodeMetadata,
        stage: RouteStage,
    },
    HostKeyConfirmationRequired {
        node: RouteNodeMetadata,
        algorithm: String,
        fingerprint: String,
    },
    HostKeyChanged {
        node: RouteNodeMetadata,
        trusted_fingerprint: String,
        presented_fingerprint: String,
    },
    Failed {
        failure: SessionFailure,
        node: Option<RouteNodeMetadata>,
        stage: Option<RouteStage>,
    },
}

pub struct SessionStateMachine {
    state: SessionState,
}

impl SessionStateMachine {
    pub fn new() -> Self {
        Self {
            state: SessionState::Connecting,
        }
    }

    pub fn state(&self) -> SessionState {
        self.state
    }

    pub fn transition(&mut self, next: SessionState) -> Result<(), InvalidSessionTransition> {
        let allowed = matches!(
            (self.state, next),
            (SessionState::Connecting, SessionState::AwaitingHostKey)
                | (SessionState::Connecting, SessionState::Authenticating)
                | (SessionState::AwaitingHostKey, SessionState::Authenticating)
                | (SessionState::AwaitingHostKey, SessionState::Connecting)
                | (SessionState::Authenticating, SessionState::Connecting)
                | (SessionState::Authenticating, SessionState::Connected)
                | (SessionState::Connected, SessionState::Closing)
                | (SessionState::Connecting, SessionState::Closing)
                | (SessionState::AwaitingHostKey, SessionState::Closing)
                | (SessionState::Authenticating, SessionState::Closing)
                | (SessionState::Closing, SessionState::Closed)
        ) || (next == SessionState::Failed
            && !matches!(self.state, SessionState::Closed | SessionState::Failed));
        if !allowed {
            return Err(InvalidSessionTransition {
                from: self.state,
                to: next,
            });
        }
        self.state = next;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionValidationError {
    Host,
    Port,
    Username,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerminalSize {
    pub columns: u32,
    pub rows: u32,
}

impl TerminalSize {
    pub fn new(columns: u32, rows: u32) -> Result<Self, TerminalSizeError> {
        if !(1..=1000).contains(&columns) || !(1..=1000).contains(&rows) {
            Err(TerminalSizeError)
        } else {
            Ok(Self { columns, rows })
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerminalSizeError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidSessionTransition {
    pub from: SessionState,
    pub to: SessionState,
}

impl fmt::Display for InvalidSessionTransition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid session transition")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        HostKeyCheck, InitialDirectory, MAX_INITIAL_DIRECTORY_BYTES, PresentedHostKey,
        SessionState, SessionStateMachine, classify_host_key,
    };

    fn key(encoded: &str, fingerprint: &str) -> PresentedHostKey {
        PresentedHostKey::new("ssh-ed25519".into(), encoded.into(), fingerprint.into())
    }

    #[test]
    fn host_keys_are_unknown_trusted_or_changed_by_exact_key_data() {
        let first = key("key-a", "SHA256:first");
        let changed = key("key-b", "SHA256:changed");
        assert_eq!(classify_host_key(None, &first), HostKeyCheck::Unknown);
        assert_eq!(
            classify_host_key(Some(&first), &first),
            HostKeyCheck::Trusted
        );
        assert_eq!(
            classify_host_key(Some(&first), &changed),
            HostKeyCheck::Changed {
                trusted_fingerprint: "SHA256:first".into()
            }
        );
    }

    #[test]
    fn session_state_machine_rejects_skipping_security_and_cleanup_states() {
        let mut machine = SessionStateMachine::new();
        assert!(machine.transition(SessionState::Connected).is_err());
        machine
            .transition(SessionState::AwaitingHostKey)
            .expect("await host key");
        machine
            .transition(SessionState::Authenticating)
            .expect("authenticate after trust");
        machine
            .transition(SessionState::Connected)
            .expect("connected after authentication");
        assert!(machine.transition(SessionState::Closed).is_err());
        machine.transition(SessionState::Closing).expect("closing");
        machine.transition(SessionState::Closed).expect("closed");
        assert!(machine.transition(SessionState::Failed).is_err());
    }

    #[test]
    fn session_state_machine_allows_repeating_connect_and_authenticate_for_route_nodes() {
        let mut machine = SessionStateMachine::new();
        machine
            .transition(SessionState::Authenticating)
            .expect("jump auth");
        machine
            .transition(SessionState::Connecting)
            .expect("next hop");
        machine
            .transition(SessionState::AwaitingHostKey)
            .expect("target host key");
        machine
            .transition(SessionState::Authenticating)
            .expect("target auth");
        machine
            .transition(SessionState::Connected)
            .expect("target connected");
    }

    #[test]
    fn failures_are_terminal_from_each_active_state() {
        for state in [
            SessionState::Connecting,
            SessionState::AwaitingHostKey,
            SessionState::Authenticating,
            SessionState::Connected,
            SessionState::Closing,
        ] {
            let mut machine = SessionStateMachine::new();
            for next in path_to(state) {
                machine.transition(next).expect("fixture path is valid");
            }
            machine
                .transition(SessionState::Failed)
                .expect("fail active state");
            assert_eq!(machine.state(), SessionState::Failed);
        }
    }

    #[test]
    fn terminal_size_rejects_zero_and_unbounded_dimensions() {
        assert!(super::TerminalSize::new(80, 24).is_ok());
        assert!(super::TerminalSize::new(0, 24).is_err());
        assert!(super::TerminalSize::new(80, 1001).is_err());
    }

    #[test]
    fn initial_directory_is_bounded_and_rejects_empty_or_nul_input() {
        assert_eq!(
            InitialDirectory::new("/srv/project with spaces".into())
                .expect("valid path")
                .as_str(),
            "/srv/project with spaces"
        );
        assert!(InitialDirectory::new(String::new()).is_none());
        assert!(InitialDirectory::new("/srv/has\0nul".into()).is_none());
        assert!(InitialDirectory::new("x".repeat(MAX_INITIAL_DIRECTORY_BYTES + 1)).is_none());
    }

    fn path_to(state: SessionState) -> Vec<SessionState> {
        match state {
            SessionState::Connecting => vec![],
            SessionState::AwaitingHostKey => vec![SessionState::AwaitingHostKey],
            SessionState::Authenticating => {
                vec![SessionState::AwaitingHostKey, SessionState::Authenticating]
            }
            SessionState::Connected => vec![
                SessionState::AwaitingHostKey,
                SessionState::Authenticating,
                SessionState::Connected,
            ],
            SessionState::Closing => vec![SessionState::Closing],
            _ => unreachable!("fixture only uses active states"),
        }
    }
}
