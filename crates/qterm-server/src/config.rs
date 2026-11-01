use std::{net::SocketAddr, path::PathBuf};

pub struct Config {
    pub listen: SocketAddr,
    pub origin: String,
    pub data: PathBuf,
    pub assets: PathBuf,
    pub password_hash: String,
    pub secure_cookie: bool,
}
impl Config {
    pub fn from_env() -> Result<Self, String> {
        let origin =
            std::env::var("QTERM_PUBLIC_ORIGIN").map_err(|_| "QTERM_PUBLIC_ORIGIN is required")?;
        let url = url::Url::parse(&origin).map_err(|_| "Invalid QTERM_PUBLIC_ORIGIN")?;
        let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if (!matches!(url.scheme(), "https") && !(url.scheme() == "http" && loopback))
            || url.origin().ascii_serialization() != origin
        {
            return Err("Public origin must be an HTTPS origin (HTTP allowed only for loopback development)".into());
        }
        let path = |name| {
            std::env::var_os(name)
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
        };
        let password_hash = crate::login_password::load(
            path("QTERM_PASSWORD_FILE"),
            path("QTERM_PASSWORD_HASH_FILE"),
        )?;
        Ok(Self {
            listen: std::env::var("QTERM_LISTEN")
                .unwrap_or_else(|_| "0.0.0.0:8080".into())
                .parse()
                .map_err(|_| "Invalid QTERM_LISTEN")?,
            secure_cookie: url.scheme() == "https",
            origin,
            data: std::env::var_os("QTERM_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    dirs::data_local_dir()
                        .unwrap_or_else(|| ".".into())
                        .join("QtermServer")
                }),
            assets: std::env::var_os("QTERM_ASSETS_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| "dist-web".into()),
            password_hash,
        })
    }
}
