use crate::ports::sync::*;
use qterm_sync_core::{MAX_BYTES, Push, Snapshot};
use reqwest::{Client, Url};
use std::time::Duration;

pub struct HttpSync;

fn endpoint(settings: &SyncSettings) -> SyncResult<Url> {
    let mut url = Url::parse(settings.server_url.trim()).map_err(|_| "服务器地址格式无效")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err("服务器地址不能包含账号、查询参数或片段".into());
    }
    if url.scheme() != "https" && !(url.scheme() == "http" && settings.allow_insecure_http) {
        return Err("请使用 HTTPS，或显式允许本地网络 HTTP".into());
    }
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(&path);
    Ok(url)
}

fn client() -> SyncResult<Client> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| "无法初始化同步网络客户端".into())
}

async fn decode(mut response: reqwest::Response) -> SyncResult<Snapshot> {
    match response.status().as_u16() {
        200 => {}
        401 | 403 => return Err("同步 Token 无效或无访问权限".into()),
        409 => return Err("服务器数据已被其他设备修改，请重新同步".into()),
        _ => return Err("同步服务返回错误，请检查地址、协议版本与服务状态".into()),
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("同步数据过大".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取同步响应失败")? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("同步数据过大".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "同步响应格式无效或协议不兼容".into())
}

impl SyncRemote for HttpSync {
    fn validate_settings(&self, settings: &mut SyncSettings) -> SyncResult<()> {
        settings.server_url = endpoint(settings)?
            .as_str()
            .trim_end_matches('/')
            .to_owned();
        Ok(())
    }
    async fn fetch(&self, settings: &SyncSettings, token: &str) -> SyncResult<Snapshot> {
        let base = endpoint(settings)?;
        let response = client()?
            .get(format!(
                "{}/v1/catalog",
                base.as_str().trim_end_matches('/')
            ))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "无法连接同步服务，请检查网络、地址与 TLS 证书")?;
        decode(response).await
    }
    async fn push(
        &self,
        settings: &SyncSettings,
        token: &str,
        request: Push,
    ) -> SyncResult<Snapshot> {
        let base = endpoint(settings)?;
        let bytes = serde_json::to_vec(&request).map_err(|_| "无法编码同步请求")?;
        if bytes.len() > MAX_BYTES {
            return Err("同步数据过大".into());
        }
        let response = client()?
            .put(format!(
                "{}/v1/catalog",
                base.as_str().trim_end_matches('/')
            ))
            .bearer_auth(token)
            .header("content-type", "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|_| "同步提交未确认，稍后重试将重新核对服务器内容")?;
        decode(response).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn enforces_transport_and_rejects_embedded_secrets() {
        for url in [
            "http://localhost:8080",
            "https://user:token@host",
            "https://host?token=x",
            "file:///tmp/a",
        ] {
            assert!(
                endpoint(&SyncSettings {
                    server_url: url.into(),
                    ..Default::default()
                })
                .is_err()
            );
        }
        assert!(
            endpoint(&SyncSettings {
                server_url: "http://localhost:8080".into(),
                allow_insecure_http: true,
                ..Default::default()
            })
            .is_ok()
        );
    }
}
