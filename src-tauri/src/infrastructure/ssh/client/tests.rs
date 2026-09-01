use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc as std_mpsc},
    thread,
    time::Duration,
};

use tempfile::tempdir;
use tokio::sync::{mpsc, oneshot};

use super::{
    HostKeyDecision, PendingHostKey, SessionConnectRequest, SessionControl, SessionEntry,
    SessionPurpose, SessionRouteNode, SshSessionManager, TransferRequest,
    scan_local_upload_entries,
    session::{initial_terminal_size, shell_integration_target},
};
use crate::{
    domain::{
        auth::{AuthRequest, SecretText},
        files::{DirectoryListing, FileEntry},
        network::ForwardRuleKind,
        session::{
            HostEndpoint, PresentedHostKey, RouteNodeMetadata, RouteNodeRole, SessionEvent,
            SessionFailure, SessionState, TerminalSize,
        },
        terminal_staging::{TerminalStagingError, TerminalStagingEvent},
        transfer::{RemotePath, TransferEvent},
    },
    infrastructure::persistence::{
        json_known_host_repository::JsonKnownHostRepository,
        json_remote_shell_cache::JsonRemoteShellCache,
    },
    ports::remote_git_executor::RemoteGitExecutor,
    ports::terminal_staging::{RemoteTerminalStagingStore, StagingSourceEntry},
};

fn route_metadata(host: &str, port: u16) -> RouteNodeMetadata {
    RouteNodeMetadata {
        profile_id: "profile-1".into(),
        name: "Test profile".into(),
        endpoint: HostEndpoint::new(host, u32::from(port)).expect("endpoint"),
        index: 0,
        total: 1,
        role: RouteNodeRole::Target,
    }
}

fn connect_request(
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
    }
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

#[test]
fn unknown_session_controls_are_rejected() {
    let directory = tempdir().expect("temp directory");
    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    assert!(manager.close("missing").is_err());
    assert!(manager.accept_host_key("missing").is_err());
    assert!(manager.reject_host_key("missing").is_err());

    manager.finish("finished");
    assert!(manager.close("finished").is_ok());
}

#[test]
fn closing_during_host_key_confirmation_is_not_reported_as_rejection() {
    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, _control_receiver) = mpsc::channel(1);
    let entry = SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Terminal,
        None,
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    );
    entry.transition(SessionState::AwaitingHostKey);
    let (decision_sender, mut decision_receiver) = oneshot::channel();
    entry.set_pending(PendingHostKey {
        endpoint: HostEndpoint::new("example.com", 22).expect("endpoint"),
        node: route_metadata("example.com", 22),
        key: PresentedHostKey::new("ssh-ed25519".into(), "key".into(), "SHA256:x".into()),
        decision: decision_sender,
    });

    entry.begin_close();

    assert_eq!(entry.state(), SessionState::Closing);
    assert_eq!(
        decision_receiver.try_recv().expect("close decision"),
        HostKeyDecision::Cancel
    );
}

