//! A private loopback transport for the bundled desktop UI. Remote HTML is never loaded.
mod proxy;
mod socket;
#[cfg(test)]
mod tests;

use reqwest::{Client, Url, cookie::Jar};
use serde::Serialize;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub struct RemoteRuntime {
    pub endpoint: Url,
    pub client: Client,
    pub cookies: Arc<Jar>,
    pub cancel: CancellationToken,
    pub token: String,
    pub ui_origin: String,
    pub address: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub api_base: String,
}

pub fn endpoint(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "请输入完整的 HTTP 或 HTTPS 地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("服务器地址只允许 HTTP/HTTPS 协议、主机和端口，不含账号、路径或参数".into());
    }
    Ok(url)
}

impl RemoteRuntime {
    pub async fn start(value: &str, ui_origin: String) -> Result<Arc<Self>, String> {
        let endpoint = endpoint(value)?;
        let cookies = Arc::new(Jar::default());
        let client = Client::builder()
            .user_agent(concat!("Qterm Desktop/", env!("CARGO_PKG_VERSION")))
            .cookie_provider(cookies.clone())
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(660))
            .build()
            .map_err(|_| "无法初始化远程连接")?;
        let check = client
            .get(endpoint.join("healthz").unwrap())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|_| "无法连接服务器，请检查地址、网络与证书")?;
        if !check.status().is_success() {
            return Err("服务器不可用或地址需要重定向，请使用最终服务地址".into());
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| "无法建立本机传输通道")?;
        let address = format!(
            "http://{}",
            listener.local_addr().map_err(|_| "无法读取本机传输地址")?
        );
        let runtime = Arc::new(Self {
            endpoint,
            client,
            cookies,
            cancel: CancellationToken::new(),
            token: uuid::Uuid::new_v4().simple().to_string(),
            ui_origin,
            address,
        });
        let app = axum::Router::new()
            .fallback(proxy::forward)
            .with_state(runtime.clone());
        let cancel = runtime.cancel.clone();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(cancel.cancelled_owned())
                .await;
        });
        Ok(runtime)
    }
    pub fn info(&self) -> ConnectionInfo {
        ConnectionInfo {
            api_base: format!("{}/{}/api/v1", self.address, self.token),
        }
    }
    pub fn target(&self, path: &str) -> Result<Url, String> {
        if !path.starts_with("/api/v1/") || path.contains(['\\', '#']) {
            return Err("无效的 Runtime 接口路径".into());
        }
        let url = self
            .endpoint
            .join(path)
            .map_err(|_| "无效的 Runtime 接口路径")?;
        if url.origin() != self.endpoint.origin() || !url.path().starts_with("/api/v1/") {
            return Err("无效的 Runtime 接口路径".into());
        }
        Ok(url)
    }
}
