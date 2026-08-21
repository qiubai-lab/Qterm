use objc2_app_kit::{NSWorkspace, NSWorkspaceOpenConfiguration};
use objc2_foundation::{NSArray, NSString};

use super::{BrowserProxyError, ProxyBrowser};

pub(super) fn browser_installed(browser: ProxyBrowser) -> bool {
    application_url(browser).is_some()
}

pub(super) fn launch_browser(
    browser: ProxyBrowser,
    arguments: &[String],
) -> Result<(), BrowserProxyError> {
    let application_url = application_url(browser).ok_or(BrowserProxyError::BrowserNotInstalled)?;
    let configuration = NSWorkspaceOpenConfiguration::configuration();
    let arguments: Vec<_> = arguments
        .iter()
        .map(|argument| NSString::from_str(argument))
        .collect();
    let arguments = NSArray::from_retained_slice(&arguments);
    configuration.setArguments(&arguments);
    configuration.setCreatesNewApplicationInstance(true);
    configuration.setActivates(true);
    NSWorkspace::sharedWorkspace().openApplicationAtURL_configuration_completionHandler(
        &application_url,
        &configuration,
        None,
    );
    Ok(())
}

fn application_url(browser: ProxyBrowser) -> Option<objc2::rc::Retained<objc2_foundation::NSURL>> {
    let bundle_identifier = NSString::from_str(bundle_identifier(browser));
    NSWorkspace::sharedWorkspace().URLForApplicationWithBundleIdentifier(&bundle_identifier)
}

fn bundle_identifier(browser: ProxyBrowser) -> &'static str {
    match browser {
        ProxyBrowser::Chrome => "com.google.Chrome",
        ProxyBrowser::Edge => "com.microsoft.edgemac",
    }
}

#[cfg(test)]
mod tests {
    use super::{ProxyBrowser, bundle_identifier};

    #[test]
    fn browser_bundle_identifiers_are_fixed() {
        assert_eq!(bundle_identifier(ProxyBrowser::Chrome), "com.google.Chrome");
        assert_eq!(
            bundle_identifier(ProxyBrowser::Edge),
            "com.microsoft.edgemac"
        );
    }
}