#[test]
fn closes_only_network_sessions_for_a_deleted_profile() {
    let directory = tempdir().expect("temp directory");
    let manager = SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    );
    let entry = |purpose, profile_id: Option<&str>| {
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        let (control_sender, control_receiver) = mpsc::channel(1);
        (
            Arc::new(SessionEntry::new(
                route_metadata("example.com", 22),
                purpose,
                profile_id.map(str::to_owned),
                Arc::new(|_| {}),
                cancel_sender,
                control_sender,
            )),
            cancel_receiver,
            control_receiver,
        )
    };
    let (target, mut target_cancel, _target_control) =
        entry(SessionPurpose::Network, Some("profile-1"));
    let (other, mut other_cancel, _other_control) =
        entry(SessionPurpose::Network, Some("profile-2"));
    let (terminal, mut terminal_cancel, _terminal_control) =
        entry(SessionPurpose::Terminal, Some("profile-1"));
    {
        let mut sessions = manager.sessions.lock().expect("sessions");
        sessions.insert("target".into(), target);
        sessions.insert("other".into(), other);
        sessions.insert("terminal".into(), terminal);
    }

    assert_eq!(manager.close_profile_network_sessions("profile-1"), 1);
    assert!(target_cancel.try_recv().is_ok());
    assert!(matches!(
        other_cancel.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
    assert!(matches!(
        terminal_cancel.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
}

#[test]
fn closes_only_git_sessions_for_a_deleted_profile() {
    let directory = tempdir().expect("temp directory");
    let manager = SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    );
    let entry = |purpose, profile_id: &str| {
        let (cancel_sender, cancel_receiver) = oneshot::channel();
        let (control_sender, control_receiver) = mpsc::channel(1);
        (
            Arc::new(SessionEntry::new(
                route_metadata("example.com", 22),
                purpose,
                Some(profile_id.into()),
                Arc::new(|_| {}),
                cancel_sender,
                control_sender,
            )),
            cancel_receiver,
            control_receiver,
        )
    };
    let (target, mut target_cancel, _target_control) = entry(SessionPurpose::Git, "profile-1");
    let (other, mut other_cancel, _other_control) = entry(SessionPurpose::Git, "profile-2");
    let (terminal, mut terminal_cancel, _terminal_control) =
        entry(SessionPurpose::Terminal, "profile-1");
    {
        let mut sessions = manager.sessions.lock().expect("sessions");
        sessions.insert("target".into(), target);
        sessions.insert("other".into(), other);
        sessions.insert("terminal".into(), terminal);
    }
    assert_eq!(manager.close_profile_git_sessions("profile-1"), 1);
    assert!(target_cancel.try_recv().is_ok());
    assert!(matches!(
        other_cancel.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
    assert!(matches!(
        terminal_cancel.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
}

#[test]
fn files_sessions_reject_terminal_write_and_resize_controls() {
    let directory = tempdir().expect("temp directory");
    let manager = SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    );
    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, _control_receiver) = mpsc::channel(1);
    let entry = Arc::new(SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Files,
        None,
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    ));
    manager
        .sessions
        .lock()
        .expect("sessions")
        .insert("files-1".into(), entry);

    assert_eq!(
        manager.write("files-1", b"pwd\r".to_vec()),
        Err(super::SessionControlError::TerminalUnavailable)
    );
    assert_eq!(
        manager.resize(
            "files-1",
            crate::domain::session::TerminalSize::new(80, 24).expect("size")
        ),
        Err(super::SessionControlError::TerminalUnavailable)
    );
    assert_eq!(
        manager.start("files-1", Vec::new(), Arc::new(|_| {})),
        Err(TerminalStagingError::TerminalUnavailable)
    );
    assert_eq!(
        manager.start("missing", Vec::new(), Arc::new(|_| {})),
        Err(TerminalStagingError::SessionNotFound)
    );
}

#[tokio::test]
async fn git_actions_require_a_connected_git_purpose_session_owned_by_the_profile() {
    let directory = tempdir().expect("temp directory");
    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, mut control_receiver) = mpsc::channel(1);
    let entry = Arc::new(SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Git,
        Some("profile-1".into()),
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    ));
    entry.transition(SessionState::Authenticating);
    entry.transition(SessionState::Connected);
    manager
        .sessions
        .lock()
        .expect("sessions")
        .insert("git-1".into(), entry);

    assert_eq!(
        manager
            .execute(
                "git-1",
                "other-profile",
                crate::domain::git::RemoteGitAction::Snapshot {
                    path: "/srv/project".into()
                }
            )
            .await,
        Err(crate::domain::git::GitError::SessionUnavailable)
    );

    let request = {
        let manager = Arc::clone(&manager);
        tokio::spawn(async move {
            manager
                .execute(
                    "git-1",
                    "profile-1",
                    crate::domain::git::RemoteGitAction::Snapshot {
                        path: "/srv/project".into(),
                    },
                )
                .await
        })
    };
    let Some(SessionControl::RunGit { action, reply }) = control_receiver.recv().await else {
        panic!("Git control")
    };
    assert_eq!(
        action,
        crate::domain::git::RemoteGitAction::Snapshot {
            path: "/srv/project".into()
        }
    );
    let _ = reply.send(Err(crate::domain::git::GitError::Missing));
    assert_eq!(
        request.await.expect("request"),
        Err(crate::domain::git::GitError::Missing)
    );

    for action in [
        crate::domain::git::RemoteGitAction::Fetch {
            repository: "/srv/project".into(),
        },
        crate::domain::git::RemoteGitAction::TrackRemoteBranch {
            repository: "/srv/project".into(),
            ref_name: "refs/remotes/origin/feature/test".into(),
        },
        crate::domain::git::RemoteGitAction::CreateBranchFrom {
            repository: "/srv/project".into(),
            name: "feature/from-main".into(),
            source_ref: "refs/remotes/origin/main".into(),
        },
        crate::domain::git::RemoteGitAction::CreateBranchFromCommit {
            repository: "/srv/project".into(),
            name: "feature/history".into(),
            oid: "0123456789abcdef0123456789abcdef01234567".into(),
        },
        crate::domain::git::RemoteGitAction::RenameBranch {
            repository: "/srv/project".into(),
            ref_name: "refs/heads/feature/from-main".into(),
            new_name: "feature/renamed".into(),
        },
        crate::domain::git::RemoteGitAction::DeleteBranch {
            repository: "/srv/project".into(),
            ref_name: "refs/heads/feature/renamed".into(),
        },
        crate::domain::git::RemoteGitAction::Pull {
            repository: "/srv/project".into(),
        },
        crate::domain::git::RemoteGitAction::Push {
            repository: "/srv/project".into(),
            remote: Some("origin".into()),
        },
        crate::domain::git::RemoteGitAction::MergeBranch {
            repository: "/srv/project".into(),
            source_ref: "refs/remotes/origin/feature/test".into(),
        },
        crate::domain::git::RemoteGitAction::ContinueMerge {
            repository: "/srv/project".into(),
        },
        crate::domain::git::RemoteGitAction::AbortMerge {
            repository: "/srv/project".into(),
        },
    ] {
        let expected = action.clone();
        let action_request = {
            let manager = Arc::clone(&manager);
            tokio::spawn(async move { manager.execute("git-1", "profile-1", action).await })
        };
        let Some(SessionControl::RunGit { action, reply }) = control_receiver.recv().await else {
            panic!("Git fetch/track control")
        };
        assert_eq!(action, expected);
        let _ = reply.send(Err(crate::domain::git::GitError::Missing));
        assert_eq!(
            action_request.await.expect("action request"),
            Err(crate::domain::git::GitError::Missing)
        );
    }

    assert_eq!(
        manager
            .commit_files(
                "git-1",
                "other-profile",
                "/srv/project".into(),
                "0123456789abcdef0123456789abcdef01234567".into(),
            )
            .await,
        Err(crate::domain::git::GitError::SessionUnavailable)
    );
    let files_request = {
        let manager = Arc::clone(&manager);
        tokio::spawn(async move {
            manager
                .commit_files(
                    "git-1",
                    "profile-1",
                    "/srv/project".into(),
                    "0123456789abcdef0123456789abcdef01234567".into(),
                )
                .await
        })
    };
    let Some(SessionControl::RunGitCommitFiles {
        repository,
        oid,
        reply,
    }) = control_receiver.recv().await
    else {
        panic!("Git commit files control")
    };
    assert_eq!(repository, "/srv/project");
    assert_eq!(oid, "0123456789abcdef0123456789abcdef01234567");
    let expected = vec![crate::domain::git::GitCommitFile {
        path: "src/main.rs".into(),
        original_path: None,
        status: "M".into(),
    }];
    let _ = reply.send(Ok(expected.clone()));
    assert_eq!(files_request.await.expect("request"), Ok(expected));
}

#[tokio::test]
async fn git_directory_listing_requires_a_connected_git_session_owned_by_the_profile() {
    let directory = tempdir().expect("temp directory");
    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, mut control_receiver) = mpsc::channel(4);
    let entry = Arc::new(SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Git,
        Some("profile-1".into()),
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    ));
    entry.transition(SessionState::Authenticating);
    entry.transition(SessionState::Connected);
    manager
        .sessions
        .lock()
        .expect("sessions")
        .insert("git-directory-1".into(), entry);

    assert_eq!(
        manager
            .list_git_directory(
                "git-directory-1",
                "other-profile",
                RemotePath::new("/srv").expect("remote path"),
            )
            .await,
        Err(super::SessionControlError::DirectoryUnavailable)
    );
    assert!(matches!(
        control_receiver.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    assert_eq!(
        manager
            .list_directory(
                "git-directory-1",
                RemotePath::new("/srv").expect("remote path"),
            )
            .await,
        Err(super::SessionControlError::DirectoryUnavailable)
    );
    assert!(matches!(
        control_receiver.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    for (index, purpose) in [
        SessionPurpose::Files,
        SessionPurpose::Terminal,
        SessionPurpose::Network,
    ]
    .into_iter()
    .enumerate()
    {
        let (cancel_sender, _cancel_receiver) = oneshot::channel();
        let (control_sender, mut wrong_purpose_controls) = mpsc::channel(1);
        let wrong_purpose = Arc::new(SessionEntry::new(
            route_metadata("example.com", 22),
            purpose,
            Some("profile-1".into()),
            Arc::new(|_| {}),
            cancel_sender,
            control_sender,
        ));
        wrong_purpose.transition(SessionState::Authenticating);
        wrong_purpose.transition(SessionState::Connected);
        let session_id = format!("git-directory-wrong-purpose-{index}");
        manager
            .sessions
            .lock()
            .expect("sessions")
            .insert(session_id.clone(), wrong_purpose);

        assert_eq!(
            manager
                .list_git_directory(
                    &session_id,
                    "profile-1",
                    RemotePath::new("/srv").expect("remote path"),
                )
                .await,
            Err(super::SessionControlError::DirectoryUnavailable)
        );
        assert!(matches!(
            wrong_purpose_controls.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
    }

    let request = {
        let manager = Arc::clone(&manager);
        tokio::spawn(async move {
            manager
                .list_git_directory(
                    "git-directory-1",
                    "profile-1",
                    RemotePath::new("/srv").expect("remote path"),
                )
                .await
        })
    };
    let Some(SessionControl::ListDirectory { path, reply }) = control_receiver.recv().await else {
        panic!("Git directory control")
    };
    assert_eq!(path.as_str(), "/srv");
    let expected = DirectoryListing::new(
        "/srv".into(),
        vec![FileEntry {
            name: "project".into(),
            path: "/srv/project".into(),
            is_directory: true,
            is_symlink: false,
            size: 0,
            modified_at: None,
            permission_mode: None,
        }],
    );
    let _ = reply.send(Ok(expected.clone()));
    assert_eq!(request.await.expect("request"), Ok(expected));

    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, mut disconnected_controls) = mpsc::channel(1);
    let disconnected = Arc::new(SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Git,
        Some("profile-1".into()),
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    ));
    manager
        .sessions
        .lock()
        .expect("sessions")
        .insert("git-directory-closed".into(), disconnected);
    assert_eq!(
        manager
            .list_git_directory(
                "git-directory-closed",
                "profile-1",
                RemotePath::new("/srv").expect("remote path"),
            )
            .await,
        Err(super::SessionControlError::SessionNotConnected)
    );
    assert!(matches!(
        disconnected_controls.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
}

#[test]
fn cancelled_staging_remains_active_until_the_worker_finishes() {
    let (session_cancel, _session_cancel_receiver) = oneshot::channel();
    let (control, _controls) = mpsc::channel(1);
    let entry = SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Terminal,
        None,
        Arc::new(|_| {}),
        session_cancel,
        control,
    );
    let (upload_cancel, mut upload_cancel_receiver) = oneshot::channel();
    entry.register_clipboard_upload("task-1".into(), upload_cancel);

    assert!(entry.cancel_clipboard_upload("task-1"));
    assert!(entry.has_clipboard_uploads());
    assert!(upload_cancel_receiver.try_recv().is_ok());
    entry.finish_clipboard_upload("task-1");
    assert!(!entry.has_clipboard_uploads());
}

#[tokio::test]
async fn network_sessions_reject_rules_from_another_profile() {
    let directory = tempdir().expect("temp directory");
    let manager = SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    );
    let (cancel_sender, _cancel_receiver) = oneshot::channel();
    let (control_sender, _control_receiver) = mpsc::channel(1);
    let entry = Arc::new(SessionEntry::new(
        route_metadata("example.com", 22),
        SessionPurpose::Network,
        Some("profile-1".into()),
        Arc::new(|_| {}),
        cancel_sender,
        control_sender,
    ));
    entry.transition(SessionState::Connected);
    manager
        .sessions
        .lock()
        .expect("sessions")
        .insert("network-1".into(), entry);

    assert_eq!(
        manager
            .start_network_rule(
                "network-1",
                "rule-1".into(),
                "profile-2",
                ForwardRuleKind::socks5("127.0.0.1", 1080).expect("rule"),
            )
            .await,
        Err(super::SessionControlError::NetworkUnavailable)
    );
}

#[tokio::test]
async fn failed_tcp_connection_emits_a_terminal_failure_and_can_be_closed_again() {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("reserve port");
    let port = listener.local_addr().expect("local address").port();
    drop(listener);
    let directory = tempdir().expect("temp directory");
    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let events = Arc::new(Mutex::new(Vec::new()));
    let event_sink = Arc::clone(&events);
    let id = manager.connect(
        connect_request(
            HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
            "test".into(),
            AuthRequest::Password(SecretText::new("temporary".into())),
            SessionPurpose::Terminal,
            None,
            Arc::new(|_| {}),
        ),
        Arc::new(move |event| {
            event_sink
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(event);
        }),
    );

    // Windows may keep a recently released loopback port in a pending connect
    // state until the configured connection timeout expires.
    for _ in 0..640 {
        if events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .any(|event| {
                matches!(
                    event,
                    SessionEvent::Failed {
                        failure: SessionFailure::ConnectionFailed,
                        ..
                    }
                )
            })
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }

    assert!(
        events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .any(|event| matches!(
                event,
                SessionEvent::Failed {
                    failure: SessionFailure::ConnectionFailed,
                    ..
                }
            ))
    );
    assert!(manager.close(&id).is_ok());
}

#[tokio::test]
async fn dropped_directory_scan_aggregates_regular_files_and_nested_directories() {
    let directory = tempdir().expect("temporary upload directory");
    let root = directory.path().join("bundle");
    tokio::fs::create_dir_all(root.join("nested"))
        .await
        .expect("nested directory");
    tokio::fs::write(root.join("a.txt"), b"abc")
        .await
        .expect("root file");
    tokio::fs::write(root.join("nested/b.txt"), b"12345")
        .await
        .expect("nested file");
    let (_cancel_sender, mut cancel) = oneshot::channel();

    let plan = scan_local_upload_entries(vec![root], &mut cancel)
        .await
        .expect("scan upload")
        .expect("not cancelled");
    assert_eq!(plan.roots, vec!["bundle"]);
    assert!(plan.directories.iter().any(|path| path == "bundle/nested"));
    assert_eq!(plan.files.len(), 2);
    assert_eq!(plan.total, 8);
}

#[test]
#[ignore = "requires local OpenSSH sshd executable with TCP forwarding enabled"]
fn local_openssh_connects_to_a_target_through_a_jump_profile() {
    let directory = tempdir().expect("temporary integration directory");
    let jump_port = reserve_loopback_port();
    let target_port = reserve_loopback_port();
    let client_key = directory.path().join("route-client-key");
    let jump_host_key = directory.path().join("jump-host-key");
    let target_host_key = directory.path().join("target-host-key");
    generate_ed25519_key(&client_key);
    generate_ed25519_key(&jump_host_key);
    generate_ed25519_key(&target_host_key);
    let authorized_keys = directory.path().join("route-authorized-keys");
    fs::copy(client_key.with_extension("pub"), &authorized_keys).expect("authorized key");

    let sshd_config = |name: &str, port: u16, host_key: &Path, forwarding: bool| {
        let path = directory.path().join(format!("{name}-sshd_config"));
        fs::write(
            &path,
            format!(
                "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nAllowTcpForwarding {}\nLogLevel ERROR\n",
                host_key.display(),
                directory.path().join(format!("{name}.pid")).display(),
                authorized_keys.display(),
                if forwarding { "yes" } else { "no" },
            ),
        )
        .expect("sshd config");
        path
    };
    let jump_config = sshd_config("jump", jump_port, &jump_host_key, true);
    let target_config = sshd_config("target", target_port, &target_host_key, false);
    let start = |config: &Path| {
        Command::new("/usr/sbin/sshd")
            .args(["-D", "-e", "-f"])
            .arg(config)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start local sshd")
    };
    let mut jump_server = SshdGuard(start(&jump_config));
    let mut target_server = SshdGuard(start(&target_config));
    wait_for_sshd(&mut jump_server.0, jump_port);
    wait_for_sshd(&mut target_server.0, target_port);

    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("route-known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let username = std::env::var("USER").expect("current username");
    let (event_sender, event_receiver) = std::sync::mpsc::channel();
    let (terminal_sender, terminal_receiver) = std::sync::mpsc::channel();
    let session_id = manager.connect(
        SessionConnectRequest {
            route: vec![
                SessionRouteNode {
                    profile_id: "jump-profile".into(),
                    name: "Gateway".into(),
                    endpoint: HostEndpoint::new("127.0.0.1", jump_port.into())
                        .expect("jump endpoint"),
                    username: username.clone(),
                    auth: AuthRequest::PrivateKey {
                        path: client_key.clone(),
                        passphrase: None,
                    },
                },
                SessionRouteNode {
                    profile_id: "target-profile".into(),
                    name: "Target".into(),
                    endpoint: HostEndpoint::new("127.0.0.1", target_port.into())
                        .expect("target endpoint"),
                    username,
                    auth: AuthRequest::PrivateKey {
                        path: client_key,
                        passphrase: None,
                    },
                },
            ],
            purpose: SessionPurpose::Terminal,
            profile_id: Some("target-profile".into()),
            terminal_size: Some(TerminalSize::new(101, 37).expect("terminal size")),
            initial_directory: None,
            terminal_output: Arc::new(move |data| {
                let _ = terminal_sender.send(data);
            }),
            remote_shell_integration_enabled: false,
        },
        Arc::new(move |event| {
            let _ = event_sender.send(event);
        }),
    );
    loop {
        match event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("route event")
        {
            SessionEvent::HostKeyConfirmationRequired { .. } => manager
                .accept_host_key(&session_id)
                .expect("accept route host key"),
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed {
                failure,
                node,
                stage,
            } => {
                panic!("route failed at {node:?} {stage:?}: {failure:?}")
            }
            _ => {}
        }
    }
    manager
        .write(&session_id, b"printf 'JUMP_ROUTE_OK\\n'\r".to_vec())
        .expect("write target terminal");
    let mut output = Vec::new();
    while !String::from_utf8_lossy(&output).contains("JUMP_ROUTE_OK") {
        output.extend(
            terminal_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("target output"),
        );
    }
    manager.close(&session_id).expect("close route");
}

#[test]
#[ignore = "requires /usr/sbin/sshd, ssh-keygen, and Git 2.25+ on a POSIX host"]
fn local_openssh_exercises_remote_git_init_stage_commit_fetch_track_branch_and_snapshot() {
    let directory = tempdir().expect("temporary integration directory");
    let port = reserve_loopback_port();
    let client_key = directory.path().join("git-client-key");
    let host_key = directory.path().join("git-host-key");
    generate_ed25519_key(&client_key);
    generate_ed25519_key(&host_key);
    let authorized_keys = directory.path().join("git-authorized-keys");
    fs::copy(client_key.with_extension("pub"), &authorized_keys).expect("authorized key");
    let config = directory.path().join("git-sshd_config");
    fs::write(
        &config,
        format!(
            "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nLogLevel ERROR\n",
            host_key.display(),
            directory.path().join("git-sshd.pid").display(),
            authorized_keys.display(),
        ),
    )
    .expect("sshd config");
    let server = Command::new("/usr/sbin/sshd")
        .args(["-D", "-e", "-f"])
        .arg(&config)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start local sshd");
    let mut server = SshdGuard(server);
    wait_for_sshd(&mut server.0, port);

    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("git-known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let username = std::env::var("USER").expect("current username");
    let (event_sender, event_receiver) = std::sync::mpsc::channel();
    let session_id = manager.connect(
        connect_request(
            HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
            username,
            AuthRequest::PrivateKey {
                path: client_key,
                passphrase: None,
            },
            SessionPurpose::Git,
            Some("git-profile".into()),
            Arc::new(|_| {}),
        ),
        Arc::new(move |event| {
            let _ = event_sender.send(event);
        }),
    );
    loop {
        match event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("Git session event")
        {
            SessionEvent::HostKeyConfirmationRequired { .. } => manager
                .accept_host_key(&session_id)
                .expect("accept host key"),
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed {
                failure,
                node,
                stage,
            } => panic!("Git session failed at {node:?} {stage:?}: {failure:?}"),
            _ => {}
        }
    }

    let repository = directory.path().join("remote repo");
    fs::create_dir(&repository).expect("repository directory");
    let repository_path = repository.to_string_lossy().into_owned();
    let run = |action| {
        tauri::async_runtime::block_on(manager.execute(&session_id, "git-profile", action))
    };
    let initialized = run(crate::domain::git::RemoteGitAction::Initialize {
        path: repository_path.clone(),
    })
    .expect("remote init");
    assert!(initialized.head.unborn);
    Command::new("git")
        .args(["-C", &repository_path, "config", "user.name", "Qterm Test"])
        .status()
        .expect("git config name");
    Command::new("git")
        .args([
            "-C",
            &repository_path,
            "config",
            "user.email",
            "qterm@example.test",
        ])
        .status()
        .expect("git config email");
    fs::write(repository.join("remote file.txt"), b"remote Git\n").expect("worktree file");
    let staged = run(crate::domain::git::RemoteGitAction::Stage {
        repository: repository_path.clone(),
        paths: vec!["remote file.txt".into()],
    })
    .expect("remote stage");
    assert!(
        staged
            .changes
            .iter()
            .any(|change| change.path == "remote file.txt" && change.staged)
    );
    let committed = run(crate::domain::git::RemoteGitAction::Commit {
        repository: repository_path.clone(),
        message: "feat: remote Git".into(),
    })
    .expect("remote commit");
    assert_eq!(
        committed
            .commits
            .first()
            .map(|commit| commit.subject.as_str()),
        Some("feat: remote Git")
    );
    let origin = directory.path().join("origin.git");
    assert!(
        Command::new("git")
            .args(["init", "--bare"])
            .arg(&origin)
            .status()
            .expect("bare origin")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C", &repository_path, "remote", "add", "origin"])
            .arg(&origin)
            .status()
            .expect("origin")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C", &repository_path, "push", "-u", "origin", "HEAD"])
            .status()
            .expect("push origin")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&origin)
            .args([
                "update-ref",
                "refs/heads/remote-only",
                committed.head.oid.as_deref().expect("commit oid"),
            ])
            .status()
            .expect("remote-only ref")
            .success()
    );
    let fetched = run(crate::domain::git::RemoteGitAction::Fetch {
        repository: repository_path.clone(),
    })
    .expect("remote fetch");
    assert!(
        fetched
            .branches
            .iter()
            .any(|branch| branch.ref_name == "refs/remotes/origin/remote-only")
    );
    let tracked = run(crate::domain::git::RemoteGitAction::TrackRemoteBranch {
        repository: repository_path.clone(),
        ref_name: "refs/remotes/origin/remote-only".into(),
    })
    .expect("remote track branch");
    assert_eq!(tracked.head.name.as_deref(), Some("remote-only"));
    let created_from = run(crate::domain::git::RemoteGitAction::CreateBranchFrom {
        repository: repository_path.clone(),
        name: "feature/from-remote".into(),
        source_ref: "refs/remotes/origin/remote-only".into(),
    })
    .expect("remote branch from explicit ref");
    assert_eq!(
        created_from.head.name.as_deref(),
        Some("feature/from-remote")
    );
    assert_eq!(created_from.head.upstream, None);
    let renamed = run(crate::domain::git::RemoteGitAction::RenameBranch {
        repository: repository_path.clone(),
        ref_name: "refs/heads/feature/from-remote".into(),
        new_name: "feature/renamed".into(),
    })
    .expect("remote rename branch");
    assert_eq!(renamed.head.name.as_deref(), Some("feature/renamed"));
    run(crate::domain::git::RemoteGitAction::SwitchBranch {
        repository: repository_path.clone(),
        name: "remote-only".into(),
    })
    .expect("leave renamed branch");
    let deleted = run(crate::domain::git::RemoteGitAction::DeleteBranch {
        repository: repository_path.clone(),
        ref_name: "refs/heads/feature/renamed".into(),
    })
    .expect("safe delete renamed branch");
    assert!(
        deleted
            .branches
            .iter()
            .all(|branch| branch.ref_name != "refs/heads/feature/renamed")
    );

    run(crate::domain::git::RemoteGitAction::CreateBranch {
        repository: repository_path.clone(),
        name: "feature/publish".into(),
    })
    .expect("create publish branch");
    fs::write(repository.join("published.txt"), b"published over SSH\n").expect("published file");
    run(crate::domain::git::RemoteGitAction::StageAll {
        repository: repository_path.clone(),
    })
    .expect("stage published file");
    run(crate::domain::git::RemoteGitAction::Commit {
        repository: repository_path.clone(),
        message: "feat: publish over SSH".into(),
    })
    .expect("commit published file");
    let published = run(crate::domain::git::RemoteGitAction::Push {
        repository: repository_path.clone(),
        remote: Some("origin".into()),
    })
    .expect("publish over SSH");
    assert_eq!(
        published.head.upstream.as_deref(),
        Some("origin/feature/publish")
    );
    fs::write(
        repository.join("published.txt"),
        b"published over SSH\nsecond\n",
    )
    .expect("second published file");
    run(crate::domain::git::RemoteGitAction::StageAll {
        repository: repository_path.clone(),
    })
    .expect("stage second push");
    let pushed = run(crate::domain::git::RemoteGitAction::Commit {
        repository: repository_path.clone(),
        message: "feat: push over SSH".into(),
    })
    .expect("commit second push");
    run(crate::domain::git::RemoteGitAction::Push {
        repository: repository_path.clone(),
        remote: None,
    })
    .expect("tracked push over SSH");
    assert_eq!(pushed.head.ahead, 1);

    let peer = directory.path().join("peer");
    assert!(
        Command::new("git")
            .args(["clone", "--branch", "feature/publish"])
            .arg(&origin)
            .arg(&peer)
            .status()
            .expect("clone peer")
            .success()
    );
    for (key, value) in [
        ("user.name", "Qterm Peer"),
        ("user.email", "peer@example.test"),
    ] {
        assert!(
            Command::new("git")
                .args(["-C"])
                .arg(&peer)
                .args(["config", key, value])
                .status()
                .expect("configure peer")
                .success()
        );
    }
    fs::write(peer.join("peer.txt"), b"peer update\n").expect("peer update");
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&peer)
            .args(["add", "peer.txt"])
            .status()
            .expect("peer add")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&peer)
            .args(["commit", "-m", "peer update"])
            .status()
            .expect("peer commit")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&peer)
            .args(["push", "origin", "feature/publish"])
            .status()
            .expect("peer push")
            .success()
    );
    let pulled = run(crate::domain::git::RemoteGitAction::Pull {
        repository: repository_path,
    })
    .expect("ff-only pull over SSH");
    assert_eq!(pulled.head.behind, 0);
    assert!(repository.join("peer.txt").is_file());
    manager.close(&session_id).expect("close Git session");
}

