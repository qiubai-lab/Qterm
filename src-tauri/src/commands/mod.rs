//! Tauri transport adapters. Commands validate DTOs and delegate to application services.

pub mod browser;
pub mod credential;
pub mod error;
pub mod files;
pub mod local_session;
pub mod network;
pub mod profile;
pub mod session;
pub mod settings;
pub mod transfer;
pub mod workspace;
