//! Stable per-environment SOCKS endpoint. Cancellation drops listener and active streams.
use std::{collections::BTreeMap, sync::Arc};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::RwLock,
    task::JoinHandle,
};
#[derive(Clone)]
pub(super) struct Route {
    pub session: String,
    pub port: u16,
}
pub(super) struct Gateway {
    pub port: u16,
    routes: Arc<RwLock<BTreeMap<String, Route>>>,
    task: Option<JoinHandle<()>>,
}
impl Gateway {
    pub async fn new(connected: Arc<dyn Fn(&str) -> bool + Send + Sync>) -> Result<Self, String> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let routes = Arc::new(RwLock::new(BTreeMap::<String, Route>::new()));
        let captured = routes.clone();
        let task = tokio::spawn(async move {
            let mut transfers = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    incoming = listener.accept() => {
                        let Ok((mut downstream, _)) = incoming else { break; };
                        let candidates: Vec<_> = captured.read().await.values().filter(|r| connected(&r.session)).cloned().collect();
                        let connected = connected.clone();
                        transfers.spawn(async move {
                            for route in candidates {
                                if !connected(&route.session) { continue; }
                                if let Ok(Ok(mut upstream)) = tokio::time::timeout(std::time::Duration::from_secs(2), TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, route.port))).await {
                                    let _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await;
                                    break;
                                }
                            }
                        });
                    }
                    _ = transfers.join_next(), if !transfers.is_empty() => {}
                }
            }
        });
        Ok(Self {
            port,
            routes,
            task: Some(task),
        })
    }
    pub async fn add(&self, owner: String, route: Route) {
        self.routes.write().await.insert(owner, route);
    }
    pub async fn remove_session(&self, session: &str) {
        self.routes
            .write()
            .await
            .retain(|_, r| r.session != session);
    }
    pub async fn shutdown(&mut self) {
        self.routes.write().await.clear();
        if let Some(task) = self.task.take() {
            task.abort();
            let _ = task.await;
        }
    }
}
impl Drop for Gateway {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn shutdown_is_idempotent_and_closes_listener_and_active_streams() {
        use tokio::io::AsyncReadExt;
        let origin = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut gateway = Gateway::new(Arc::new(|_| true)).await.unwrap();
        gateway
            .add(
                "page".into(),
                Route {
                    session: "s".into(),
                    port: origin.local_addr().unwrap().port(),
                },
            )
            .await;
        let mut client = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, gateway.port))
            .await
            .unwrap();
        let (_upstream, _) =
            tokio::time::timeout(std::time::Duration::from_secs(2), origin.accept())
                .await
                .unwrap()
                .unwrap();
        gateway.shutdown().await;
        gateway.shutdown().await;
        assert!(
            TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, gateway.port))
                .await
                .is_err()
        );
        assert_eq!(
            tokio::time::timeout(std::time::Duration::from_secs(2), client.read(&mut [0; 1]))
                .await
                .unwrap()
                .unwrap(),
            0
        );
    }
}
