use super::*;
use russh::{
    keys::{
        PrivateKey,
        ssh_key::private::{Ed25519Keypair, KeypairData},
    },
    server,
};
use tokio::net::{TcpListener, TcpStream};

struct ProxyServer {
    targets: Arc<Mutex<Vec<String>>>,
}
impl server::Handler for ProxyServer {
    type Error = russh::Error;
    async fn auth_password(&mut self, _: &str, _: &str) -> Result<server::Auth, Self::Error> {
        Ok(server::Auth::Accept)
    }
    async fn channel_open_direct_tcpip(
        &mut self,
        channel: Channel<server::Msg>,
        host: &str,
        _: u32,
        _: &str,
        _: u32,
        reply: server::ChannelOpenHandle,
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.targets.lock().unwrap().push(host.to_owned());
        reply.accept().await;
        tokio::spawn(async move {
            let mut stream = channel.into_stream();
            let mut request = [0; 1024];
            let size = stream.read(&mut request).await.unwrap_or(0);
            if request[..size].starts_with(b"GET") {
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: close\r\n\r\nSSH works").await;
                let _ = stream.shutdown().await;
            } else {
                // Keep an active stream so cancellation can be observed.
                let _ = stream.read(&mut request).await;
            }
        });
        Ok(())
    }
}

async fn socks(port: u16, host: &str) -> TcpStream {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream.write_all(&[5, 1, 0]).await.unwrap();
    let mut response = [0; 2];
    stream.read_exact(&mut response).await.unwrap();
    assert_eq!(response, [5, 0]);
    let mut request = vec![5, 1, 0, 3, host.len() as u8];
    request.extend_from_slice(host.as_bytes());
    request.extend_from_slice(&8080u16.to_be_bytes());
    stream.write_all(&request).await.unwrap();
    let mut response = [0; 10];
    stream.read_exact(&mut response).await.unwrap();
    assert_eq!(response[1], 0);
    stream
}

#[tokio::test]
async fn real_ssh_web_proxy_is_profile_bound_and_cancels_streams_and_listener() {
    tokio::time::timeout(Duration::from_secs(20), exercise())
        .await
        .expect("bounded integration test");
}

async fn exercise() {
    let directory = tempfile::tempdir().unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let targets = Arc::new(Mutex::new(Vec::new()));
    let handler = ProxyServer {
        targets: targets.clone(),
    };
    let config = Arc::new(server::Config {
        keys: vec![
            PrivateKey::new(
                KeypairData::from(Ed25519Keypair::from_seed(&[19; 32])),
                "fixture",
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
        JsonKnownHostRepository::new(directory.path().join("known.json")),
        JsonRemoteShellCache::new(directory.path().join("shell.json")),
    ));
    let (tx, mut rx) = mpsc::unbounded_channel();
    let id = manager.connect(
        crate::infrastructure::ssh::client::tests::connect_request(
            HostEndpoint::new("127.0.0.1", port.into()).unwrap(),
            "fixture".into(),
            AuthRequest::Password(crate::domain::auth::SecretText::new("fixture".into())),
            SessionPurpose::Network,
            Some("profile".into()),
            Arc::new(|_| {}),
        ),
        Arc::new(move |event| {
            let _ = tx.send(event);
        }),
    );
    loop {
        match rx.recv().await.unwrap() {
            SessionEvent::HostKeyConfirmationRequired { .. } => {
                manager.accept_host_key(&id).unwrap()
            }
            SessionEvent::StateChanged(SessionState::Connected) => break,
            SessionEvent::Failed { failure, .. } => panic!("{failure:?}"),
            _ => {}
        }
    }
    assert!(
        manager
            .start_web_proxy(&id, "other-profile", "wrong")
            .await
            .is_err()
    );
    let proxy = manager
        .start_web_proxy(&id, "profile", "web-test")
        .await
        .unwrap();
    assert_ne!(proxy, 0);
    assert_eq!(
        manager
            .start_web_proxy(&id, "profile", "web-test")
            .await
            .unwrap(),
        proxy,
        "tabs on the same SSH session reuse its browser listener"
    );
    let other_proxy = manager
        .start_web_proxy(&id, "profile", "web-second")
        .await
        .unwrap();
    assert_ne!(proxy, other_proxy);
    let fetch = |port, host: &'static str| async move {
        let mut stream = socks(port, host).await;
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: internal\r\n\r\n")
            .await
            .unwrap();
        let mut output = [0; 66];
        stream.read_exact(&mut output).await.unwrap();
        assert!(String::from_utf8_lossy(&output).ends_with("SSH works"));
    };
    tokio::join!(
        fetch(proxy, "internal.invalid"),
        fetch(other_proxy, "127.0.0.1")
    );
    assert!(targets.lock().unwrap().contains(&"internal.invalid".into()));
    let mut active = socks(proxy, "hold.invalid").await;
    active.write_all(b"hold").await.unwrap();
    let mut handshake = TcpStream::connect(("127.0.0.1", proxy)).await.unwrap();
    manager.close(&id).unwrap();
    loop {
        if matches!(
            rx.recv().await.unwrap(),
            SessionEvent::StateChanged(SessionState::Closed)
        ) {
            break;
        }
    }
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", proxy)).await.is_err() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(TcpStream::connect(("127.0.0.1", proxy)).await.is_err());
    let mut byte = [0];
    assert!(matches!(active.read(&mut byte).await, Ok(0) | Err(_)));
    assert!(matches!(handshake.read(&mut byte).await, Ok(0) | Err(_)));
    assert!(!manager.web_session_connected(&id));
    server.abort();
}
