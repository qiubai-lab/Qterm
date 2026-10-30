pub const WEB_PAGE_LIMIT: usize = 99;

/// Shared resource bound for ordinary pages and adopted popups across browser blocks.
pub fn ensure_web_page_capacity(open_pages: usize) -> Result<(), String> {
    if open_pages >= WEB_PAGE_LIMIT {
        Err(format!(
            "最多同时打开 {WEB_PAGE_LIMIT} 个网页，请先关闭部分网页"
        ))
    } else {
        Ok(())
    }
}

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

pub fn allow_popup(url: &str, user_initiated: bool, app_origin: bool) -> Result<(), &'static str> {
    if !user_initiated {
        return Err("已拦截网页自动弹窗");
    }
    if app_origin || (url != "about:blank" && !allowed_web_url(url)) {
        return Err("已拦截不支持的新窗口地址");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_the_99th_page_and_rejects_the_100th() {
        assert!(ensure_web_page_capacity(98).is_ok());
        assert_eq!(
            ensure_web_page_capacity(99).unwrap_err(),
            "最多同时打开 99 个网页，请先关闭部分网页"
        );
    }

    #[test]
    fn popup_policy_preserves_guest_boundaries_and_requires_a_gesture() {
        assert!(allow_popup("https://example.test/", true, false).is_ok());
        assert!(allow_popup("about:blank", true, false).is_ok());
        assert!(allow_popup("https://example.test/", false, false).is_err());
        assert!(allow_popup("http://localhost:1420/", true, true).is_err());
        for url in [
            "javascript:alert(1)",
            "file:///secret",
            "tauri://localhost",
            "https://user:pass@host/",
        ] {
            assert!(allow_popup(url, true, false).is_err());
        }
    }
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
