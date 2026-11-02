use std::{net::SocketAddr, path::PathBuf};

pub struct Config {
    pub listen: SocketAddr,
    pub origin: String,
    pub data: PathBuf,
    pub assets: PathBuf,
    pub password_hash: String,
    pub secure_cookie: bool,
    pub trusted_proxies: Vec<std::net::IpAddr>,
}
impl Config {
    pub fn from_env() -> Result<Self, String> {
        let origin =
            std::env::var("QTERM_PUBLIC_ORIGIN").map_err(|_| "QTERM_PUBLIC_ORIGIN is required")?;
        let allow_http = std::env::var("QTERM_ALLOW_INSECURE_HTTP")
            .unwrap_or_else(|_| "false".into())
            .parse::<bool>()
            .map_err(|_| "QTERM_ALLOW_INSECURE_HTTP must be true or false")?;
        let url = public_origin(&origin, allow_http)?;
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
            trusted_proxies: std::env::var("QTERM_TRUSTED_PROXIES")
                .unwrap_or_default()
                .split(',')
                .filter(|value| !value.trim().is_empty())
                .map(|value| {
                    value
                        .trim()
                        .parse()
                        .map_err(|_| "Invalid QTERM_TRUSTED_PROXIES IP address".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?,
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

fn public_origin(origin: &str, allow_http: bool) -> Result<url::Url, String> {
    let url = url::Url::parse(origin).map_err(|_| "Invalid QTERM_PUBLIC_ORIGIN")?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || url.scheme() == "http" && (loopback || allow_http))
        || url.origin().ascii_serialization() != origin
    {
        return Err("Public origin must be an HTTPS origin; remote HTTP requires QTERM_ALLOW_INSECURE_HTTP=true".into());
    }
    Ok(url)
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
