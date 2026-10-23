use super::*;

pub(in crate::infrastructure::ssh::client) fn connect_request(
    endpoint: HostEndpoint,
    username: String,
    auth: AuthRequest,
    purpose: SessionPurpose,
    profile_id: Option<String>,
    terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> SessionConnectRequest {
    SessionConnectRequest {
        route: vec![SessionRouteNode {
            profile_id: profile_id.clone().unwrap_or_else(|| "profile-1".into()),
            name: "Test profile".into(),
            endpoint,
            username,
            auth,
        }],
        purpose,
        profile_id,
        terminal_size: (purpose == SessionPurpose::Terminal)
            .then(|| TerminalSize::new(93, 31).expect("terminal size")),
        initial_directory: None,
        terminal_output,
        remote_shell_integration_enabled: false,
        history_free_bash_enabled: false,
    }
}
