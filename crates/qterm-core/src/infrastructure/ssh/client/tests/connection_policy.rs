use super::*;
use crate::infrastructure::ssh::client::{ClientHandler, KnownHostService, new_forward_permits};
use russh::{
    client::Handler,
    keys::{
        HashAlg, PrivateKey, PublicKeyOrCertificate,
        ssh_key::{certificate, private::Ed25519Keypair},
    },
};

#[tokio::test]
async fn trusting_a_raw_host_key_does_not_trust_a_certificate_for_that_key() {
    let directory = tempdir().unwrap();
    let node = route_metadata("server.test", 22);
    let key = PrivateKey::new(Ed25519Keypair::from_seed(&[7; 32]).into(), "").unwrap();
    let public_key = key.public_key();
    let known_hosts = KnownHostService::new(JsonKnownHostRepository::new(
        directory.path().join("known-hosts.json"),
    ));
    known_hosts
        .accept(
            &node.endpoint,
            &PresentedHostKey::new(
                public_key.algorithm().to_string(),
                public_key.to_openssh().unwrap(),
                public_key.fingerprint(HashAlg::Sha256).to_string(),
            ),
        )
        .unwrap();

    let mut handler = ClientHandler {
        entry: Arc::new(SessionEntry::new(
            node.clone(),
            SessionPurpose::Terminal,
            None,
            Arc::new(|_| {}),
            oneshot::channel().0,
            mpsc::channel(1).0,
        )),
        node,
        host_keys: Arc::new(known_hosts),
        remote_forwards: Default::default(),
        forward_tasks: Default::default(),
        forward_permits: new_forward_permits(),
        allow_remote_forwards: false,
    };
    assert!(
        handler
            .check_server_key(&public_key.clone().into())
            .await
            .unwrap()
    );

    let mut cert =
        certificate::Builder::new([1; 32], public_key.key_data().clone(), 0, u64::MAX).unwrap();
    cert.cert_type(certificate::CertType::Host).unwrap();
    cert.valid_principal("server.test").unwrap();
    let server_key = PublicKeyOrCertificate::Certificate(cert.sign(&key).unwrap());
    assert!(!handler.check_server_key(&server_key).await.unwrap());
    assert_eq!(handler.entry.state(), SessionState::Failed);
}

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
