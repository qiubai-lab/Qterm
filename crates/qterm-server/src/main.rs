mod access;
mod access_lifecycle;
mod access_log;
mod access_socket;
mod access_transport;
mod auth;
mod catalog;
mod config;
mod connection;
mod credential_management;
mod data_access;
mod error;
mod files;
mod git;
mod git_events_socket;
mod git_local_watch;
mod git_observation;
mod git_observation_worker;
mod git_remote;
mod local_files;
mod local_socket;
mod login_password;
mod network;
#[cfg(test)]
mod recovery_tests;
mod retained_session;
mod retained_socket;
mod router;
#[cfg(test)]
mod runtime_tests;
mod screen_worker;
mod settings;
mod socket;
mod socket_io;
mod state;
mod terminal_clipboard;
mod terminal_lock;
#[cfg(test)]
mod tests;
mod transfer_archive;
mod transfer_lifecycle;
mod transfer_storage;
mod transfers;
mod vault;
mod vault_events;
mod workspace_recovery;
mod workspace_runtime;

#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("hash-password") {
        if let Err(error) = hash_password() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    if let Err(error) = serve().await {
        eprintln!("Qterm Server: {error}");
        std::process::exit(1);
    }
}
async fn serve() -> Result<(), String> {
    let config = config::Config::from_env()?;
    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .map_err(|_| "Cannot bind listening address")?;
    let state = state::ServerState::new(config)?;
    let cleanup = state.clone();
    let maintenance = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            cleanup
                .downloads
                .lock()
                .unwrap()
                .retain(|_, d| d.expires > std::time::Instant::now());
        }
    });
    eprintln!(
        "Qterm Server listening on {}",
        listener.local_addr().map_err(|_| "Listener unavailable")?
    );
    let shutdown_state = state.clone();
    let result = axum::serve(
        listener,
        router::router(state.clone()).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        #[cfg(unix)]
        {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("signal handler");
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=terminate.recv()=>{}}
        }
        #[cfg(not(unix))]
        {
            let _ = tokio::signal::ctrl_c().await;
        }
        shutdown_state.auth.revoke();
        shutdown_state.close_all();
    })
    .await;
    maintenance.abort();
    state.auth.revoke();
    state.close_all();
    result.map_err(|_| "HTTP server failed".into())
}
fn hash_password() -> Result<(), String> {
    use std::io::Read;
    let mut password = zeroize::Zeroizing::new(String::new());
    std::io::stdin()
        .take(1027)
        .read_to_string(&mut password)
        .map_err(|_| "Cannot read password from stdin")?;
    let hash = login_password::hash(password.trim_end_matches(['\r', '\n']))?;
    println!("{hash}");
    Ok(())
}
