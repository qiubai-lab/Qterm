use super::*;
use russh::{
    ChannelId, Pty,
    keys::ssh_key::{
        PrivateKey, PublicKey,
        private::{Ed25519Keypair, KeypairData},
    },
    server,
};
use std::sync::Mutex;

struct TestClient;
impl client::Handler for TestClient {
    type Error = russh::Error;
    async fn check_server_key(&mut self, _: &PublicKey) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

struct TestServer {
    reject_exec: bool,
    events: Arc<Mutex<Vec<String>>>,
}
impl server::Handler for TestServer {
    type Error = russh::Error;
    async fn auth_none(&mut self, _: &str) -> Result<server::Auth, Self::Error> {
        Ok(server::Auth::Accept)
    }
    async fn channel_open_session(
        &mut self,
        channel: Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.events
            .lock()
            .unwrap()
            .push(format!("open:{}", channel.id()));
        reply.accept().await;
        Ok(())
    }
    async fn pty_request(
        &mut self,
        id: ChannelId,
        _: &str,
        _: u32,
        _: u32,
        _: u32,
        _: u32,
        modes: &[(Pty, u32)],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        assert!(!modes.contains(&(Pty::ECHO, 0)));
        session.channel_success(id)?;
        Ok(())
    }
    async fn exec_request(
        &mut self,
        id: ChannelId,
        data: &[u8],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.events
            .lock()
            .unwrap()
            .push(format!("exec:{}", String::from_utf8_lossy(data)));
        // Startup diagnostics preceding the ack must remain visible.
        session.data(id, b"startup-output".to_vec())?;
        if self.reject_exec {
            session.channel_failure(id)?;
        } else {
            session.channel_success(id)?;
        }
        Ok(())
    }
    async fn shell_request(
        &mut self,
        id: ChannelId,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.events.lock().unwrap().push(format!("shell:{id}"));
        session.channel_success(id)?;
        Ok(())
    }
    async fn data(
        &mut self,
        _: ChannelId,
        data: &[u8],
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.events
            .lock()
            .unwrap()
            .push(format!("stdin:{}", String::from_utf8_lossy(data)));
        Ok(())
    }
}

async fn exercise(shell: Option<RemoteShell>, reject_exec: bool) -> (Vec<String>, Vec<u8>) {
    let key = PrivateKey::new(
        KeypairData::Ed25519(Ed25519Keypair::from_seed(&[13; 32])),
        "test-only",
    )
    .unwrap();
    let config = Arc::new(server::Config {
        keys: vec![key],
        ..Default::default()
    });
    let events = Arc::new(Mutex::new(Vec::new()));
    let server = TestServer {
        reject_exec,
        events: events.clone(),
    };
    let (server_stream, client_stream) = tokio::io::duplex(128 * 1024);
    let server_task = tokio::spawn(async move {
        let session = server::run_stream(config, server_stream, server)
            .await
            .unwrap();
        let _ = session.await;
    });
    let mut handle = client::connect_stream(
        Arc::new(client::Config::default()),
        client_stream,
        TestClient,
    )
    .await
    .unwrap();
    assert!(handle.authenticate_none("test").await.unwrap().success());
    let output = Arc::new(Mutex::new(Vec::new()));
    let captured = output.clone();
    let sink: Arc<dyn Fn(Vec<u8>) + Send + Sync> =
        Arc::new(move |bytes| captured.lock().unwrap().extend(bytes));
    let channel = open(
        &handle,
        TerminalSize::new(100, 30).unwrap(),
        shell,
        None,
        &sink,
    )
    .await
    .unwrap();
    channel.close().await.unwrap();
    handle
        .disconnect(russh::Disconnect::ByApplication, "done", "en")
        .await
        .unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(2), server_task).await;
    let events = events.lock().unwrap().clone();
    let output = output.lock().unwrap().clone();
    (events, output)
}

#[tokio::test]
async fn startup_uses_exec_and_never_sends_hidden_stdin() {
    let (events, output) = exercise(Some(RemoteShell::Bash), false).await;
    assert_eq!(
        events
            .iter()
            .filter(|event| event.starts_with("open:"))
            .count(),
        1
    );
    assert!(events.iter().any(|event| event.starts_with("exec:")));
    assert!(
        !events
            .iter()
            .any(|event| event.starts_with("stdin:") || event.starts_with("shell:"))
    );
    assert_eq!(output, b"startup-output");
}

#[tokio::test]
async fn rejected_exec_falls_back_to_shell_on_a_fresh_channel() {
    let (events, output) = exercise(Some(RemoteShell::Bash), true).await;
    assert_eq!(
        events
            .iter()
            .filter(|event| event.starts_with("open:"))
            .count(),
        2
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| event.starts_with("shell:"))
            .count(),
        1
    );
    assert!(!events.iter().any(|event| event.starts_with("stdin:")));
    assert_eq!(output, b"startup-output");
}

#[tokio::test]
async fn passive_startup_only_requests_an_ordinary_shell() {
    let (events, _) = exercise(None, false).await;
    assert_eq!(
        events
            .iter()
            .filter(|event| event.starts_with("shell:"))
            .count(),
        1
    );
    assert!(
        !events
            .iter()
            .any(|event| event.starts_with("exec:") || event.starts_with("stdin:"))
    );
}
