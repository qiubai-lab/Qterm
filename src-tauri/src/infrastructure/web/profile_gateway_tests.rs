use super::profile_gateway::{ProfileGateway, Route};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

async fn upstream(byte: u8) -> (u16, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                return;
            };
            let _ = stream.write_all(&[byte]).await;
        }
    });
    (port, task)
}
async fn read(port: u16) -> Vec<u8> {
    let mut socket = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    let mut data = vec![];
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        socket.read_to_end(&mut data),
    )
    .await
    .unwrap()
    .unwrap();
    data
}

#[tokio::test]
async fn stable_gateway_survives_owner_removal_and_rejects_disconnected_routes() {
    let connected = Arc::new(AtomicBool::new(true));
    let status = connected.clone();
    let gateway = ProfileGateway::new(Arc::new(move |_| status.load(Ordering::SeqCst)))
        .await
        .unwrap();
    let (a, task_a) = upstream(b'A').await;
    let (b, task_b) = upstream(b'B').await;
    gateway
        .add(
            "a".into(),
            Route {
                session: "ssh-a".into(),
                port: a,
            },
        )
        .await;
    gateway
        .add(
            "b".into(),
            Route {
                session: "ssh-b".into(),
                port: b,
            },
        )
        .await;
    assert_eq!(read(gateway.port).await, b"A");
    gateway.remove("a").await;
    assert_eq!(read(gateway.port).await, b"B");
    connected.store(false, Ordering::SeqCst);
    assert!(read(gateway.port).await.is_empty());
    connected.store(true, Ordering::SeqCst);
    gateway.remove("b").await;
    assert!(read(gateway.port).await.is_empty());
    task_a.abort();
    task_b.abort();
}

#[tokio::test]
async fn removing_one_tab_keeps_a_shared_upstream_stream_alive() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let echo = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (mut read, mut write) = socket.split();
        tokio::io::copy(&mut read, &mut write).await.unwrap();
    });
    let gateway = ProfileGateway::new(Arc::new(|_| true)).await.unwrap();
    for tab in ["a", "b"] {
        gateway
            .add(
                tab.into(),
                Route {
                    session: "shared".into(),
                    port,
                },
            )
            .await;
    }
    let mut stream = TcpStream::connect(("127.0.0.1", gateway.port))
        .await
        .unwrap();
    for byte in [1, 2] {
        stream.write_all(&[byte]).await.unwrap();
        let mut reply = [0];
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            stream.read_exact(&mut reply),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(reply, [byte]);
        gateway.remove("a").await;
    }
    drop(stream);
    tokio::time::timeout(std::time::Duration::from_secs(2), echo)
        .await
        .unwrap()
        .unwrap();
}
