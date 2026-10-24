/// Guest pages may never enter the application's local/custom protocol origins.
pub fn allowed_web_url(value: &str) -> bool {
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return false;
    }
    // Parsing is kept in the native adapter; this rule operates on canonical URLs.
    let Some((scheme, rest)) = value.split_once("://") else {
        return false;
    };
    if !matches!(scheme, "http" | "https") {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let host = authority
        .split(':')
        .next()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    !authority.is_empty() && !authority.contains('@') && !host.ends_with(".localhost")
}

pub fn trusted_ui_label(label: &str) -> bool {
    label == "main"
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_privileged_and_credential_urls() {
        for url in [
            "file:///secret",
            "tauri://localhost",
            "javascript:alert(1)",
            "https://tauri.localhost/",
            "http://asset.localhost/",
            "https://user:secret@host/",
            "https://host/\n",
        ] {
            assert!(!allowed_web_url(url), "{url}");
        }
        for url in [
            "http://127.0.0.1:3000/",
            "https://dashboard.internal/",
            "http://[::1]:8080/",
        ] {
            assert!(allowed_web_url(url));
        }
        assert!(trusted_ui_label("main"));
        assert!(!trusted_ui_label("web-guest"));
    }
}
