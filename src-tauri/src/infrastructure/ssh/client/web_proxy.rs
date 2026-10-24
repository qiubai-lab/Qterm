use super::*;

#[cfg(test)]
mod tests;

impl SshSessionManager {
    /// Private, ephemeral listener: the OS chooses the port while holding the socket.
    pub async fn start_web_proxy(
        &self,
        session_id: &str,
        profile_id: &str,
        owner: &str,
    ) -> Result<u16, SessionControlError> {
        self.start_forward_listener(
            session_id,
            owner.to_owned(),
            profile_id,
            ForwardRuleKind::Socks5 {
                bind_host: "127.0.0.1".into(),
                bind_port: 0,
            },
        )
        .await
    }

    pub fn web_session_connected(&self, id: &str) -> bool {
        self.entry(id).is_ok_and(|entry| {
            entry.purpose == SessionPurpose::Network && entry.state() == SessionState::Connected
        })
    }
}
