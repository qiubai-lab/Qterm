use crate::infrastructure::ssh::client::SshSessionManager;

/// Only the trusted host can choose a network. Remote failure never selects Local.
#[derive(Clone, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum WebTarget {
    Local {},
    Remote {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "profileId")]
        profile_id: String,
    },
}

impl WebTarget {
    pub fn session(&self) -> Option<&str> {
        match self {
            Self::Local {} => None,
            Self::Remote { session_id, .. } => Some(session_id),
        }
    }

    pub(super) fn connected(&self, sessions: &SshSessionManager) -> bool {
        self.session()
            .is_none_or(|id| sessions.web_session_connected(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_is_explicit_and_remote_requires_both_identifiers() {
        let local: WebTarget = serde_json::from_str(r#"{"type":"local"}"#).unwrap();
        assert!(local.session().is_none());
        for invalid in [
            r#"{}"#,
            r#"{"type":"remote"}"#,
            r#"{"type":"local","sessionId":"ssh"}"#,
        ] {
            assert!(serde_json::from_str::<WebTarget>(invalid).is_err());
        }
    }
}
