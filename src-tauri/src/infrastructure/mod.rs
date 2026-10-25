//! Implementations for browser launch, persistence, SSH, known-hosts, terminal, and SFTP ports.

pub mod browser;
pub mod clipboard;
pub(crate) mod external_links;
pub mod git_cli;
pub(crate) mod git_execution;
pub mod local;
pub mod persistence;
pub(crate) mod shell_startup;
pub mod ssh;
pub(crate) mod terminal_image;

pub mod notifications;

pub mod web;
