use std::{cmp::min, time::Instant};

use russh::{Channel, ChannelMsg, Sig, client};

use crate::{
    domain::git::GitError,
    infrastructure::{git_cli::classify_failure, git_execution::GitExecutionBudget},
};

use super::{ClientHandler, posix_literal};

const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
const ENVIRONMENT: &str = "GIT_TERMINAL_PROMPT=0 GIT_EDITOR=true GIT_PAGER=cat LC_ALL=C";
const TERMINATION_GRACE: std::time::Duration = std::time::Duration::from_secs(2);

pub(super) struct RemoteOutput {
    pub(super) stdout: Vec<u8>,
}

pub(super) async fn run_git(
    handle: &client::Handle<ClientHandler>,
    repository: &str,
    args: &str,
    stdin: Vec<u8>,
    budget: GitExecutionBudget,
) -> Result<RemoteOutput, GitError> {
    let command = format!("{ENVIRONMENT} git -C {} {args}", posix_literal(repository));
    run_command(handle, &command, stdin, budget).await
}

pub(super) async fn run_command(
    handle: &client::Handle<ClientHandler>,
    command: &str,
    stdin: Vec<u8>,
    budget: GitExecutionBudget,
) -> Result<RemoteOutput, GitError> {
    let started = Instant::now();
    let mut channel = tokio::time::timeout(
        step_timeout(budget, started)?,
        handle.channel_open_session(),
    )
    .await
    .map_err(|_| GitError::Timeout)?
    .map_err(|_| GitError::SessionUnavailable)?;
    if let Err(error) = prepare_command(&channel, command, &stdin, budget, started).await {
        terminate_remote_command(&mut channel).await;
        return Err(error);
    }

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status = None;
    loop {
        let wait = match step_timeout(budget, started) {
            Ok(wait) => wait,
            Err(error) => {
                terminate_remote_command(&mut channel).await;
                return Err(error);
            }
        };
        let message = match tokio::time::timeout(wait, channel.wait()).await {
            Ok(message) => message,
            Err(_) => {
                terminate_remote_command(&mut channel).await;
                return Err(GitError::Timeout);
            }
        };
        let Some(message) = message else { break };
        let append = match message {
            ChannelMsg::Data { data } => append_bounded(&mut stdout, &data),
            ChannelMsg::ExtendedData { data, .. } => append_bounded(&mut stderr, &data),
            ChannelMsg::ExitStatus {
                exit_status: status,
            } => {
                exit_status = Some(status);
                Ok(())
            }
            _ => Ok(()),
        };
        if let Err(error) = append {
            terminate_remote_command(&mut channel).await;
            return Err(error);
        }
    }
    match exit_status {
        Some(0) => Ok(RemoteOutput { stdout }),
        Some(127) => Err(GitError::Missing),
        Some(_) => Err(classify_remote_failure(&stderr)),
        None => Err(GitError::SessionUnavailable),
    }
}

async fn prepare_command(
    channel: &Channel<client::Msg>,
    command: &str,
    stdin: &[u8],
    budget: GitExecutionBudget,
    started: Instant,
) -> Result<(), GitError> {
    tokio::time::timeout(step_timeout(budget, started)?, channel.exec(true, command))
        .await
        .map_err(|_| GitError::Timeout)?
        .map_err(|_| GitError::SessionUnavailable)?;
    if !stdin.is_empty() {
        tokio::time::timeout(step_timeout(budget, started)?, channel.data(stdin))
            .await
            .map_err(|_| GitError::Timeout)?
            .map_err(|_| GitError::SessionUnavailable)?;
    }
    tokio::time::timeout(step_timeout(budget, started)?, channel.eof())
        .await
        .map_err(|_| GitError::Timeout)?
        .map_err(|_| GitError::SessionUnavailable)?;
    Ok(())
}

fn step_timeout(
    budget: GitExecutionBudget,
    started: Instant,
) -> Result<std::time::Duration, GitError> {
    budget
        .remaining_total(started, Instant::now())
        .map(|remaining| min(remaining, budget.inactivity()))
        .filter(|duration| !duration.is_zero())
        .ok_or(GitError::Timeout)
}

async fn terminate_remote_command(channel: &mut Channel<client::Msg>) {
    let _ = tokio::time::timeout(TERMINATION_GRACE, channel.signal(Sig::TERM)).await;
    let exited = tokio::time::timeout(TERMINATION_GRACE, async {
        while let Some(message) = channel.wait().await {
            if matches!(message, ChannelMsg::ExitStatus { .. }) {
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false);
    if !exited {
        let _ = tokio::time::timeout(TERMINATION_GRACE, channel.signal(Sig::KILL)).await;
    }
    let _ = tokio::time::timeout(TERMINATION_GRACE, channel.close()).await;
}

fn append_bounded(target: &mut Vec<u8>, data: &[u8]) -> Result<(), GitError> {
    if target.len().saturating_add(data.len()) > OUTPUT_LIMIT {
        return Err(GitError::OutputTooLarge);
    }
    target.extend_from_slice(data);
    Ok(())
}

fn classify_remote_failure(stderr: &[u8]) -> GitError {
    let lower = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    if lower.contains("permission denied") || lower.contains("operation not permitted") {
        GitError::PermissionDenied
    } else {
        classify_failure(stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_each_remote_output_stream() {
        let mut output = vec![0; OUTPUT_LIMIT];
        assert_eq!(
            append_bounded(&mut output, b"x"),
            Err(GitError::OutputTooLarge)
        );
    }

    #[test]
    fn step_timeout_uses_idle_budget_but_never_exceeds_total_remaining() {
        let started = Instant::now();
        let budget = GitExecutionBudget::new(
            std::time::Duration::from_secs(10),
            std::time::Duration::from_secs(30),
        );
        assert!(
            step_timeout(budget, started).expect("step timeout")
                <= std::time::Duration::from_secs(10)
        );
    }
}
