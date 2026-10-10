mod database;
mod routes;

use database::Database;
use std::{net::SocketAddr, path::PathBuf};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let hash = std::env::var("QTERM_SYNC_TOKEN_SHA256").map_err(
        |_| "Set QTERM_SYNC_TOKEN_SHA256 to a 64-character SHA-256 digest of a random token",
    )?;
    let digest = routes::parse_digest(&hash).ok_or("Invalid token digest")?;
    let directory =
        PathBuf::from(std::env::var("QTERM_SYNC_DATA_DIR").unwrap_or_else(|_| "/data".into()));
    std::fs::create_dir_all(&directory)?;
    let database = Database::open(&directory.join("sync.db"))?;
    let address: SocketAddr = std::env::var("QTERM_SYNC_LISTEN")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Qterm sync listening on {address}");
    axum::serve(listener, routes::router(database, digest))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
