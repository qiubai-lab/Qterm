//! Implementations for browser launch, persistence, SSH, known-hosts, terminal, and SFTP ports.

pub mod browser;
pub mod clipboard;
pub mod git_cli;
pub(crate) mod git_execution;
pub mod local;
pub mod persistence;
pub(crate) mod shell_startup;
pub mod ssh;
pub(crate) mod terminal_image;

pub mod notifications;