#[test]
#[ignore = "requires local OpenSSH sshd and sftp-server executables"]
fn local_openssh_exercises_terminal_transfer_and_file_editing() {
    let directory = tempdir().expect("temporary integration directory");
    let port = TcpListener::bind(("127.0.0.1", 0))
        .expect("reserve local port")
        .local_addr()
        .expect("local address")
        .port();
    let client_key = directory.path().join("client-key");
    let host_key = directory.path().join("host-key");
    generate_ed25519_key(&client_key);
    generate_ed25519_key(&host_key);
    fs::copy(
        client_key.with_extension("pub"),
        directory.path().join("authorized_keys"),
    )
    .expect("authorized key");
    let config = directory.path().join("sshd_config");
    fs::write(
        &config,
        format!(
            "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nLogLevel ERROR\nSubsystem sftp /usr/libexec/sftp-server\n",
            host_key.display(),
            directory.path().join("sshd.pid").display(),
            directory.path().join("authorized_keys").display(),
        ),
    )
    .expect("sshd config");
    let server = Command::new("/usr/sbin/sshd")
        .args(["-D", "-e", "-f"])
        .arg(&config)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start local sshd");
    let mut server = SshdGuard(server);
    wait_for_sshd(&mut server.0, port);

    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let (event_sender, event_receiver) = std::sync::mpsc::channel();
    let (terminal_sender, terminal_receiver) = std::sync::mpsc::channel();
    let mut terminal_request = connect_request(
        HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
        std::env::var("USER").expect("current username"),
        AuthRequest::PrivateKey {
            path: client_key.clone(),
            passphrase: None,
        },
        SessionPurpose::Terminal,
        None,
        Arc::new(move |data| {
            let _ = terminal_sender.send(data);
        }),
    );
    terminal_request.remote_shell_integration_enabled = true;
    let session_id = manager.connect(
        terminal_request,
        Arc::new(move |event| {
            let _ = event_sender.send(event);
        }),
    );
    loop {
        match event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("session event")
        {
            SessionEvent::HostKeyConfirmationRequired { .. } => manager
                .accept_host_key(&session_id)
                .expect("accept temporary host key"),
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed { failure, .. } => panic!("connection failed: {failure:?}"),
            _ => {}
        }
    }

    manager
        .write(&session_id, b"printf 'MVP_TERMINAL_OK\\n'\r".to_vec())
        .expect("write terminal command");
    let mut output = Vec::new();
    while !String::from_utf8_lossy(&output).contains("MVP_TERMINAL_OK") {
        output.extend(
            terminal_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("terminal output"),
        );
    }
    assert!(
        output
            .windows(b"\x1b]7;file://".len())
            .any(|window| window == b"\x1b]7;file://")
    );
    let shell_cache =
        fs::read_to_string(directory.path().join("remote-shells.json")).expect("shell cache");
    assert!(shell_cache.contains("\"profileId\": \"profile-1\""));
    assert!(!shell_cache.contains("MVP_TERMINAL_OK"));

    while terminal_receiver.try_recv().is_ok() {}
    let (second_event_sender, second_event_receiver) = std::sync::mpsc::channel();
    let (second_terminal_sender, second_terminal_receiver) = std::sync::mpsc::channel();
    let mut second_terminal_request = connect_request(
        HostEndpoint::new("127.0.0.1", port.into()).expect("endpoint"),
        std::env::var("USER").expect("current username"),
        AuthRequest::PrivateKey {
            path: client_key,
            passphrase: None,
        },
        SessionPurpose::Terminal,
        None,
        Arc::new(move |data| {
            let _ = second_terminal_sender.send(data);
        }),
    );
    second_terminal_request.remote_shell_integration_enabled = true;
    let second_session_id = manager.connect(
        second_terminal_request,
        Arc::new(move |event| {
            let _ = second_event_sender.send(event);
        }),
    );
    loop {
        match second_event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("second session event")
        {
            SessionEvent::HostKeyConfirmationRequired { .. } => manager
                .accept_host_key(&second_session_id)
                .expect("accept second host key"),
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed { failure, .. } => {
                panic!("second connection failed: {failure:?}")
            }
            _ => {}
        }
    }
    manager
        .write(
            &second_session_id,
            b"printf 'SECOND_SESSION_ONLY\n'\r".to_vec(),
        )
        .expect("write second terminal command");
    let mut second_output = Vec::new();
    while !String::from_utf8_lossy(&second_output).contains("SECOND_SESSION_ONLY") {
        second_output.extend(
            second_terminal_receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("second terminal output"),
        );
    }
    std::thread::sleep(Duration::from_millis(100));
    let first_session_tail: Vec<u8> = terminal_receiver.try_iter().flatten().collect();
    assert!(!String::from_utf8_lossy(&first_session_tail).contains("SECOND_SESSION_ONLY"));

    let source = directory.path().join("upload-source.txt");
    let remote = directory.path().join("remote.txt");
    fs::write(&source, b"sftp-round-trip").expect("source file");
    let upload_events = run_test_transfer(
        &manager,
        &session_id,
        TransferRequest::Upload {
            local_path: source,
            remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
        },
    );
    assert!(
        upload_events
            .iter()
            .any(|event| matches!(event, TransferEvent::Progress { .. }))
    );
    assert!(matches!(
        upload_events.last(),
        Some(TransferEvent::Completed)
    ));
    assert_eq!(
        fs::read(&remote).expect("uploaded file"),
        b"sftp-round-trip"
    );
    let listing = tauri::async_runtime::block_on(manager.list_directory(
        &session_id,
        RemotePath::new(directory.path().to_string_lossy()).expect("directory path"),
    ))
    .expect("list remote directory");
    assert!(
        listing
            .entries
            .iter()
            .any(|entry| entry.name == "remote.txt"
                && !entry.is_directory
                && entry.permission_mode.is_some())
    );

    let replacement = directory.path().join("replacement.txt");
    fs::write(&replacement, b"must-not-overwrite").expect("replacement source");
    let overwrite_events = run_test_transfer(
        &manager,
        &session_id,
        TransferRequest::Upload {
            local_path: replacement,
            remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
        },
    );
    assert!(matches!(
        overwrite_events.last(),
        Some(TransferEvent::Failed)
    ));
    assert_eq!(
        fs::read(&remote).expect("preserved remote file"),
        b"sftp-round-trip"
    );

    let cancelled_source = directory.path().join("cancelled-source.bin");
    fs::write(&cancelled_source, vec![7_u8; 4 * 1024 * 1024]).expect("cancel source");
    let cancelled_remote = directory.path().join("cancelled.bin");
    let (cancel_sender, cancel_receiver) = std::sync::mpsc::channel();
    let cancelled_id = manager
        .start_transfer(
            &session_id,
            TransferRequest::Upload {
                local_path: cancelled_source,
                remote_path: RemotePath::new(cancelled_remote.to_string_lossy())
                    .expect("remote path"),
            },
            Arc::new(move |event| {
                let _ = cancel_sender.send(event);
            }),
        )
        .expect("start cancellable transfer");
    manager
        .cancel_transfer(&session_id, &cancelled_id)
        .expect("cancel transfer");
    loop {
        let event = cancel_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("cancel event");
        if matches!(event, TransferEvent::Cancelled) {
            break;
        }
        assert!(!matches!(
            event,
            TransferEvent::Completed | TransferEvent::Failed
        ));
    }
    assert!(!cancelled_remote.exists());
    assert!(
        !directory
            .path()
            .join("cancelled.bin.terminal-demo.part")
            .exists()
    );

    let download = directory.path().join("download.txt");
    let download_events = run_test_transfer(
        &manager,
        &session_id,
        TransferRequest::Download {
            remote_path: RemotePath::new(remote.to_string_lossy()).expect("remote path"),
            local_path: download.clone(),
        },
    );
    assert!(matches!(
        download_events.last(),
        Some(TransferEvent::Completed)
    ));
    assert_eq!(
        fs::read(download).expect("downloaded file"),
        b"sftp-round-trip"
    );

    let editable = directory.path().join("editable.md");
    fs::write(&editable, b"before").expect("editable source");
    assert!(
        Command::new("chmod")
            .args(["640"])
            .arg(&editable)
            .status()
            .expect("set editable permissions")
            .success()
    );
    let editable_path = RemotePath::new(editable.to_string_lossy()).expect("editable path");
    let document =
        tauri::async_runtime::block_on(manager.read_file(&session_id, editable_path.clone(), 1024))
            .expect("read remote text");
    let saved = tauri::async_runtime::block_on(manager.write_text_file(
        &session_id,
        editable_path.clone(),
        "after".into(),
        document.revision,
    ))
    .expect("save remote text");
    assert_eq!(saved.bytes, b"after");
    let editable_mode = Command::new("stat")
        .args(["-c", "%a"])
        .arg(&editable)
        .output()
        .expect("read editable permissions");
    assert!(editable_mode.status.success());
    assert_eq!(String::from_utf8_lossy(&editable_mode.stdout).trim(), "640");
    assert!(
        fs::read_dir(directory.path())
            .expect("temporary integration directory")
            .all(|entry| {
                let name = entry.expect("directory entry").file_name();
                let name = name.to_string_lossy();
                !name.contains("editable.md.terminal-demo-")
            })
    );
    tauri::async_runtime::block_on(manager.create_entry(
        &session_id,
        RemotePath::new(directory.path().to_string_lossy()).expect("create parent"),
        "created-empty.txt".into(),
        false,
    ))
    .expect("create remote file");
    tauri::async_runtime::block_on(manager.create_entry(
        &session_id,
        RemotePath::new(directory.path().to_string_lossy()).expect("create parent"),
        "created-folder".into(),
        true,
    ))
    .expect("create remote folder");
    assert_eq!(
        fs::metadata(directory.path().join("created-empty.txt"))
            .expect("created file")
            .len(),
        0
    );
    assert!(directory.path().join("created-folder").is_dir());
    tauri::async_runtime::block_on(manager.copy_file(
        &session_id,
        editable_path.clone(),
        "editable-copy.md".into(),
    ))
    .expect("copy remote file");
    assert_eq!(
        fs::read(directory.path().join("editable-copy.md")).expect("copied remote file"),
        b"after"
    );
    tauri::async_runtime::block_on(
        manager.rename_entry(
            &session_id,
            RemotePath::new(directory.path().join("editable-copy.md").to_string_lossy())
                .expect("copy path"),
            "editable-renamed.md".into(),
        ),
    )
    .expect("rename remote file");
    tauri::async_runtime::block_on(
        manager.delete_entry(
            &session_id,
            RemotePath::new(
                directory
                    .path()
                    .join("editable-renamed.md")
                    .to_string_lossy(),
            )
            .expect("renamed path"),
        ),
    )
    .expect("delete remote file");
    assert!(!directory.path().join("editable-renamed.md").exists());
    fs::write(&editable, b"external").expect("external edit");
    assert_eq!(
        tauri::async_runtime::block_on(manager.write_text_file(
            &session_id,
            editable_path,
            "stale".into(),
            saved.revision,
        )),
        Err(super::SessionControlError::FileConflict)
    );

    let remote_tree = directory.path().join("remote-tree");
    fs::create_dir_all(remote_tree.join("nested")).expect("remote tree");
    fs::write(remote_tree.join("root.txt"), b"root").expect("root file");
    fs::write(remote_tree.join("nested/child.txt"), b"child").expect("child file");
    let local_tree = directory.path().join("downloaded-tree");
    let directory_events = run_test_transfer(
        &manager,
        &session_id,
        TransferRequest::DownloadDirectory {
            remote_path: RemotePath::new(remote_tree.to_string_lossy()).expect("remote tree path"),
            local_path: local_tree.clone(),
        },
    );
    assert!(matches!(
        directory_events.last(),
        Some(TransferEvent::Completed)
    ));
    assert_eq!(
        fs::read(local_tree.join("root.txt")).expect("downloaded root"),
        b"root"
    );
    assert_eq!(
        fs::read(local_tree.join("nested/child.txt")).expect("downloaded child"),
        b"child"
    );

    let upload_sources = directory.path().join("upload-sources");
    let upload_bundle = upload_sources.join("bundle");
    fs::create_dir_all(upload_bundle.join("nested")).expect("upload source tree");
    fs::write(upload_bundle.join("root.txt"), b"upload-root").expect("upload root");
    fs::write(upload_bundle.join("nested/child.txt"), b"upload-child").expect("upload child");
    let remote_uploads = directory.path().join("remote-uploads");
    fs::create_dir(&remote_uploads).expect("remote upload directory");
    let upload_tree_events = run_test_transfer(
        &manager,
        &session_id,
        TransferRequest::UploadEntries {
            local_paths: vec![upload_bundle],
            remote_directory: RemotePath::new(remote_uploads.to_string_lossy())
                .expect("remote upload path"),
        },
    );
    assert!(matches!(
        upload_tree_events.last(),
        Some(TransferEvent::Completed)
    ));
    assert_eq!(
        fs::read(remote_uploads.join("bundle/root.txt")).expect("uploaded root"),
        b"upload-root"
    );
    assert_eq!(
        fs::read(remote_uploads.join("bundle/nested/child.txt")).expect("uploaded child"),
        b"upload-child"
    );

    let clipboard_sources = directory.path().join("clipboard-sources");
    fs::create_dir(&clipboard_sources).expect("clipboard sources");
    let first_source = clipboard_sources.join("first.png");
    let second_source = clipboard_sources.join("second.png");
    fs::write(&first_source, b"first-png-payload").expect("first source");
    fs::write(&second_source, b"second-png-payload").expect("second source");
    let start_staging = |source: &Path, display_name: &str| {
        let (sender, receiver) = std_mpsc::channel();
        manager
            .start(
                &session_id,
                vec![StagingSourceEntry {
                    path: source.to_path_buf(),
                    display_name: display_name.into(),
                    extension: Some("png".into()),
                    cleanup_after: false,
                }],
                Arc::new(move |event| {
                    let _ = sender.send(event);
                }),
            )
            .expect("start clipboard staging");
        loop {
            match receiver
                .recv_timeout(Duration::from_secs(10))
                .expect("clipboard staging event")
            {
                TerminalStagingEvent::Completed { remote_paths } => {
                    break remote_paths.into_iter().next().expect("remote path");
                }
                TerminalStagingEvent::Failed => panic!("clipboard staging failed"),
                TerminalStagingEvent::Cancelled => panic!("clipboard staging cancelled"),
                _ => {}
            }
        }
    };
    let first_staged_file = start_staging(&first_source, "first.png");
    let second_staged_file = start_staging(&second_source, "second.png");
    assert_ne!(first_staged_file, second_staged_file);
    assert!(first_staged_file.starts_with(&format!("/tmp/.qterm-clipboard-{session_id}/")));
    assert_eq!(
        fs::read(&first_staged_file).expect("first staged file"),
        b"first-png-payload"
    );
    let clipboard_directory = Path::new(&first_staged_file)
        .parent()
        .expect("clipboard directory")
        .to_path_buf();
    let directory_mode = Command::new("stat")
        .args(["-c", "%a"])
        .arg(&clipboard_directory)
        .output()
        .expect("clipboard directory mode");
    let file_mode = Command::new("stat")
        .args(["-c", "%a"])
        .arg(&first_staged_file)
        .output()
        .expect("clipboard file mode");
    assert_eq!(
        String::from_utf8_lossy(&directory_mode.stdout).trim(),
        "700"
    );
    assert_eq!(String::from_utf8_lossy(&file_mode.stdout).trim(), "600");

    manager.close(&session_id).expect("close session");
    loop {
        match event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("clipboard cleanup session event")
        {
            SessionEvent::StateChanged(SessionState::Closed) => break,
            SessionEvent::Failed { failure, .. } => {
                panic!("session failed during clipboard cleanup: {failure:?}")
            }
            _ => {}
        }
    }
    assert!(!clipboard_directory.exists());
    manager
        .close(&second_session_id)
        .expect("close second session");
}

