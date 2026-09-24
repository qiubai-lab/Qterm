//! Real SSH transport tests with an in-process server; no external account required.
use super::*;
use russh::keys::{
    PrivateKey,
    ssh_key::private::{Ed25519Keypair, KeypairData},
};
use russh::{Channel, ChannelId, server};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone, Copy)]
enum Reply {
    Ready,
    Reject,
    Close,
    Silent,
    Cancel,
}

struct Server {
    reply: Reply,
    shells: Arc<AtomicUsize>,
    commands: Arc<Mutex<Vec<String>>>,
    shell_seen: Arc<tokio::sync::Notify>,
}

impl server::Handler for Server {
    type Error = russh::Error;

    async fn auth_password(&mut self, _: &str, _: &str) -> Result<server::Auth, Self::Error> {
        Ok(server::Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        _: Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.shells.fetch_add(1, Ordering::SeqCst);
        self.shell_seen.notify_one();
        session.channel_success(channel)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        let command = String::from_utf8_lossy(data).to_string();
        self.commands.lock().unwrap().push(command.clone());
        match self.reply {
            Reply::Reject => {
                session.channel_failure(channel)?;
            }
            Reply::Close => {
                session.channel_success(channel)?;
                session.close(channel)?;
            }
            Reply::Silent | Reply::Cancel => {
                session.channel_success(channel)?;
                self.shell_seen.notify_one();
            }
            Reply::Ready => {
                session.channel_success(channel)?;
                let start = command
                    .find("\\033\\135\\040\\121")
                    .expect("controlled startup");
                let end = start + command[start..].find("\\007").unwrap() + 4;
                let marker: Vec<u8> = command[start..end]
                    .split('\\')
                    .skip(1)
                    .map(|octal| u8::from_str_radix(octal, 8).unwrap())
                    .collect();
                session.data(channel, b"banner".to_vec())?;
                session.data(channel, marker[..12].to_vec())?;
                session.data(channel, marker[12..].to_vec())?;
                session.data(channel, b"prompt".to_vec())?;
            }
        }
        Ok(())
    }
}

async fn exercise(reply: Reply, osc: bool, private: bool) {
    let directory = tempfile::tempdir().unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let shells = Arc::new(AtomicUsize::new(0));
    let commands = Arc::new(Mutex::new(Vec::new()));
    let shell_seen = Arc::new(tokio::sync::Notify::new());
    let handler = Server {
        reply,
        shells: shells.clone(),
        commands: commands.clone(),
        shell_seen: shell_seen.clone(),
    };
    let config = Arc::new(server::Config {
        keys: vec![
            PrivateKey::new(
                KeypairData::from(Ed25519Keypair::from_seed(&[9; 32])),
                "test",
            )
            .unwrap(),
        ],
        auth_rejection_time: Duration::ZERO,
        ..Default::default()
    });
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let _ = server::run_stream(config, socket, handler)
            .await
            .unwrap()
            .await;
    });
    let manager = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(directory.path().join("known-hosts.json")),
        JsonRemoteShellCache::new(directory.path().join("shells.json")),
    ));
    let output = Arc::new(Mutex::new(Vec::new()));
    let captured = output.clone();
    let mut request = tests::connect_request(
        HostEndpoint::new("127.0.0.1", port.into()).unwrap(),
        "test".into(),
        AuthRequest::Password(crate::domain::auth::SecretText::new("test".into())),
        SessionPurpose::Terminal,
        None,
        Arc::new(move |data| captured.lock().unwrap().extend(data)),
    );
    request.history_free_bash_enabled = private;
    request.remote_shell_integration_enabled = osc;
    let (tx, mut rx) = mpsc::unbounded_channel();
    let id = manager.connect(
        request,
        Arc::new(move |event| {
            let _ = tx.send(event);
        }),
    );
    let expected_success = !private || matches!(reply, Reply::Ready);
    let cancellation = if matches!(reply, Reply::Cancel) {
        let manager = manager.clone();
        let id = id.clone();
        let seen = shell_seen.clone();
        Some(tokio::spawn(async move {
            seen.notified().await;
            assert!(manager.write(&id, b"must not run\r".to_vec()).is_err());
            manager.close(&id).unwrap();
        }))
    } else {
        None
    };
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            match rx.recv().await.expect("session event") {
                SessionEvent::HostKeyConfirmationRequired { .. } => {
                    manager.accept_host_key(&id).unwrap()
                }
                SessionEvent::StateChanged(SessionState::Connected) => {
                    assert!(
                        expected_success,
                        "must not fall back after failed bootstrap"
                    );
                    break;
                }
                SessionEvent::Failed { failure, .. } => {
                    assert!(
                        !matches!(reply, Reply::Cancel),
                        "user cancellation is not a startup failure"
                    );
                    assert!(!expected_success, "unexpected failure: {failure:?}");
                    assert_eq!(failure, SessionFailure::HistoryFreeStartupFailed);
                    break;
                }
                SessionEvent::StateChanged(SessionState::Closed)
                    if matches!(reply, Reply::Cancel) =>
                {
                    break;
                }
                _ => {}
            }
        }
    })
    .await
    .expect("bounded session startup");
    if let Some(task) = cancellation {
        task.await.unwrap();
    }
    if private {
        assert_eq!(shells.load(Ordering::SeqCst), 0);
        let commands = commands.lock().unwrap();
        assert_eq!(commands.len(), 1, "no default shell probe or fallback");
        assert_eq!(commands[0].contains("file://"), osc);
        assert!(!String::from_utf8_lossy(&output.lock().unwrap()).contains("QTERM-READY"));
    } else {
        tokio::time::timeout(Duration::from_secs(2), shell_seen.notified())
            .await
            .unwrap();
        assert_eq!(shells.load(Ordering::SeqCst), 1);
        assert!(commands.lock().unwrap().is_empty());
    }
    let _ = manager.close(&id);
    server.abort();
}

#[tokio::test]
async fn history_free_ssh_confirms_both_osc_modes_without_default_shell() {
    exercise(Reply::Ready, false, true).await;
    exercise(Reply::Ready, true, true).await;
    exercise(Reply::Ready, false, false).await;
}

#[tokio::test]
async fn history_free_ssh_rejects_failure_close_and_timeout_without_fallback() {
    exercise(Reply::Reject, false, true).await;
    exercise(Reply::Close, true, true).await;
    exercise(Reply::Silent, false, true).await;
    exercise(Reply::Cancel, false, true).await;
}
