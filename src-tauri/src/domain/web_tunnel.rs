//! Reserved WebKit tunnel origins. Only loopback aliases can be decoded; no arbitrary routing table.
pub const SUFFIX: &str = ".qterm-tunnel.invalid";

pub fn decode(host: &str) -> Result<Option<String>, &'static str> {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let Some(name) = host.strip_suffix(SUFFIX) else {
        return Ok(None);
    };
    let target = match name {
        "localhost" => "localhost".to_owned(),
        "ipv6-loopback" => "::1".to_owned(),
        "unspecified" => "127.0.0.1".to_owned(),
        _ => {
            let hex = name.strip_prefix("ip-").ok_or("Invalid tunnel origin")?;
            if hex.len() != 8 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err("Invalid tunnel origin");
            }
            let value = u32::from_str_radix(hex, 16).map_err(|_| "Invalid tunnel origin")?;
            let address = std::net::Ipv4Addr::from(value);
            if !address.is_loopback() {
                return Err("Tunnel origin must address loopback");
            }
            address.to_string()
        }
    };
    Ok(Some(target))
}

#[cfg(test)]
mod tests {
    #[test]
    fn aliases_are_bounded_to_loopback_and_do_not_capture_normal_domains() {
        use super::decode;
        assert_eq!(
            decode("localhost.qterm-tunnel.invalid").unwrap().as_deref(),
            Some("localhost")
        );
        assert_eq!(
            decode("IP-7F000002.QTERM-TUNNEL.INVALID.")
                .unwrap()
                .as_deref(),
            Some("127.0.0.2")
        );
        assert_eq!(
            decode("ipv6-loopback.qterm-tunnel.invalid")
                .unwrap()
                .as_deref(),
            Some("::1")
        );
        assert_eq!(
            decode("unspecified.qterm-tunnel.invalid")
                .unwrap()
                .as_deref(),
            Some("127.0.0.1")
        );
        assert_eq!(decode("internal.example").unwrap(), None);
        for name in [
            "ip-0a000001",
            "evil.localhost",
            "ip-7f",
            "ip-7g000001",
            "file",
        ] {
            assert!(decode(&format!("{name}{}", super::SUFFIX)).is_err());
        }
    }
}
