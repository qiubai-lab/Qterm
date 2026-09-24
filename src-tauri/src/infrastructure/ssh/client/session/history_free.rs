use super::*;
use crate::{
    domain::history_free_shell,
    infrastructure::shell_startup::{STARTUP_TIMEOUT, ShellStartup},
};

pub(super) async fn initialize(
    terminal: &mut russh::Channel<client::Msg>,
    request: &SessionConnectRequest,
    cancel: &mut oneshot::Receiver<()>,
) -> Result<(), ()> {
    let mut startup = ShellStartup::new();
    let command = history_free_shell::remote_command(
        request.remote_shell_integration_enabled,
        request.initial_directory.as_ref(),
        startup.marker(),
    );
    tokio::select! {
        _ = &mut *cancel => Err(()),
        result = tokio::time::timeout(STARTUP_TIMEOUT, async {
            terminal.exec(true, command).await.map_err(|_| ())?;
            loop {
                match terminal.wait().await {
                    Some(ChannelMsg::Data { data }) => {
                        if let Some(output) = startup.push(&data)? {
                            (request.terminal_output)(output);
                            return Ok(());
                        }
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        // Count stderr against the same output cap, but never trust it as readiness.
                        startup.account(data.len())?;
                        (request.terminal_output)(data.to_vec());
                    }
                    Some(ChannelMsg::Failure | ChannelMsg::Eof | ChannelMsg::Close | ChannelMsg::ExitStatus { .. }) | None => return Err(()),
                    _ => {}
                }
            }
        }) => result.map_err(|_| ())?,
    }
}
