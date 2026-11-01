use crate::error::{ApiError, Result};
use axum::extract::ws::{Message, WebSocket};
use qterm_core::{
    domain::session::TerminalSize,
    infrastructure::{local::pty::LocalSessionManager, ssh::client::SshSessionManager},
};
use std::{sync::Arc, time::Duration};

pub enum SessionControl {
    Remote(Arc<SshSessionManager>),
    Local(Arc<LocalSessionManager>),
}
impl SessionControl {
    pub fn write_now(&self, id: &str, bytes: Vec<u8>) -> Result<()> {
        match self {
            Self::Remote(m) => m.write(id, bytes).map_err(Into::into),
            Self::Local(m) => m.write(id, bytes).map_err(|_| ApiError::invalid()),
        }
    }
    pub async fn write(&self, id: &str, bytes: Vec<u8>) -> Result<()> {
        match self {
            Self::Remote(manager) => manager.write(id, bytes).map_err(Into::into),
            Self::Local(manager) => {
                let manager = manager.clone();
                let id = id.to_owned();
                // A shell that stops reading must not block the async HTTP executor.
                tokio::time::timeout(
                    Duration::from_secs(5),
                    tokio::task::spawn_blocking(move || manager.write(&id, bytes)),
                )
                .await
                .map_err(|_| ApiError::invalid())?
                .map_err(|_| ApiError::invalid())?
                .map_err(|_| ApiError::invalid())
            }
        }
    }
    pub fn resize(&self, id: &str, size: TerminalSize) -> Result<()> {
        match self {
            Self::Remote(manager) => manager.resize(id, size).map_err(Into::into),
            Self::Local(manager) => manager
                .resize(
                    id,
                    portable_pty::PtySize {
                        rows: size.rows as u16,
                        cols: size.columns as u16,
                        pixel_width: 0,
                        pixel_height: 0,
                    },
                )
                .map_err(|_| ApiError::invalid()),
        }
    }
    pub fn host_key(&self, id: &str, accept: bool) -> Result<()> {
        let Self::Remote(manager) = self else {
            return Err(ApiError::invalid());
        };
        if accept {
            manager.accept_host_key(id)
        } else {
            manager.reject_host_key(id)
        }
        .map_err(Into::into)
    }
    pub fn close(&self, id: &str) {
        match self {
            Self::Remote(m) => {
                let _ = m.close(id);
            }
            Self::Local(m) => {
                let _ = m.close(id);
            }
        }
    }
}

pub async fn send(socket: &mut WebSocket, message: Message) -> Result<()> {
    tokio::time::timeout(Duration::from_secs(5), socket.send(message))
        .await
        .map_err(|_| ApiError::invalid())?
        .map_err(|_| ApiError::invalid())
}
