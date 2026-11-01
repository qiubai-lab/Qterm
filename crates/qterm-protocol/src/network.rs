use qterm_core::{
    application::network_service::NetworkRuleInput,
    domain::network::{ForwardRule, ForwardRuleKind, ListenerExposure},
};
use serde::{Deserialize, Serialize};
#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NetworkRuleInputDto {
    Local {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
        target_host: String,
        target_port: u32,
    },
    Remote {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
        target_host: String,
        target_port: u32,
    },
    Socks5 {
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u32,
    },
}

impl NetworkRuleInputDto {
    pub fn profile_id(&self) -> &str {
        match self {
            Self::Local { profile_id, .. }
            | Self::Remote { profile_id, .. }
            | Self::Socks5 { profile_id, .. } => profile_id,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NetworkRuleDto {
    Local {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
        exposed: bool,
    },
    Remote {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
        exposed: bool,
    },
    Socks5 {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        exposed: bool,
    },
}

impl TryFrom<NetworkRuleInputDto> for NetworkRuleInput {
    type Error = qterm_core::application::error::ApplicationError;

    fn try_from(value: NetworkRuleInputDto) -> Result<Self, Self::Error> {
        let (profile_id, name, kind) = match value {
            NetworkRuleInputDto::Local {
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::local(bind_host, bind_port, target_host, target_port),
            ),
            NetworkRuleInputDto::Remote {
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::remote(bind_host, bind_port, target_host, target_port),
            ),
            NetworkRuleInputDto::Socks5 {
                profile_id,
                name,
                bind_host,
                bind_port,
            } => (
                profile_id,
                name,
                ForwardRuleKind::socks5(bind_host, bind_port),
            ),
        };
        let kind = kind.map_err(|_| {
            qterm_core::application::error::ApplicationError::new(
                qterm_core::application::error::ApplicationErrorCode::InvalidNetworkRule,
                "网络规则字段无效",
                false,
            )
        })?;
        Ok(Self {
            profile_id,
            name,
            kind,
        })
    }
}

impl From<&ForwardRule> for NetworkRuleDto {
    fn from(rule: &ForwardRule) -> Self {
        let common = || {
            (
                rule.id().as_str().to_owned(),
                rule.profile_id().as_str().to_owned(),
                rule.name().to_owned(),
                rule.kind().exposure() == ListenerExposure::Exposed,
            )
        };
        match rule.kind() {
            ForwardRuleKind::Local {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Local {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                    exposed,
                }
            }
            ForwardRuleKind::Remote {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Remote {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                    exposed,
                }
            }
            ForwardRuleKind::Socks5 {
                bind_host,
                bind_port,
            } => {
                let (id, profile_id, name, exposed) = common();
                Self::Socks5 {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    exposed,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::NetworkRuleInputDto;

    #[test]
    fn input_rejects_unknown_and_sensitive_fields() {
        let value = json!({
            "type": "socks5",
            "profileId": "profile-1",
            "name": "Proxy",
            "bindHost": "127.0.0.1",
            "bindPort": 1080,
            "password": "must-not-cross"
        });
        assert!(serde_json::from_value::<NetworkRuleInputDto>(value).is_err());
    }
}
