use std::net::IpAddr;

use crate::domain::profile::{ProfileId, ProfileValidationError};

const MAX_RULE_ID_LENGTH: usize = 128;
const MAX_RULE_NAME_LENGTH: usize = 80;
const MAX_HOST_LENGTH: usize = 253;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct NetworkRuleId(String);

impl NetworkRuleId {
    pub fn parse(value: impl Into<String>) -> Result<Self, NetworkValidationError> {
        let value = value.into();
        if value.is_empty()
            || value.len() > MAX_RULE_ID_LENGTH
            || value
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
        {
            return Err(NetworkValidationError::InvalidId);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListenerExposure {
    Loopback,
    Exposed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ForwardRuleKind {
    Local {
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
    },
    Remote {
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
    },
    Socks5 {
        bind_host: String,
        bind_port: u16,
    },
}

impl ForwardRuleKind {
    pub fn local(
        bind_host: impl AsRef<str>,
        bind_port: u32,
        target_host: impl AsRef<str>,
        target_port: u32,
    ) -> Result<Self, NetworkValidationError> {
        Ok(Self::Local {
            bind_host: validate_host(bind_host.as_ref())?,
            bind_port: validate_port(bind_port)?,
            target_host: validate_host(target_host.as_ref())?,
            target_port: validate_port(target_port)?,
        })
    }

    pub fn remote(
        bind_host: impl AsRef<str>,
        bind_port: u32,
        target_host: impl AsRef<str>,
        target_port: u32,
    ) -> Result<Self, NetworkValidationError> {
        Ok(Self::Remote {
            bind_host: validate_host(bind_host.as_ref())?,
            bind_port: validate_port(bind_port)?,
            target_host: validate_host(target_host.as_ref())?,
            target_port: validate_port(target_port)?,
        })
    }

    pub fn socks5(
        bind_host: impl AsRef<str>,
        bind_port: u32,
    ) -> Result<Self, NetworkValidationError> {
        Ok(Self::Socks5 {
            bind_host: validate_host(bind_host.as_ref())?,
            bind_port: validate_port(bind_port)?,
        })
    }

    pub fn bind_host(&self) -> &str {
        match self {
            Self::Local { bind_host, .. }
            | Self::Remote { bind_host, .. }
            | Self::Socks5 { bind_host, .. } => bind_host,
        }
    }

    pub fn exposure(&self) -> ListenerExposure {
        listener_exposure(self.bind_host())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ForwardRule {
    id: NetworkRuleId,
    profile_id: ProfileId,
    name: String,
    kind: ForwardRuleKind,
}

impl ForwardRule {
    pub fn new(
        id: NetworkRuleId,
        profile_id: ProfileId,
        name: impl AsRef<str>,
        kind: ForwardRuleKind,
    ) -> Result<Self, NetworkValidationError> {
        let name = name.as_ref().trim();
        if name.is_empty() {
            return Err(NetworkValidationError::NameRequired);
        }
        if name.chars().count() > MAX_RULE_NAME_LENGTH || name.chars().any(char::is_control) {
            return Err(NetworkValidationError::InvalidName);
        }
        Ok(Self {
            id,
            profile_id,
            name: name.to_owned(),
            kind,
        })
    }

    pub fn id(&self) -> &NetworkRuleId {
        &self.id
    }

    pub fn profile_id(&self) -> &ProfileId {
        &self.profile_id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn kind(&self) -> &ForwardRuleKind {
        &self.kind
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetworkValidationError {
    InvalidId,
    InvalidProfileId,
    NameRequired,
    InvalidName,
    HostRequired,
    InvalidHost,
    InvalidPort,
}

impl From<ProfileValidationError> for NetworkValidationError {
    fn from(_: ProfileValidationError) -> Self {
        Self::InvalidProfileId
    }
}

fn validate_host(value: &str) -> Result<String, NetworkValidationError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(NetworkValidationError::HostRequired);
    }
    if value.len() > MAX_HOST_LENGTH
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(NetworkValidationError::InvalidHost);
    }
    Ok(value.to_owned())
}

fn validate_port(value: u32) -> Result<u16, NetworkValidationError> {
    let value = u16::try_from(value).map_err(|_| NetworkValidationError::InvalidPort)?;
    if value == 0 {
        return Err(NetworkValidationError::InvalidPort);
    }
    Ok(value)
}

fn listener_exposure(host: &str) -> ListenerExposure {
    if host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback())
    {
        ListenerExposure::Loopback
    } else {
        ListenerExposure::Exposed
    }
}

#[cfg(test)]
mod tests {
    use super::{ForwardRule, ForwardRuleKind, ListenerExposure, NetworkRuleId};
    use crate::domain::profile::ProfileId;

    fn profile_id() -> ProfileId {
        ProfileId::parse("profile-1").expect("profile id")
    }

    #[test]
    fn validates_all_forwarding_variants_and_classifies_listener_exposure() {
        let local = ForwardRuleKind::local("127.0.0.1", 8080, "database.internal", 5432)
            .expect("local rule");
        assert_eq!(local.exposure(), ListenerExposure::Loopback);

        let remote =
            ForwardRuleKind::remote("0.0.0.0", 8443, "localhost", 443).expect("remote rule");
        assert_eq!(remote.exposure(), ListenerExposure::Exposed);

        let socks = ForwardRuleKind::socks5("::1", 1080).expect("socks rule");
        assert_eq!(socks.exposure(), ListenerExposure::Loopback);

        let rule = ForwardRule::new(
            NetworkRuleId::parse("network-1").expect("rule id"),
            profile_id(),
            " Database ",
            local,
        )
        .expect("rule");
        assert_eq!(rule.name(), "Database");
    }

    #[test]
    fn rejects_empty_hosts_zero_or_oversized_ports_and_invalid_names() {
        assert!(ForwardRuleKind::local("", 1, "host", 2).is_err());
        assert!(ForwardRuleKind::local("host", 0, "host", 2).is_err());
        assert!(ForwardRuleKind::local("host", 1, "host", 65_536).is_err());
        assert!(
            ForwardRule::new(
                NetworkRuleId::parse("network-1").expect("rule id"),
                profile_id(),
                "\n",
                ForwardRuleKind::socks5("127.0.0.1", 1080).expect("kind"),
            )
            .is_err()
        );
    }
}
