//! Headless implementations shared by desktop and server.
pub mod git_cli;
pub(crate) mod git_execution;
pub mod local;
pub mod persistence;
pub(crate) mod shell_startup;
pub mod ssh;
pub(crate) mod task_runtime;
