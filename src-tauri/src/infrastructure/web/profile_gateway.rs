//! One stable browser proxy endpoint per connection environment; routes are SSH-owned.
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

pub(super) struct ProfileGateway {
    pub port: u16,
    routes: Arc<RwLock<BTreeMap<String, Route>>>,
    task: JoinHandle<()>,
}

impl ProfileGateway {
    #[cfg(any(not(target_os = "macos"), test))]
    pub async fn new(connected: Arc<dyn Fn(&str) -> bool + Send + Sync>) -> Result<Self, String> {
        Self::create(connected, false).await
    }
    #[cfg(target_os = "macos")]
    pub async fn new_mapped(
        connected: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    ) -> Result<Self, String> {
        Self::create(connected, true).await
    }
    async fn create(
        connected: Arc<dyn Fn(&str) -> bool + Send + Sync>,
        map_aliases: bool,
    ) -> Result<Self, String> {
        #[cfg(not(target_os = "macos"))]
        let _ = map_aliases;
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| "无法创建浏览代理入口")?;
        let port = listener
            .local_addr()
            .map_err(|_| "无法读取浏览代理入口")?
            .port();
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
                                    #[cfg(target_os = "macos")]
                                    if map_aliases {
                                        let _ = super::macos::tunnel::copy(&mut downstream, &mut upstream).await;
                                        break;
                                    }
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
        Ok(Self { port, routes, task })
    }
    pub async fn add(&self, owner: String, route: Route) {
        self.routes.write().await.insert(owner, route);
    }
    pub async fn remove(&self, owner: &str) {
        self.routes.write().await.remove(owner);
    }
}
impl Drop for ProfileGateway {
    fn drop(&mut self) {
        self.task.abort();
    }
}
