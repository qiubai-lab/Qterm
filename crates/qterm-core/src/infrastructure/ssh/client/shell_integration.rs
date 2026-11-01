use std::{future::Future, time::Duration};

use crate::{
    domain::shell_integration::{
        MAX_SHELL_PROBE_OUTPUT_BYTES, POSIX_SHELL_PROBE_COMMAND, POWERSHELL_PROBE_COMMAND,
        RemoteShell, RemoteShellTarget, parse_shell_probe_output,
    },
    infrastructure::persistence::json_remote_shell_cache::JsonRemoteShellCache,
    ports::remote_shell_cache::RemoteShellCacheRepository,
};

use super::*;

const SHELL_PROBE_TIMEOUT: Duration = Duration::from_secs(1);
const SHELL_DETECTION_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShellProbeOutcome {
    Detected(RemoteShell),
    Unsupported,
    TransientFailure,
}

pub(super) async fn resolve_remote_shell(
    handle: &client::Handle<ClientHandler>,
    cache: &JsonRemoteShellCache,
    target: &RemoteShellTarget,
) -> Option<RemoteShell> {
    if let Ok(Some(shell)) = cache.load(target) {
        return Some(shell);
    }
    let shell = detect_remote_shell(handle).await?;
    let _ = cache.save(target, shell);
    Some(shell)
}

async fn detect_remote_shell(handle: &client::Handle<ClientHandler>) -> Option<RemoteShell> {
    tokio::time::timeout(
        SHELL_DETECTION_TIMEOUT,
        retry_transient_probe(|| detect_remote_shell_once(handle)),
    )
    .await
    .ok()
    .flatten()
}

async fn retry_transient_probe<F, Fut>(mut probe: F) -> Option<RemoteShell>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = ShellProbeOutcome>,
{
    match probe().await {
        ShellProbeOutcome::Detected(shell) => Some(shell),
        ShellProbeOutcome::Unsupported => None,
        ShellProbeOutcome::TransientFailure => match probe().await {
            ShellProbeOutcome::Detected(shell) => Some(shell),
            ShellProbeOutcome::Unsupported | ShellProbeOutcome::TransientFailure => None,
        },
    }
}

async fn detect_remote_shell_once(handle: &client::Handle<ClientHandler>) -> ShellProbeOutcome {
    let mut transient_failure = false;
    for command in [POSIX_SHELL_PROBE_COMMAND, POWERSHELL_PROBE_COMMAND] {
        match run_probe(handle, command).await {
            ShellProbeOutcome::Detected(shell) => return ShellProbeOutcome::Detected(shell),
            ShellProbeOutcome::Unsupported => {}
            ShellProbeOutcome::TransientFailure => transient_failure = true,
        }
    }
    if transient_failure {
        ShellProbeOutcome::TransientFailure
    } else {
        ShellProbeOutcome::Unsupported
    }
}

async fn run_probe(
    handle: &client::Handle<ClientHandler>,
    command: &'static str,
) -> ShellProbeOutcome {
    let mut channel = match handle.channel_open_session().await {
        Ok(channel) => channel,
        Err(_) => return ShellProbeOutcome::TransientFailure,
    };
    if channel.exec(true, command).await.is_err() {
        return ShellProbeOutcome::TransientFailure;
    }
    match tokio::time::timeout(SHELL_PROBE_TIMEOUT, async move {
        let mut output = Vec::new();
        let mut received = 0usize;
        let mut exit_status = None;
        while let Some(message) = channel.wait().await {
            match message {
                ChannelMsg::Data { data } => {
                    received = received.saturating_add(data.len());
                    if received > MAX_SHELL_PROBE_OUTPUT_BYTES {
                        return ShellProbeOutcome::Unsupported;
                    }
                    output.extend_from_slice(&data);
                }
                ChannelMsg::ExtendedData { data, .. } => {
                    received = received.saturating_add(data.len());
                    if received > MAX_SHELL_PROBE_OUTPUT_BYTES {
                        return ShellProbeOutcome::Unsupported;
                    }
                }
                ChannelMsg::ExitStatus {
                    exit_status: status,
                } => {
                    exit_status = Some(status);
                }
                _ => {}
            }
        }
        match exit_status {
            Some(0) => parse_shell_probe_output(&output)
                .map(ShellProbeOutcome::Detected)
                .unwrap_or(ShellProbeOutcome::Unsupported),
            Some(_) => ShellProbeOutcome::Unsupported,
            None => ShellProbeOutcome::TransientFailure,
        }
    })
    .await
    {
        Ok(outcome) => outcome,
        Err(_) => ShellProbeOutcome::TransientFailure,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        POSIX_SHELL_PROBE_COMMAND, POWERSHELL_PROBE_COMMAND, SHELL_DETECTION_TIMEOUT,
        SHELL_PROBE_TIMEOUT, ShellProbeOutcome, retry_transient_probe,
    };
    use crate::domain::shell_integration::RemoteShell;
    use std::{cell::Cell, future::ready, time::Duration};

    #[test]
    fn probes_are_fixed_bounded_commands() {
        assert_eq!(
            POSIX_SHELL_PROBE_COMMAND,
            "printf '__QTERM_SHELL__'; basename \"$SHELL\""
        );
        assert_eq!(
            POWERSHELL_PROBE_COMMAND,
            "Write-Output ('__QTERM_SHELL__powershell')"
        );
        assert_eq!(SHELL_PROBE_TIMEOUT, Duration::from_secs(1));
        assert_eq!(SHELL_DETECTION_TIMEOUT, Duration::from_secs(4));
    }

    #[tokio::test]
    async fn retries_one_transient_probe_and_returns_the_recovered_shell() {
        let attempts = Cell::new(0);
        let shell = retry_transient_probe(|| {
            let attempt = attempts.get();
            attempts.set(attempt + 1);
            ready(if attempt == 0 {
                ShellProbeOutcome::TransientFailure
            } else {
                ShellProbeOutcome::Detected(RemoteShell::Zsh)
            })
        })
        .await;

        assert_eq!(shell, Some(RemoteShell::Zsh));
        assert_eq!(attempts.get(), 2);
    }

    #[tokio::test]
    async fn stops_after_two_transient_probe_attempts() {
        let attempts = Cell::new(0);
        let shell = retry_transient_probe(|| {
            attempts.set(attempts.get() + 1);
            ready(ShellProbeOutcome::TransientFailure)
        })
        .await;

        assert_eq!(shell, None);
        assert_eq!(attempts.get(), 2);
    }

    #[tokio::test]
    async fn does_not_retry_an_explicitly_unsupported_shell() {
        let attempts = Cell::new(0);
        let shell = retry_transient_probe(|| {
            attempts.set(attempts.get() + 1);
            ready(ShellProbeOutcome::Unsupported)
        })
        .await;

        assert_eq!(shell, None);
        assert_eq!(attempts.get(), 1);
    }
}
