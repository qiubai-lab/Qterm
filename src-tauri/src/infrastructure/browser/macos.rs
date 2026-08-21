use std::{sync::Mutex, time::Duration};

use block2::RcBlock;
use objc2_app_kit::{NSRunningApplication, NSWorkspace, NSWorkspaceOpenConfiguration};
use objc2_foundation::{NSArray, NSError, NSString};
use tokio::{sync::oneshot, time::timeout};

use super::{BrowserProxyError, ProxyBrowser};

pub(super) fn browser_installed(browser: ProxyBrowser) -> bool {
    application_url(browser).is_some()
}

const BROWSER_LAUNCH_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) async fn launch_browser(
    browser: ProxyBrowser,
    arguments: &[String],
) -> Result<(), BrowserProxyError> {
    let receiver = {
        let application_url =
            application_url(browser).ok_or(BrowserProxyError::BrowserNotInstalled)?;
        let configuration = NSWorkspaceOpenConfiguration::configuration();
        let arguments: Vec<_> = arguments
            .iter()
            .map(|argument| NSString::from_str(argument))
            .collect();
        let arguments = NSArray::from_retained_slice(&arguments);
        configuration.setArguments(&arguments);
        configuration.setCreatesNewApplicationInstance(true);
        configuration.setActivates(true);

        let (sender, receiver) = oneshot::channel();
        let sender = Mutex::new(Some(sender));
        let completion = RcBlock::new(
            move |application: *mut NSRunningApplication, error: *mut NSError| {
                let launched = !application.is_null() && error.is_null();
                if let Ok(mut sender) = sender.lock()
                    && let Some(sender) = sender.take()
                {
                    let _ = sender.send(launched);
                }
            },
        );
        NSWorkspace::sharedWorkspace().openApplicationAtURL_configuration_completionHandler(
            &application_url,
            &configuration,
            Some(&completion),
        );
        receiver
    };

    wait_for_launch(receiver, BROWSER_LAUNCH_TIMEOUT).await
}

async fn wait_for_launch(
    receiver: oneshot::Receiver<bool>,
    launch_timeout: Duration,
) -> Result<(), BrowserProxyError> {
    match timeout(launch_timeout, receiver).await {
        Ok(Ok(true)) => Ok(()),
        Ok(Ok(false) | Err(_)) | Err(_) => Err(BrowserProxyError::LaunchFailed),
    }
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
    use std::time::Duration;

    use tokio::sync::oneshot;

    use super::{BrowserProxyError, ProxyBrowser, bundle_identifier, wait_for_launch};

    #[test]
    fn browser_bundle_identifiers_are_fixed() {
        assert_eq!(bundle_identifier(ProxyBrowser::Chrome), "com.google.Chrome");
        assert_eq!(
            bundle_identifier(ProxyBrowser::Edge),
            "com.microsoft.edgemac"
        );
    }

    #[tokio::test]
    async fn launch_completion_reports_success_and_failure() {
        let (success_sender, success_receiver) = oneshot::channel();
        success_sender.send(true).expect("success receiver");
        assert_eq!(
            wait_for_launch(success_receiver, Duration::from_secs(1)).await,
            Ok(())
        );

        let (failure_sender, failure_receiver) = oneshot::channel();
        failure_sender.send(false).expect("failure receiver");
        assert_eq!(
            wait_for_launch(failure_receiver, Duration::from_secs(1)).await,
            Err(BrowserProxyError::LaunchFailed)
        );
    }

    #[tokio::test]
    async fn dropped_launch_completion_reports_failure() {
        let (sender, receiver) = oneshot::channel();
        drop(sender);

        assert_eq!(
            wait_for_launch(receiver, Duration::from_secs(1)).await,
            Err(BrowserProxyError::LaunchFailed)
        );
    }
}