#[test]
#[ignore = "requires local OpenSSH sshd executable with TCP forwarding enabled"]
fn local_openssh_exercises_local_remote_and_socks5_forwarding() {
    let directory = tempdir().expect("temporary integration directory");
    let ssh_port = reserve_loopback_port();
    let client_key = directory.path().join("network-client-key");
    let host_key = directory.path().join("network-host-key");
    generate_ed25519_key(&client_key);
    generate_ed25519_key(&host_key);
    fs::copy(
        client_key.with_extension("pub"),
        directory.path().join("network_authorized_keys"),
    )
    .expect("authorized key");
    let config = directory.path().join("network_sshd_config");
    fs::write(
        &config,
        format!(
            "Port {ssh_port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nStrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nUsePAM no\nAllowTcpForwarding yes\nGatewayPorts clientspecified\nLogLevel ERROR\n",
            host_key.display(),
            directory.path().join("network-sshd.pid").display(),
            directory.path().join("network_authorized_keys").display(),
        ),
    )
    .expect("sshd config");
    let server = Command::new("/usr/sbin/sshd")
        .args(["-D", "-e", "-f"])
        .arg(&config)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start local sshd");
    let mut server = SshdGuard(server);
    wait_for_sshd(&mut server.0, ssh_port);

    let echo_listener = TcpListener::bind(("127.0.0.1", 0)).expect("echo listener");
    let echo_port = echo_listener.local_addr().expect("echo address").port();
    let echo_thread = thread::spawn(move || {
        for _ in 0..3 {
            let (mut stream, _) = echo_listener.accept().expect("echo connection");
            let mut bytes = [0_u8; 32];
            let count = stream.read(&mut bytes).expect("echo read");
            stream.write_all(&bytes[..count]).expect("echo write");
        }
    });

    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("network-known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("remote-shells.json")),
    ));
    let (event_sender, event_receiver) = std::sync::mpsc::channel();
    let session_id = manager.connect(
        connect_request(
            HostEndpoint::new("127.0.0.1", ssh_port.into()).expect("endpoint"),
            std::env::var("USER").expect("current username"),
            AuthRequest::PrivateKey {
                path: client_key,
                passphrase: None,
            },
            SessionPurpose::Network,
            Some("profile-network".into()),
            Arc::new(|_| {}),
        ),
        Arc::new(move |event| {
            let _ = event_sender.send(event);
        }),
    );
    loop {
        match event_receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("network session event")
        {
            SessionEvent::HostKeyConfirmationRequired { .. } => manager
                .accept_host_key(&session_id)
                .expect("accept temporary host key"),
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed { failure, .. } => panic!("connection failed: {failure:?}"),
            _ => {}
        }
    }

    let local_port = reserve_loopback_port();
    tauri::async_runtime::block_on(
        manager.start_network_rule(
            &session_id,
            "local".into(),
            "profile-network",
            ForwardRuleKind::local(
                "127.0.0.1",
                u32::from(local_port),
                "127.0.0.1",
                u32::from(echo_port),
            )
            .expect("local rule"),
        ),
    )
    .expect("start local forwarding");
    assert_echo(local_port, b"local");

    let socks_port = reserve_loopback_port();
    tauri::async_runtime::block_on(manager.start_network_rule(
        &session_id,
        "socks".into(),
        "profile-network",
        ForwardRuleKind::socks5("127.0.0.1", u32::from(socks_port)).expect("socks rule"),
    ))
    .expect("start socks forwarding");
    let mut socks = TcpStream::connect(("127.0.0.1", socks_port)).expect("connect socks");
    socks.write_all(&[5, 1, 0]).expect("socks greeting");
    let mut greeting = [0_u8; 2];
    socks
        .read_exact(&mut greeting)
        .expect("socks greeting reply");
    assert_eq!(greeting, [5, 0]);
    let mut request = vec![5, 1, 0, 1, 127, 0, 0, 1];
    request.extend_from_slice(&echo_port.to_be_bytes());
    socks.write_all(&request).expect("socks connect");
    let mut reply = [0_u8; 10];
    socks.read_exact(&mut reply).expect("socks connect reply");
    assert_eq!(reply[1], 0);
    socks.write_all(b"socks").expect("socks payload");
    let mut socks_echo = [0_u8; 5];
    socks.read_exact(&mut socks_echo).expect("socks echo");
    assert_eq!(&socks_echo, b"socks");
    drop(socks);

    let remote_port = reserve_loopback_port();
    tauri::async_runtime::block_on(
        manager.start_network_rule(
            &session_id,
            "remote".into(),
            "profile-network",
            ForwardRuleKind::remote(
                "127.0.0.1",
                u32::from(remote_port),
                "127.0.0.1",
                u32::from(echo_port),
            )
            .expect("remote rule"),
        ),
    )
    .expect("start remote forwarding");
    assert_echo(remote_port, b"remote");

    for rule_id in ["local", "socks", "remote"] {
        tauri::async_runtime::block_on(manager.stop_network_rule(&session_id, rule_id.into()))
            .expect("stop forwarding");
    }
    tauri::async_runtime::block_on(manager.stop_network_rule(&session_id, "remote".into()))
        .expect("repeated stop is idempotent");
    manager.close(&session_id).expect("close network session");
    echo_thread.join().expect("echo thread");
}

