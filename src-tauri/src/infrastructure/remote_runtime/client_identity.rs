//! Public product metadata shared by HTTP and WebSocket audit trails.
pub(super) fn user_agent() -> String {
    format!(
        "Qterm Desktop/{} ({}; {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
}
