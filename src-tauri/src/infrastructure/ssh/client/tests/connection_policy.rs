use super::*;

#[test]
fn terminal_connect_request_keeps_the_initial_pty_size() {
    let request = connect_request(
        HostEndpoint::new("example.test", 22).expect("endpoint"),
        "user".into(),
        AuthRequest::SshAgent,
        SessionPurpose::Terminal,
        Some("profile-1".into()),
        Arc::new(|_| {}),
    );

    assert_eq!(
        initial_terminal_size(&request),
        TerminalSize::new(93, 31).expect("terminal size")
    );
}

#[test]
fn shell_integration_is_scoped_to_enabled_terminal_requests() {
    let mut request = connect_request(
        HostEndpoint::new("example.test", 22).expect("endpoint"),
        "user".into(),
        AuthRequest::SshAgent,
        SessionPurpose::Terminal,
        Some("profile-1".into()),
        Arc::new(|_| {}),
    );
    assert_eq!(shell_integration_target(&request), None);

    request.remote_shell_integration_enabled = true;
    let target = shell_integration_target(&request).expect("integration target");
    assert_eq!(target.profile_id(), "profile-1");
    assert_eq!(target.host(), "example.test");
    assert_eq!(target.port(), 22);
    assert_eq!(target.username(), "user");

    request.purpose = SessionPurpose::Files;
    assert_eq!(shell_integration_target(&request), None);
}
