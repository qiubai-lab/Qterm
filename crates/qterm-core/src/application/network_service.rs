use uuid::Uuid;

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    domain::{
        network::{ForwardRule, ForwardRuleKind, NetworkRuleId, NetworkValidationError},
        profile::ProfileId,
    },
    ports::network_repository::{NetworkRepository, NetworkRepositoryError},
};

pub struct NetworkRuleInput {
    pub profile_id: String,
    pub name: String,
    pub kind: ForwardRuleKind,
}

pub struct NetworkService<R> {
    repository: R,
}

impl<R> NetworkService<R>
where
    R: NetworkRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub fn list(&self, profile_id: Option<&str>) -> Result<Vec<ForwardRule>, ApplicationError> {
        let profile_id = profile_id
            .map(ProfileId::parse)
            .transpose()
            .map_err(|_| invalid_rule("连接配置 ID 无效"))?;
        self.repository
            .list()
            .map(|rules| {
                rules
                    .into_iter()
                    .filter(|rule| profile_id.as_ref().is_none_or(|id| rule.profile_id() == id))
                    .collect()
            })
            .map_err(map_repository_error)
    }

    pub fn get(&self, id: &str) -> Result<ForwardRule, ApplicationError> {
        let id = NetworkRuleId::parse(id).map_err(map_validation_error)?;
        self.repository
            .list()
            .map_err(map_repository_error)?
            .into_iter()
            .find(|rule| rule.id() == &id)
            .ok_or_else(|| map_repository_error(NetworkRepositoryError::NotFound))
    }

    pub fn create(&self, input: NetworkRuleInput) -> Result<ForwardRule, ApplicationError> {
        let id = NetworkRuleId::parse(format!("network-{}", Uuid::new_v4()))
            .map_err(map_validation_error)?;
        let rule = build_rule(id, input)?;
        self.repository
            .insert(rule.clone())
            .map_err(map_repository_error)?;
        Ok(rule)
    }

    pub fn update(
        &self,
        id: &str,
        input: NetworkRuleInput,
    ) -> Result<ForwardRule, ApplicationError> {
        let id = NetworkRuleId::parse(id).map_err(map_validation_error)?;
        let rule = build_rule(id, input)?;
        self.repository
            .update(rule.clone())
            .map_err(map_repository_error)?;
        Ok(rule)
    }

    pub fn delete(&self, id: &str) -> Result<(), ApplicationError> {
        let id = NetworkRuleId::parse(id).map_err(map_validation_error)?;
        self.repository.delete(&id).map_err(map_repository_error)
    }

    pub fn clear_storage(&self) -> Result<(), ApplicationError> {
        self.repository
            .clear_storage()
            .map_err(map_repository_error)
    }

    pub fn delete_profile_rules(&self, profile_id: &str) -> Result<usize, ApplicationError> {
        let profile_id =
            ProfileId::parse(profile_id).map_err(|_| invalid_rule("连接配置 ID 无效"))?;
        self.repository
            .delete_by_profile(&profile_id)
            .map_err(map_repository_error)
    }
}

fn build_rule(id: NetworkRuleId, input: NetworkRuleInput) -> Result<ForwardRule, ApplicationError> {
    let profile_id =
        ProfileId::parse(input.profile_id).map_err(|_| invalid_rule("连接配置 ID 无效"))?;
    ForwardRule::new(id, profile_id, input.name, input.kind).map_err(map_validation_error)
}

fn invalid_rule(message: &'static str) -> ApplicationError {
    ApplicationError::new(ApplicationErrorCode::InvalidNetworkRule, message, false)
}

fn map_validation_error(error: NetworkValidationError) -> ApplicationError {
    invalid_rule(match error {
        NetworkValidationError::InvalidId => "网络规则 ID 无效",
        NetworkValidationError::InvalidProfileId => "连接配置 ID 无效",
        NetworkValidationError::NameRequired => "网络规则名称不能为空",
        NetworkValidationError::InvalidName => "网络规则名称无效",
        NetworkValidationError::HostRequired => "监听或目标主机不能为空",
        NetworkValidationError::InvalidHost => "监听或目标主机格式无效",
        NetworkValidationError::InvalidPort => "端口必须在 1 到 65535 之间",
    })
}

fn map_repository_error(error: NetworkRepositoryError) -> ApplicationError {
    match error {
        NetworkRepositoryError::AlreadyExists => ApplicationError::new(
            ApplicationErrorCode::NetworkRuleAlreadyExists,
            "网络规则已存在",
            false,
        ),
        NetworkRepositoryError::NotFound => ApplicationError::new(
            ApplicationErrorCode::NetworkRuleNotFound,
            "网络规则不存在",
            false,
        ),
        NetworkRepositoryError::CorruptData => ApplicationError::new(
            ApplicationErrorCode::NetworkStorageCorrupt,
            "网络规则文件已损坏",
            false,
        ),
        NetworkRepositoryError::UnsupportedSchemaVersion(_) => ApplicationError::new(
            ApplicationErrorCode::NetworkStorageVersionUnsupported,
            "网络规则文件版本不受支持",
            false,
        ),
        NetworkRepositoryError::SensitiveField => ApplicationError::new(
            ApplicationErrorCode::NetworkStorageContainsSensitiveData,
            "网络规则文件包含禁止保存的敏感字段",
            false,
        ),
        NetworkRepositoryError::Io => ApplicationError::new(
            ApplicationErrorCode::NetworkStorageUnavailable,
            "暂时无法访问网络规则文件",
            true,
        ),
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{NetworkRuleInput, NetworkService};
    use crate::{
        domain::network::ForwardRuleKind,
        infrastructure::persistence::json_network_repository::JsonNetworkRepository,
    };

    #[test]
    fn orchestrates_rule_crud_and_profile_filtering() {
        let directory = tempdir().expect("tempdir");
        let service = NetworkService::new(JsonNetworkRepository::new(
            directory.path().join("network-forwards.json"),
        ));
        let rule = service
            .create(NetworkRuleInput {
                profile_id: "profile-1".into(),
                name: "Web".into(),
                kind: ForwardRuleKind::local("127.0.0.1", 8080, "localhost", 80).expect("kind"),
            })
            .expect("create");
        assert_eq!(service.list(Some("profile-1")).expect("list").len(), 1);
        assert_eq!(service.list(Some("profile-1")).expect("rules").len(), 1);
        service.delete(rule.id().as_str()).expect("delete");
        assert!(service.list(Some("profile-1")).expect("rules").is_empty());
    }
}
