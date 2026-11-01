//! Implementations for browser launch, persistence, SSH, known-hosts, terminal, and SFTP ports.

pub mod browser;
pub mod clipboard;
pub(crate) mod external_links;
pub use qterm_core::infrastructure::git_cli;
pub use qterm_core::infrastructure::local;
pub use qterm_core::infrastructure::persistence;
pub use qterm_core::infrastructure::ssh;
pub(crate) mod terminal_image;

pub mod notifications;

pub mod web;

#[cfg(target_os = "macos")]
pub(crate) mod macos_menu;
