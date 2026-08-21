use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::timeout,
};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

const SOCKS_PROBE_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProxyBrowser {
    Chrome,
    Edge,
}

impl ProxyBrowser {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Chrome => "Google Chrome",
            Self::Edge => "Microsoft Edge",
        }
    }

    fn profile_folder(self) -> &'static str {
        match self {
            Self::Chrome => "chrome",
            Self::Edge => "edge",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProxyBrowserAvailability {
    pub browser: ProxyBrowser,
    pub installed: bool,
    pub supported: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserProxyError {
    UnsupportedPlatform,
    BrowserNotInstalled,
    ProxyUnavailable,
    ProfileUnavailable,
    LaunchFailed,
}

pub struct BrowserProxyLauncher {
    profile_root: PathBuf,
}

impl BrowserProxyLauncher {
    pub fn new(profile_root: PathBuf) -> Self {
        Self { profile_root }
    }

    pub fn list(&self) -> Vec<ProxyBrowserAvailability> {
        [ProxyBrowser::Chrome, ProxyBrowser::Edge]
            .into_iter()
            .map(|browser| ProxyBrowserAvailability {
                browser,
                installed: platform_browser_installed(browser),
                supported: platform_supported(),
            })
            .collect()
    }

    pub async fn launch(
        &self,
        browser: ProxyBrowser,
        rule_id: &str,
        host: &str,
        port: u16,
        proxy_local_addresses: bool,
    ) -> Result<(), BrowserProxyError> {
        if !platform_supported() {
            return Err(BrowserProxyError::UnsupportedPlatform);
        }
        if !platform_browser_installed(browser) {
            return Err(BrowserProxyError::BrowserNotInstalled);
        }
        probe_socks5(host, port).await?;
        let local_address_mode = if proxy_local_addresses {
            "proxy-local"
        } else {
            "direct-local"
        };
        let profile_key = format!("{rule_id}-{host}-{port}-{local_address_mode}");
        let profile = self
            .profile_root
            .join(browser.profile_folder())
            .join(safe_rule_folder(&profile_key));
        std::fs::create_dir_all(&profile).map_err(|_| BrowserProxyError::ProfileUnavailable)?;
        let arguments = browser_arguments(host, port, &profile, proxy_local_addresses);
        #[cfg(target_os = "macos")]
        {
            platform_launch_browser(browser, &arguments).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            platform_launch_browser(browser, &arguments)
        }
    }
}

async fn probe_socks5(host: &str, port: u16) -> Result<(), BrowserProxyError> {
    let stream = timeout(SOCKS_PROBE_TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?;
    let (mut reader, mut writer) = stream.into_split();
    timeout(SOCKS_PROBE_TIMEOUT, writer.write_all(&[5, 1, 0]))
        .await
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?;
    let mut response = [0_u8; 2];
    timeout(SOCKS_PROBE_TIMEOUT, reader.read_exact(&mut response))
        .await
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?
        .map_err(|_| BrowserProxyError::ProxyUnavailable)?;
    if response == [5, 0] {
        Ok(())
    } else {
        Err(BrowserProxyError::ProxyUnavailable)
    }
}

fn browser_arguments(
    host: &str,
    port: u16,
    profile: &Path,
    proxy_local_addresses: bool,
) -> Vec<String> {
    let proxy_host = bracket_ipv6(host);
    let mut arguments = vec![
        format!("--proxy-server=socks5://{proxy_host}:{port}"),
        format!("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE {proxy_host}"),
        format!("--user-data-dir={}", profile.to_string_lossy()),
        "--no-first-run".to_owned(),
        "--no-default-browser-check".to_owned(),
        "--new-window".to_owned(),
        "about:blank".to_owned(),
    ];
    if proxy_local_addresses {
        arguments.insert(3, "--proxy-bypass-list=<-loopback>".to_owned());
    }
    arguments
}

fn safe_rule_folder(rule_id: &str) -> String {
    let value: String = rule_id
        .chars()
        .take(80)
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    if value.is_empty() {
        "rule".to_owned()
    } else {
        value
    }
}

fn bracket_ipv6(host: &str) -> String {
    let host = host.trim_matches(['[', ']']);
    if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_owned()
    }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn platform_supported() -> bool {
    true
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_supported() -> bool {
    false
}

#[cfg(target_os = "linux")]
use linux::{
    browser_installed as platform_browser_installed, launch_browser as platform_launch_browser,
};
#[cfg(target_os = "macos")]
use macos::{
    browser_installed as platform_browser_installed, launch_browser as platform_launch_browser,
};
#[cfg(target_os = "windows")]
use windows::{
    browser_installed as platform_browser_installed, launch_browser as platform_launch_browser,
};

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_browser_installed(_browser: ProxyBrowser) -> bool {
    false
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_launch_browser(
    _browser: ProxyBrowser,
    _arguments: &[String],
) -> Result<(), BrowserProxyError> {
    Err(BrowserProxyError::UnsupportedPlatform)
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        path::Path,
        thread,
    };

    use super::{bracket_ipv6, browser_arguments, probe_socks5, safe_rule_folder};

    #[test]
    fn arguments_fix_the_proxy_profile_and_dns_rules_without_a_shell_command() {
        let arguments = browser_arguments("::1", 1080, Path::new(r"C:\Qterm Data\chrome"), true);

        assert_eq!(arguments[0], "--proxy-server=socks5://[::1]:1080");
        assert_eq!(
            arguments[1],
            "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE [::1]"
        );
        assert_eq!(arguments[2], r"--user-data-dir=C:\Qterm Data\chrome");
        assert!(arguments.contains(&"--proxy-bypass-list=<-loopback>".to_owned()));
        assert!(arguments.contains(&"--new-window".to_owned()));
        assert_eq!(arguments.last().map(String::as_str), Some("about:blank"));
    }

    #[test]
    fn arguments_keep_chromium_local_address_bypasses_when_disabled() {
        let arguments =
            browser_arguments("127.0.0.1", 1080, Path::new(r"C:\Qterm Data\chrome"), false);

        assert!(
            !arguments
                .iter()
                .any(|argument| argument.starts_with("--proxy-bypass-list="))
        );
    }

    #[test]
    fn rule_folders_cannot_escape_the_managed_profile_root() {
        assert_eq!(safe_rule_folder("../rule:id"), "___rule_id");
        assert_eq!(safe_rule_folder(""), "rule");
    }

    #[test]
    fn only_ipv6_hosts_receive_brackets() {
        assert_eq!(bracket_ipv6("127.0.0.1"), "127.0.0.1");
        assert_eq!(bracket_ipv6("[2001:db8::1]"), "[2001:db8::1]");
    }

    #[test]
    fn probe_requires_a_successful_no_auth_socks5_greeting() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind probe fixture");
        let port = listener.local_addr().expect("fixture address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept probe");
            let mut greeting = [0_u8; 3];
            stream.read_exact(&mut greeting).expect("read greeting");
            assert_eq!(greeting, [5, 1, 0]);
            stream.write_all(&[5, 0]).expect("write response");
        });

        tauri::async_runtime::block_on(probe_socks5("127.0.0.1", port))
            .expect("valid SOCKS fixture");
        server.join().expect("probe fixture");
    }
}
