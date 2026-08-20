use std::{
    collections::HashMap,
    future::Future,
    io,
    net::{Ipv4Addr, Ipv6Addr},
    sync::{Arc, Mutex},
};

use russh::{Channel, client::Msg};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{Semaphore, mpsc, oneshot},
    time::{Duration, timeout},
};

use crate::domain::network::ForwardRuleKind;

pub const MAX_ACTIVE_FORWARD_CONNECTIONS: usize = 256;

const FORWARD_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

pub type RemoteForwardMap = Arc<Mutex<HashMap<(String, u32), (String, String, u16)>>>;
pub type ForwardTaskRegistry =
    Arc<Mutex<HashMap<String, Vec<tauri::async_runtime::JoinHandle<()>>>>>;
pub type ForwardPermits = Arc<Semaphore>;

pub struct DirectConnection {
    pub rule_id: String,
    pub stream: TcpStream,
    pub target_host: String,
    pub target_port: u16,
    pub originator_host: String,
    pub originator_port: u16,
    pub socks5: bool,
}

pub struct RunningListener {
    cancel: Option<oneshot::Sender<()>>,
}

impl RunningListener {
    pub fn stop(mut self) {
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(());
        }
    }
}

impl Drop for RunningListener {
    fn drop(&mut self) {
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(());
        }
    }
}

pub async fn start_listener(
    rule_id: &str,
    kind: &ForwardRuleKind,
    connections: mpsc::Sender<DirectConnection>,
) -> io::Result<RunningListener> {
    let (bind_host, bind_port, fixed_target, socks5) = match kind {
        ForwardRuleKind::Local {
            bind_host,
            bind_port,
            target_host,
            target_port,
        } => (
            bind_host.clone(),
            *bind_port,
            Some((target_host.clone(), *target_port)),
            false,
        ),
        ForwardRuleKind::Socks5 {
            bind_host,
            bind_port,
        } => (bind_host.clone(), *bind_port, None, true),
        ForwardRuleKind::Remote { .. } => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "remote rule has no local listener",
            ));
        }
    };
    let listener = TcpListener::bind((bind_host.as_str(), bind_port)).await?;
    let rule_id = rule_id.to_owned();
    let (cancel_sender, mut cancel_receiver) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut cancel_receiver => break,
                accepted = listener.accept() => {
                    let Ok((stream, originator)) = accepted else { break };
                    let sender = connections.clone();
                    let target = fixed_target.clone();
                    let rule_id = rule_id.clone();
                    tauri::async_runtime::spawn(async move {
                        let connection = if socks5 {
                            prepare_socks5_connection(rule_id, stream, originator.ip().to_string(), originator.port()).await
                        } else {
                            target.map(|(target_host, target_port)| DirectConnection {
                                rule_id,
                                stream,
                                target_host,
                                target_port,
                                originator_host: originator.ip().to_string(),
                                originator_port: originator.port(),
                                socks5: false,
                            })
                        };
                        if let Some(connection) = connection {
                            let _ = sender.send(connection).await;
                        }
                    });
                }
            }
        }
    });
    Ok(RunningListener {
        cancel: Some(cancel_sender),
    })
}

async fn prepare_socks5_connection(
    rule_id: String,
    mut stream: TcpStream,
    originator_host: String,
    originator_port: u16,
) -> Option<DirectConnection> {
    let mut greeting = [0_u8; 2];
    if stream.read_exact(&mut greeting).await.is_err() || greeting[0] != 5 || greeting[1] == 0 {
        return None;
    }
    let mut methods = vec![0_u8; greeting[1] as usize];
    if stream.read_exact(&mut methods).await.is_err() {
        return None;
    }
    if !methods.contains(&0) {
        let _ = stream.write_all(&[5, 0xff]).await;
        return None;
    }
    if stream.write_all(&[5, 0]).await.is_err() {
        return None;
    }
    match read_socks5_target(&mut stream).await {
        Ok((target_host, target_port)) => Some(DirectConnection {
            rule_id,
            stream,
            target_host,
            target_port,
            originator_host,
            originator_port,
            socks5: true,
        }),
        Err(reply) => {
            let _ = send_socks5_reply(&mut stream, reply).await;
            None
        }
    }
}

