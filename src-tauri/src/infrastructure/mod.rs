//! Implementations for browser launch, persistence, SSH, known-hosts, terminal, and SFTP ports.

pub mod browser;
pub mod clipboard;
pub mod git_cli;
pub mod local;
pub mod persistence;
pub mod ssh;

#[cfg(target_os = "macos")]
pub mod window_chrome;

pub mod notifications;
