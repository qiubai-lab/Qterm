//! PTY/request negotiation, including explicit exec-rejection fallback.
use super::shell_startup;
#[cfg(test)]
mod tests;
use crate::domain::{
    session::{InitialDirectory, TerminalSize},
    shell_integration::RemoteShell,
};
use russh::{Channel, ChannelMsg, client};
use std::{sync::Arc, time::Duration};

type TerminalChannel = Channel<client::Msg>;

pub(super) async fn open<H: client::Handler>(
    handle: &client::Handle<H>,
    size: TerminalSize,
    shell: Option<RemoteShell>,
    directory: Option<&InitialDirectory>,
    output: &Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<TerminalChannel, ()> {
    let mut channel = pty(handle, size, output).await?;
    if let Some(shell) = shell {
        if channel
            .exec(true, shell_startup::command(shell, directory))
            .await
            .is_err()
        {
            let _ = channel.close().await;
            return Err(());
        }
        match acknowledge(&mut channel, output).await {
            Ok(true) => return Ok(channel),
            Ok(false) => {
                let _ = channel.close().await;
                channel = pty(handle, size, output).await?;
            }
            Err(()) => {
                let _ = channel.close().await;
                return Err(());
            }
        }
    }
    if channel.request_shell(true).await.is_ok()
        && acknowledge(&mut channel, output).await == Ok(true)
    {
        Ok(channel)
    } else {
        let _ = channel.close().await;
        Err(())
    }
}

async fn pty<H: client::Handler>(
    handle: &client::Handle<H>,
    size: TerminalSize,
    output: &Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<TerminalChannel, ()> {
    let mut channel = handle.channel_open_session().await.map_err(|_| ())?;
    if channel
        .request_pty(true, "xterm-256color", size.columns, size.rows, 0, 0, &[])
        .await
        .is_ok()
        && acknowledge(&mut channel, output).await == Ok(true)
    {
        Ok(channel)
    } else {
        let _ = channel.close().await;
        Err(())
    }
}

async fn acknowledge(
    channel: &mut TerminalChannel,
    output: &Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<bool, ()> {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Success) => return Ok(true),
                Some(ChannelMsg::Failure) => return Ok(false),
                Some(ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. }) => {
                    output(data.to_vec())
                }
                Some(ChannelMsg::Eof | ChannelMsg::Close) | None => return Err(()),
                _ => {}
            }
        }
    })
    .await
    .map_err(|_| ())?
}