async fn read_socks5_target(stream: &mut TcpStream) -> Result<(String, u16), u8> {
    let mut header = [0_u8; 4];
    stream.read_exact(&mut header).await.map_err(|_| 1)?;
    if header[0] != 5 || header[2] != 0 {
        return Err(1);
    }
    if header[1] != 1 {
        return Err(7);
    }
    let host = match header[3] {
        1 => {
            let mut bytes = [0_u8; 4];
            stream.read_exact(&mut bytes).await.map_err(|_| 1)?;
            Ipv4Addr::from(bytes).to_string()
        }
        3 => {
            let length = stream.read_u8().await.map_err(|_| 1)? as usize;
            if length == 0 {
                return Err(8);
            }
            let mut bytes = vec![0_u8; length];
            stream.read_exact(&mut bytes).await.map_err(|_| 1)?;
            String::from_utf8(bytes).map_err(|_| 8)?
        }
        4 => {
            let mut bytes = [0_u8; 16];
            stream.read_exact(&mut bytes).await.map_err(|_| 1)?;
            Ipv6Addr::from(bytes).to_string()
        }
        _ => return Err(8),
    };
    let port = stream.read_u16().await.map_err(|_| 1)?;
    if port == 0 {
        return Err(1);
    }
    Ok((host, port))
}

pub async fn acknowledge_socks5(stream: &mut TcpStream, success: bool) -> io::Result<()> {
    send_socks5_reply(stream, if success { 0 } else { 5 }).await
}

async fn send_socks5_reply(stream: &mut TcpStream, reply: u8) -> io::Result<()> {
    stream.write_all(&[5, reply, 0, 1, 0, 0, 0, 0, 0, 0]).await
}

pub async fn pump_tcp_channel(mut stream: TcpStream, channel: Channel<Msg>) -> io::Result<()> {
    let mut channel = channel.into_stream();
    tokio::io::copy_bidirectional(&mut stream, &mut channel).await?;
    let _ = channel.shutdown().await;
    let _ = stream.shutdown().await;
    Ok(())
}

pub async fn pump_forwarded_channel(channel: Channel<Msg>, target_host: String, target_port: u16) {
    if let Ok(Ok(stream)) = timeout(
        FORWARD_CONNECT_TIMEOUT,
        TcpStream::connect((target_host.as_str(), target_port)),
    )
    .await
    {
        let _ = pump_tcp_channel(stream, channel).await;
    } else {
        let channel = channel;
        let _ = channel.eof().await;
        let _ = channel.close().await;
    }
}

pub fn remote_target(
    rules: &RemoteForwardMap,
    connected_address: &str,
    connected_port: u32,
) -> Option<(String, String, u16)> {
    rules
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&(connected_address.to_owned(), connected_port))
        .cloned()
}

pub fn spawn_forward_task<F>(registry: &ForwardTaskRegistry, rule_id: String, future: F)
where
    F: Future<Output = ()> + Send + 'static,
{
    let task = tauri::async_runtime::spawn(future);
    let mut tasks = registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let handles = tasks.entry(rule_id).or_default();
    handles.retain(|handle| !handle.inner().is_finished());
    handles.push(task);
}

pub fn abort_forward_tasks(registry: &ForwardTaskRegistry, rule_id: &str) {
    let handles = registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(rule_id)
        .unwrap_or_default();
    for handle in handles {
        handle.abort();
    }
}

pub fn new_forward_permits() -> ForwardPermits {
    Arc::new(Semaphore::new(MAX_ACTIVE_FORWARD_CONNECTIONS))
}

#[cfg(test)]
mod tests {
    use super::{RemoteForwardMap, acknowledge_socks5, remote_target, start_listener};
    use crate::domain::network::ForwardRuleKind;
    use std::{
        collections::HashMap,
        net::{Ipv6Addr, TcpListener as StdTcpListener},
        sync::{Arc, Mutex},
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
        sync::mpsc,
        time::{Duration, timeout},
    };

    #[test]
    fn matches_remote_forward_by_server_reported_endpoint() {
        let rules: RemoteForwardMap = Arc::new(Mutex::new(HashMap::from([(
            ("127.0.0.1".into(), 9000),
            ("rule-1".into(), "localhost".into(), 3000),
        )])));
        assert_eq!(
            remote_target(&rules, "127.0.0.1", 9000),
            Some(("rule-1".into(), "localhost".into(), 3000))
        );
        assert_eq!(remote_target(&rules, "127.0.0.1", 9001), None);
    }

