//! Rewrite only SOCKS CONNECT destinations. All TCP still belongs to the SSH profile gateway.
use std::{io, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

pub(crate) async fn copy(downstream: &mut TcpStream, upstream: &mut TcpStream) -> io::Result<()> {
    tokio::time::timeout(Duration::from_secs(5), handshake(downstream, upstream)).await??;
    tokio::io::copy_bidirectional(downstream, upstream).await?;
    Ok(())
}

async fn handshake(downstream: &mut TcpStream, upstream: &mut TcpStream) -> io::Result<()> {
    let mut greeting = [0; 2];
    downstream.read_exact(&mut greeting).await?;
    if greeting[0] != 5 || greeting[1] == 0 {
        return Err(invalid());
    }
    let mut methods = vec![0; usize::from(greeting[1])];
    downstream.read_exact(&mut methods).await?;
    upstream.write_all(&greeting).await?;
    upstream.write_all(&methods).await?;
    let mut selected = [0; 2];
    upstream.read_exact(&mut selected).await?;
    downstream.write_all(&selected).await?;
    if selected != [5, 0] {
        return Err(invalid());
    }
    let mut request = [0; 4];
    downstream.read_exact(&mut request).await?;
    if request[..3] != [5, 1, 0] {
        return Err(invalid());
    }
    let mut target = match request[3] {
        1 => vec![0; 4],
        4 => vec![0; 16],
        3 => vec![0; usize::from(downstream.read_u8().await?)],
        _ => return Err(invalid()),
    };
    downstream.read_exact(&mut target).await?;
    let mut port = [0; 2];
    downstream.read_exact(&mut port).await?;
    if request[3] == 3 {
        let host = std::str::from_utf8(&target).map_err(|_| invalid())?;
        if let Some(alias) = crate::domain::web_tunnel::decode(host).map_err(|_| invalid())? {
            target = alias.into_bytes();
        }
    }
    upstream.write_all(&request).await?;
    if request[3] == 3 {
        upstream
            .write_u8(u8::try_from(target.len()).map_err(|_| invalid())?)
            .await?;
    }
    upstream.write_all(&target).await?;
    upstream.write_all(&port).await
}
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid browser tunnel request")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn maps_destination_preserving_port_payload_and_ssh_reply() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client_port = listener.local_addr().unwrap().port();
        let server_port = upstream.local_addr().unwrap().port();
        let bridge = tokio::spawn(async move {
            let (mut client, _) = listener.accept().await.unwrap();
            let mut server = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, server_port))
                .await
                .unwrap();
            copy(&mut client, &mut server).await.unwrap();
        });
        let server = tokio::spawn(async move {
            let (mut socket, _) = upstream.accept().await.unwrap();
            let mut greeting = [0; 3];
            socket.read_exact(&mut greeting).await.unwrap();
            assert_eq!(greeting, [5, 1, 0]);
            socket.write_all(&[5, 0]).await.unwrap();
            let mut header = [0; 5];
            socket.read_exact(&mut header).await.unwrap();
            assert_eq!(header, [5, 1, 0, 3, 9]);
            let mut rest = [0; 12];
            socket.read_exact(&mut rest).await.unwrap();
            assert_eq!(&rest[..9], b"127.0.0.1");
            assert_eq!(&rest[9..], &[0x1f, 0x90, 42]);
            socket.write_all(b"reply").await.unwrap();
        });
        let mut client = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, client_port))
            .await
            .unwrap();
        client.write_all(&[5, 1, 0]).await.unwrap();
        let mut reply = [0; 2];
        client.read_exact(&mut reply).await.unwrap();
        let name = b"ip-7f000001.qterm-tunnel.invalid";
        client
            .write_all(&[5, 1, 0, 3, name.len() as u8])
            .await
            .unwrap();
        client.write_all(name).await.unwrap();
        client.write_all(&[0x1f, 0x90, 42]).await.unwrap();
        client.shutdown().await.unwrap();
        let mut output = Vec::new();
        client.read_to_end(&mut output).await.unwrap();
        assert_eq!(output, b"reply");
        server.await.unwrap();
        bridge.await.unwrap();
    }
}