struct SshdGuard(Child);

impl Drop for SshdGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn generate_ed25519_key(path: &std::path::Path) {
    assert!(
        Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", "", "-f"])
            .arg(path)
            .status()
            .expect("run ssh-keygen")
            .success()
    );
}

fn reserve_loopback_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .expect("reserve port")
        .local_addr()
        .expect("local address")
        .port()
}

fn assert_echo(port: u16, payload: &[u8]) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect forwarding");
    stream.write_all(payload).expect("write payload");
    let mut echoed = vec![0_u8; payload.len()];
    stream.read_exact(&mut echoed).expect("read echo");
    assert_eq!(echoed, payload);
}

fn wait_for_sshd(server: &mut Child, port: u16) {
    for _ in 0..40 {
        if let Some(status) = server.try_wait().expect("sshd status") {
            let mut message = String::new();
            if let Some(mut stderr) = server.stderr.take() {
                let _ = std::io::Read::read_to_string(&mut stderr, &mut message);
            }
            panic!("sshd exited with {status}: {message}");
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    panic!("sshd did not start");
}

fn run_test_transfer(
    manager: &Arc<SshSessionManager>,
    session_id: &str,
    request: TransferRequest,
) -> Vec<TransferEvent> {
    let (sender, receiver) = std::sync::mpsc::channel();
    manager
        .start_transfer(
            session_id,
            request,
            Arc::new(move |event| {
                let _ = sender.send(event);
            }),
        )
        .expect("start transfer");
    let mut events = Vec::new();
    loop {
        let event = receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("transfer event");
        let terminal = matches!(
            event,
            TransferEvent::Completed | TransferEvent::Cancelled | TransferEvent::Failed
        );
        events.push(event);
        if terminal {
            return events;
        }
    }
}
