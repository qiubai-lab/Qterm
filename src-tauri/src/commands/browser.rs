use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{error::IpcError, network::NetworkState},
    domain::network::ForwardRuleKind,
    infrastructure::browser::{
        BrowserProxyError, BrowserProxyLauncher, ProxyBrowser, ProxyBrowserAvailability,
    },
};

pub struct BrowserProxyState {
    launcher: BrowserProxyLauncher,
}

impl BrowserProxyState {
    pub fn new(profile_root: std::path::PathBuf) -> Self {
        Self {
            launcher: BrowserProxyLauncher::new(profile_root),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProxyBrowserDto {
    Chrome,
    Edge,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct BrowserProxyLaunchDto {
    rule_id: String,
    browser: ProxyBrowserDto,
    proxy_local_addresses: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyBrowserAvailabilityDto {
    id: ProxyBrowserDto,
    name: &'static str,
    installed: bool,
    supported: bool,
}

#[tauri::command]
pub fn browser_proxy_list(state: State<'_, BrowserProxyState>) -> Vec<ProxyBrowserAvailabilityDto> {
    state
        .launcher
        .list()
        .into_iter()
        .map(ProxyBrowserAvailabilityDto::from)
        .collect()
}

#[tauri::command]
pub async fn browser_proxy_launch(
    input: BrowserProxyLaunchDto,
    browser_state: State<'_, BrowserProxyState>,
    network_state: State<'_, NetworkState>,
) -> Result<(), IpcError> {
    let rule = network_state.rule(&input.rule_id)?;
    let (host, port) = match rule.kind() {
        ForwardRuleKind::Socks5 {
            bind_host,
            bind_port,
        } => (client_listener_host(bind_host), *bind_port),
        _ => {
            return Err(IpcError::new(
                "invalidBrowserProxyRule",
                "只能从 SOCKS5 网络实例启动代理浏览器",
                false,
            ));
        }
    };
    browser_state
        .launcher
        .launch(
            input.browser.into(),
            rule.id().as_str(),
            host,
            port,
            input.proxy_local_addresses,
        )
        .await
        .map_err(IpcError::from)
}

fn client_listener_host(host: &str) -> &str {
    match host {
        "0.0.0.0" => "127.0.0.1",
        "::" => "::1",
        value => value.trim_matches(['[', ']']),
    }
}

impl From<ProxyBrowserDto> for ProxyBrowser {
    fn from(value: ProxyBrowserDto) -> Self {
        match value {
            ProxyBrowserDto::Chrome => Self::Chrome,
            ProxyBrowserDto::Edge => Self::Edge,
        }
    }
}

impl From<ProxyBrowser> for ProxyBrowserDto {
    fn from(value: ProxyBrowser) -> Self {
        match value {
            ProxyBrowser::Chrome => Self::Chrome,
            ProxyBrowser::Edge => Self::Edge,
        }
    }
}

impl From<ProxyBrowserAvailability> for ProxyBrowserAvailabilityDto {
    fn from(value: ProxyBrowserAvailability) -> Self {
        Self {
            id: value.browser.into(),
            name: value.browser.display_name(),
            installed: value.installed,
            supported: value.supported,
        }
    }
}

impl From<BrowserProxyError> for IpcError {
    fn from(value: BrowserProxyError) -> Self {
        match value {
            BrowserProxyError::UnsupportedPlatform => Self::new(
                "browserProxyPlatformUnsupported",
                "代理浏览器目前仅支持 Windows",
                false,
            ),
            BrowserProxyError::BrowserNotInstalled => {
                Self::new("proxyBrowserNotInstalled", "未检测到所选浏览器", false)
            }
            BrowserProxyError::ProxyUnavailable => Self::new(
                "socksProxyUnavailable",
                "SOCKS5 实例尚未运行或无法连接",
                true,
            ),
            BrowserProxyError::ProfileUnavailable => Self::new(
                "browserProfileUnavailable",
                "无法创建独立浏览器配置目录",
                true,
            ),
            BrowserProxyError::LaunchFailed => {
                Self::new("proxyBrowserLaunchFailed", "无法启动所选浏览器", true)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{BrowserProxyLaunchDto, client_listener_host};

    #[test]
    fn launch_input_rejects_executables_and_arbitrary_arguments() {
        let value = json!({
            "ruleId": "rule-1",
            "browser": "chrome",
            "proxyLocalAddresses": true,
            "executable": "powershell.exe",
            "arguments": ["-Command", "whoami"]
        });
        assert!(serde_json::from_value::<BrowserProxyLaunchDto>(value).is_err());
    }

    #[test]
    fn launch_input_rejects_unknown_browsers() {
        let value = json!({
            "ruleId": "rule-1",
            "browser": "firefox",
            "proxyLocalAddresses": true
        });
        assert!(serde_json::from_value::<BrowserProxyLaunchDto>(value).is_err());
    }

    #[test]
    fn launch_input_accepts_only_the_local_address_proxy_choice() {
        let value = json!({
            "ruleId": "rule-1",
            "browser": "edge",
            "proxyLocalAddresses": false
        });
        let input = serde_json::from_value::<BrowserProxyLaunchDto>(value)
            .expect("valid browser proxy choice");

        assert!(!input.proxy_local_addresses);
    }

    #[test]
    fn wildcard_listeners_are_probed_through_loopback() {
        assert_eq!(client_listener_host("0.0.0.0"), "127.0.0.1");
        assert_eq!(client_listener_host("::"), "::1");
        assert_eq!(client_listener_host("[2001:db8::1]"), "2001:db8::1");
    }
}