    #[tokio::test]
    async fn socks5_accepts_ipv4_ipv6_and_domain_connect_targets() {
        exercise_socks_target(vec![5, 1, 0, 1, 127, 0, 0, 1, 0x01, 0xbb], "127.0.0.1", 443).await;
        let mut ipv6_request = vec![5, 1, 0, 4];
        ipv6_request.extend_from_slice(&Ipv6Addr::LOCALHOST.octets());
        ipv6_request.extend_from_slice(&8080_u16.to_be_bytes());
        exercise_socks_target(ipv6_request, "::1", 8080).await;
        let domain = b"example.test";
        let mut domain_request = vec![5, 1, 0, 3, domain.len() as u8];
        domain_request.extend_from_slice(domain);
        domain_request.extend_from_slice(&53_u16.to_be_bytes());
        exercise_socks_target(domain_request, "example.test", 53).await;
    }

    #[tokio::test]
    async fn socks5_rejects_unsupported_auth_and_commands() {
        let (port, listener, mut connections) = socks_listener().await;
        let mut client = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        client.write_all(&[5, 1, 2]).await.unwrap();
        let mut auth_reply = [0; 2];
        client.read_exact(&mut auth_reply).await.unwrap();
        assert_eq!(auth_reply, [5, 0xff]);
        assert!(
            timeout(Duration::from_millis(50), connections.recv())
                .await
                .is_err()
        );
        listener.stop();

        let (port, listener, mut connections) = socks_listener().await;
        let mut client = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        client.write_all(&[5, 1, 0]).await.unwrap();
        let mut auth_reply = [0; 2];
        client.read_exact(&mut auth_reply).await.unwrap();
        assert_eq!(auth_reply, [5, 0]);
        client
            .write_all(&[5, 2, 0, 1, 127, 0, 0, 1, 0, 80])
            .await
            .unwrap();
        let mut command_reply = [0; 10];
        client.read_exact(&mut command_reply).await.unwrap();
        assert_eq!(command_reply[1], 7);
        assert!(
            timeout(Duration::from_millis(50), connections.recv())
                .await
                .is_err()
        );
        listener.stop();
    }

    #[tokio::test]
    async fn local_listener_routes_fixed_targets_and_releases_its_port() {
        let port = unused_loopback_port();
        let kind = ForwardRuleKind::local("127.0.0.1", u32::from(port), "service.internal", 5432)
            .expect("local rule");
        let (sender, mut receiver) = mpsc::channel(2);
        let listener = start_listener("rule-local", &kind, sender)
            .await
            .expect("listener");
        let client = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connect listener");
        let connection = timeout(Duration::from_secs(1), receiver.recv())
            .await
            .expect("accepted in time")
            .expect("accepted connection");
        assert_eq!(connection.rule_id, "rule-local");
        assert_eq!(connection.target_host, "service.internal");
        assert_eq!(connection.target_port, 5432);
        drop(connection);
        drop(client);
        listener.stop();

        timeout(Duration::from_secs(1), async {
            loop {
                if let Ok(rebound) = tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
                    drop(rebound);
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("listener port released");
    }

    async fn exercise_socks_target(request: Vec<u8>, expected_host: &str, expected_port: u16) {
        let (port, listener, mut connections) = socks_listener().await;
        let mut client = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        client.write_all(&[5, 1, 0]).await.unwrap();
        let mut auth_reply = [0; 2];
        client.read_exact(&mut auth_reply).await.unwrap();
        assert_eq!(auth_reply, [5, 0]);
        client.write_all(&request).await.unwrap();
        let mut connection = timeout(Duration::from_secs(1), connections.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(connection.rule_id, "rule-1");
        assert_eq!(connection.target_host, expected_host);
        assert_eq!(connection.target_port, expected_port);
        acknowledge_socks5(&mut connection.stream, true)
            .await
            .unwrap();
        let mut connect_reply = [0; 10];
        client.read_exact(&mut connect_reply).await.unwrap();
        assert_eq!(connect_reply[1], 0);
        listener.stop();
    }

    async fn socks_listener() -> (
        u16,
        super::RunningListener,
        mpsc::Receiver<super::DirectConnection>,
    ) {
        let port = unused_loopback_port();
        let kind = ForwardRuleKind::socks5("127.0.0.1", u32::from(port)).unwrap();
        let (sender, receiver) = mpsc::channel(4);
        let listener = start_listener("rule-1", &kind, sender).await.unwrap();
        (port, listener, receiver)
    }

    fn unused_loopback_port() -> u16 {
        StdTcpListener::bind(("127.0.0.1", 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }
}
