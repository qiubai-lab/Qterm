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

pub(crate) mod cef_runtime;
#[path = "web_cef/mod.rs"]
pub mod web;

#[cfg(target_os = "macos")]
pub(crate) mod macos_menu;
