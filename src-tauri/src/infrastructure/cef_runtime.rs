//! Application CEF policy; normal builds use the OS credential store, never the probe's mock key.
use std::path::Path;
use tauri_runtime_cef::{Cef, ProxyConfig, SandboxPolicy, SecretStorage, WebRtcIpHandling};

pub(crate) fn runtime(root: &Path) -> Cef {
    Cef::default()
        .root_cache_path(root)
        .sandbox(SandboxPolicy::Required)
        .secret_storage(storage())
        .proxy(ProxyConfig::FixedServers {
            server: format!("socks5://127.0.0.1:{}", rejecting_port()),
            bypass_list: Some("<-loopback>".into()),
        })
        .webrtc_ip_handling(WebRtcIpHandling::DisableNonProxiedUdp)
}
fn storage() -> SecretStorage {
    #[cfg(feature = "cef-integration-test")]
    return SecretStorage::Mock;
    #[cfg(not(feature = "cef-integration-test"))]
    SecretStorage::System
}
pub(crate) fn rejecting_port() -> u16 {
    static PORT: std::sync::OnceLock<u16> = std::sync::OnceLock::new();
    *PORT.get_or_init(|| {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("reserve rejecting proxy");
        let port = listener
            .local_addr()
            .expect("rejecting proxy address")
            .port();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                drop(stream);
            }
        });
        port
    })
}
