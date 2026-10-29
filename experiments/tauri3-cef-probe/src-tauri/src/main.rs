mod browser;
mod control;
mod proxy;
mod report;

use tauri_runtime_cef::{Cef, ProxyConfig, SandboxPolicy, SecretStorage, WebRtcIpHandling};

#[tauri_runtime_cef::cef_entry_point]
fn main() {
    let root = std::env::var_os("QTERM_CEF_PROBE_DATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("qterm-cef-probe-manual"));
    std::fs::create_dir_all(&root).expect("create isolated probe data");
    let runtime = Cef::default()
        .root_cache_path(&root)
        .sandbox(SandboxPolicy::Required)
        // Disposable synthetic test cookies only; never production credentials.
        .secret_storage(SecretStorage::Mock)
        .proxy(initial_proxy())
        .webrtc_ip_handling(WebRtcIpHandling::DisableNonProxiedUdp);
    tauri::Builder::default()
        .runtime(runtime)
        .setup(move |app| {
            report::emit(serde_json::json!({"event":"ready"}));
            control::start(app.handle().clone(), root.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("run CEF probe");
}

fn initial_proxy() -> ProxyConfig {
    // alpha.6 reapplies global preferences when another context uses the same
    // cache path. Never allow that transient state to become a direct connection.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind rejecting proxy");
    let address = listener.local_addr().expect("rejecting proxy address");
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            drop(stream);
        }
    });
    ProxyConfig::FixedServers {
        server: format!("socks5://{address}"),
        bypass_list: Some("<-loopback>".into()),
    }
}
