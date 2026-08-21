use uuid::Uuid;

use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    application::network_service::NetworkService,
    domain::{
        credential::CredentialId,
        profile::{
            AuthPreference, ConnectionProfile, ProfileField, ProfileGroup, ProfileGroupId,
            ProfileId, ProfileValidationError, ValidationReason,
        },
    },
    ports::{
        network_repository::NetworkRepository,
        profile_repository::{ProfileRepository, ProfileRepositoryError},
    },
};

pub struct ProfileInput {
    pub name: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub auth_preference: AuthPreference,
    pub credential_id: Option<String>,
    pub group_id: Option<String>,
}

pub fn delete_profile_with_network_rules<PR, NR>(
    profiles: &ProfileService<PR>,
    networks: &NetworkService<NR>,
    id: &str,
) -> Result<usize, ApplicationError>
where
    PR: ProfileRepository,
    NR: NetworkRepository,
{
    let profile = profiles
        .list()?
        .into_iter()
        .find(|profile| profile.id().as_str() == id)
        .ok_or_else(|| map_repository_error(ProfileRepositoryError::NotFound))?;
    networks.list(Some(id))?;
    profiles.delete(id)?;
    match networks.delete_profile_rules(id) {
        Ok(deleted) => Ok(deleted),
        Err(error) => {
            profiles.repository.insert(profile).map_err(|_| {
                ApplicationError::new(
                    ApplicationErrorCode::ProfileStorageUnavailable,
                    "删除关联网络规则失败，且无法恢复连接配置",
                    true,
                )
            })?;
            Err(error)
        }
    }
}

pub struct ProfileGroupInput {
    pub name: String,
}

pub struct ProfileService<R> {
    repository: R,
}

impl<R> ProfileService<R>
where
    R: ProfileRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub fn list(&self) -> Result<Vec<ConnectionProfile>, ApplicationError> {
        self.repository.list().map_err(map_repository_error)
    }

    pub fn list_groups(&self) -> Result<Vec<ProfileGroup>, ApplicationError> {
        self.repository.list_groups().map_err(map_repository_error)
    }

    pub fn create(&self, input: ProfileInput) -> Result<ConnectionProfile, ApplicationError> {
        let id = ProfileId::parse(Uuid::new_v4().to_string()).map_err(map_validation_error)?;
        let profile = build_profile(id, input)?;
        self.repository
            .insert(profile.clone())
            .map_err(map_repository_error)?;
        Ok(profile)
    }

    pub fn create_many(
        &self,
        inputs: Vec<ProfileInput>,
    ) -> Result<Vec<ConnectionProfile>, ApplicationError> {
        let profiles = inputs
            .into_iter()
            .map(|input| {
                let id =
                    ProfileId::parse(Uuid::new_v4().to_string()).map_err(map_validation_error)?;
                build_profile(id, input)
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.repository
            .insert_many(profiles.clone())
            .map_err(map_repository_error)?;
        Ok(profiles)
    }

    pub fn update(
        &self,
        id: &str,
        input: ProfileInput,
    ) -> Result<ConnectionProfile, ApplicationError> {
        let id = ProfileId::parse(id).map_err(map_validation_error)?;
        let profile = build_profile(id, input)?;
        self.repository
            .update(profile.clone())
            .map_err(map_repository_error)?;
        Ok(profile)
    }

    pub fn delete(&self, id: &str) -> Result<(), ApplicationError> {
        let id = ProfileId::parse(id).map_err(map_validation_error)?;
        self.repository.delete(&id).map_err(map_repository_error)
    }

    pub fn clear_credential_references(&self, id: &str) -> Result<(), ApplicationError> {
        let id = CredentialId::parse(id.to_owned()).map_err(ApplicationError::from)?;
        self.repository
            .clear_credential_references(&id)
            .map_err(map_repository_error)
    }

    pub fn clear_all_credential_references(&self) -> Result<(), ApplicationError> {
        self.repository
            .clear_all_credential_references()
            .map_err(map_repository_error)
    }

    pub fn create_group(&self, input: ProfileGroupInput) -> Result<ProfileGroup, ApplicationError> {
        let id = ProfileGroupId::parse(Uuid::new_v4().to_string()).map_err(map_validation_error)?;
        let group = ProfileGroup::new(id, input.name).map_err(map_validation_error)?;
        self.repository
            .insert_group(group.clone())
            .map_err(map_repository_error)?;
        Ok(group)
    }

    pub fn update_group(
        &self,
        id: &str,
        input: ProfileGroupInput,
    ) -> Result<ProfileGroup, ApplicationError> {
        let id = ProfileGroupId::parse(id).map_err(map_validation_error)?;
        let group = ProfileGroup::new(id, input.name).map_err(map_validation_error)?;
        self.repository
            .update_group(group.clone())
            .map_err(map_repository_error)?;
        Ok(group)
    }

    pub fn delete_group(&self, id: &str) -> Result<(), ApplicationError> {
        let id = ProfileGroupId::parse(id).map_err(map_validation_error)?;
        self.repository
            .delete_group(&id)
            .map_err(map_repository_error)
    }
}

fn build_profile(
    id: ProfileId,
    input: ProfileInput,
) -> Result<ConnectionProfile, ApplicationError> {
    let profile = ConnectionProfile::new(
        id,
        input.name,
        input.host,
        input.port,
        input.username,
        input.auth_preference,
        input
            .credential_id
            .map(CredentialId::parse)
            .transpose()
            .map_err(ApplicationError::from)?,
    )
    .map_err(map_validation_error)?;
    let group_id = input
        .group_id
        .map(ProfileGroupId::parse)
        .transpose()
        .map_err(map_validation_error)?;
    Ok(profile.with_group_id(group_id))
}

fn map_validation_error(error: ProfileValidationError) -> ApplicationError {
    let code = match error.field() {
        ProfileField::Id => ApplicationErrorCode::InvalidProfileId,
        ProfileField::GroupId => ApplicationErrorCode::InvalidProfileGroupId,
        ProfileField::GroupName => ApplicationErrorCode::InvalidProfileGroupName,
        ProfileField::Name => ApplicationErrorCode::InvalidProfileName,
        ProfileField::Host => ApplicationErrorCode::InvalidProfileHost,
        ProfileField::Port => ApplicationErrorCode::InvalidProfilePort,
        ProfileField::Username => ApplicationErrorCode::InvalidProfileUsername,
    };
    let message = match (error.field(), error.reason()) {
        (ProfileField::Name, ValidationReason::Required) => "连接名称不能为空",
        (ProfileField::GroupName, ValidationReason::Required) => "分组名称不能为空",
        (ProfileField::Host, ValidationReason::Required) => "主机不能为空",
        (ProfileField::Username, ValidationReason::Required) => "用户名不能为空",
        (ProfileField::Port, _) => "端口必须在 1 到 65535 之间",
        (ProfileField::Id, _) => "连接配置 ID 无效",
        (ProfileField::GroupId, _) => "连接分组 ID 无效",
        (ProfileField::GroupName, _) => "分组名称无效",
        (ProfileField::Name, _) => "连接名称无效",
        (ProfileField::Host, _) => "主机格式无效",
        (ProfileField::Username, _) => "用户名格式无效",
    };

    ApplicationError::new(code, message, false)
}

fn map_repository_error(error: ProfileRepositoryError) -> ApplicationError {
    match error {
        ProfileRepositoryError::AlreadyExists => ApplicationError::new(
            ApplicationErrorCode::ProfileAlreadyExists,
            "连接配置已存在",
            false,
        ),
        ProfileRepositoryError::NotFound => ApplicationError::new(
            ApplicationErrorCode::ProfileNotFound,
            "连接配置不存在",
            false,
        ),
        ProfileRepositoryError::GroupAlreadyExists => ApplicationError::new(
            ApplicationErrorCode::ProfileGroupAlreadyExists,
            "分组名称已存在",
            false,
        ),
        ProfileRepositoryError::GroupNotFound => ApplicationError::new(
            ApplicationErrorCode::ProfileGroupNotFound,
            "连接分组不存在",
            false,
        ),
        ProfileRepositoryError::CorruptData => ApplicationError::new(
            ApplicationErrorCode::ProfileStorageCorrupt,
            "连接配置文件已损坏",
            false,
        ),
        ProfileRepositoryError::UnsupportedSchemaVersion(_) => ApplicationError::new(
            ApplicationErrorCode::ProfileStorageVersionUnsupported,
            "连接配置文件版本不受支持",
            false,
        ),
        ProfileRepositoryError::SensitiveField => ApplicationError::new(
            ApplicationErrorCode::ProfileStorageContainsSensitiveData,
            "连接配置文件包含禁止保存的敏感字段",
            false,
        ),
        ProfileRepositoryError::Io => ApplicationError::new(
            ApplicationErrorCode::ProfileStorageUnavailable,
            "暂时无法访问连接配置文件",
            true,
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Mutex};

    use tempfile::tempdir;

    use super::{
        ProfileGroupInput, ProfileInput, ProfileService, delete_profile_with_network_rules,
    };
    use crate::{
        application::{
            error::ApplicationErrorCode,
            network_service::{NetworkRuleInput, NetworkService},
        },
        domain::{
            network::{ForwardRule, ForwardRuleKind, NetworkRuleId},
            profile::{AuthPreference, ProfileId},
        },
        infrastructure::persistence::{
            json_network_repository::JsonNetworkRepository,
            json_profile_repository::JsonProfileRepository,
        },
        ports::network_repository::{NetworkRepository, NetworkRepositoryError},
    };

    struct FailingDeleteNetworkRepository {
        rules: Mutex<Vec<ForwardRule>>,
    }

    impl NetworkRepository for FailingDeleteNetworkRepository {
        fn list(&self) -> Result<Vec<ForwardRule>, NetworkRepositoryError> {
            Ok(self.rules.lock().expect("rules").clone())
        }

        fn insert(&self, _rule: ForwardRule) -> Result<(), NetworkRepositoryError> {
            Err(NetworkRepositoryError::Io)
        }

        fn update(&self, _rule: ForwardRule) -> Result<(), NetworkRepositoryError> {
            Err(NetworkRepositoryError::Io)
        }

        fn delete(&self, _id: &NetworkRuleId) -> Result<(), NetworkRepositoryError> {
            Err(NetworkRepositoryError::Io)
        }

        fn delete_by_profile(
            &self,
            _profile_id: &ProfileId,
        ) -> Result<usize, NetworkRepositoryError> {
            Err(NetworkRepositoryError::Io)
        }
    }

    fn input(name: &str) -> ProfileInput {
        ProfileInput {
            name: name.to_owned(),
            host: "example.com".to_owned(),
            port: 22,
            username: "deploy".to_owned(),
            auth_preference: AuthPreference::Password,
            credential_id: None,
            group_id: None,
        }
    }

    #[test]
    fn orchestrates_create_update_list_and_delete() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        let service = ProfileService::new(repository);

        let created = service
            .create(input(" Production "))
            .expect("create profile");
        assert_eq!(created.name(), "Production");

        let updated = service
            .update(created.id().as_str(), input("Production updated"))
            .expect("update profile");
        assert_eq!(updated.id(), created.id());
        assert_eq!(service.list().expect("list profiles"), vec![updated]);

        service
            .delete(created.id().as_str())
            .expect("delete profile");
        assert!(service.list().expect("list empty profiles").is_empty());
    }

    #[test]
    fn cascades_profile_deletion_to_only_its_network_rules() {
        let directory = tempdir().expect("temporary directory");
        let profiles = ProfileService::new(JsonProfileRepository::new(
            directory.path().join("profiles.json"),
        ));
        let networks = NetworkService::new(JsonNetworkRepository::new(
            directory.path().join("network-forwards.json"),
        ));
        let deleted_profile = profiles.create(input("Production")).expect("profile");
        let preserved_profile = profiles.create(input("Staging")).expect("profile");
        for (profile_id, name, port) in [
            (deleted_profile.id().as_str(), "SOCKS 1", 1080),
            (deleted_profile.id().as_str(), "SOCKS 2", 1081),
            (preserved_profile.id().as_str(), "Preserved", 1082),
        ] {
            networks
                .create(NetworkRuleInput {
                    profile_id: profile_id.to_owned(),
                    name: name.to_owned(),
                    kind: ForwardRuleKind::socks5("127.0.0.1", port).expect("kind"),
                })
                .expect("network rule");
        }

        let deleted =
            delete_profile_with_network_rules(&profiles, &networks, deleted_profile.id().as_str())
                .expect("cascade delete");

        assert_eq!(deleted, 2);
        assert_eq!(
            profiles.list().expect("profiles"),
            vec![preserved_profile.clone()]
        );
        let remaining = networks.list(None).expect("rules");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].profile_id(), preserved_profile.id());
    }

    #[test]
    fn restores_the_profile_when_network_rule_deletion_fails() {
        let directory = tempdir().expect("temporary directory");
        let profiles = ProfileService::new(JsonProfileRepository::new(
            directory.path().join("profiles.json"),
        ));
        let profile = profiles.create(input("Production")).expect("profile");
        let rule = ForwardRule::new(
            NetworkRuleId::parse("network-1").expect("rule id"),
            profile.id().clone(),
            "SOCKS",
            ForwardRuleKind::socks5("127.0.0.1", 1080).expect("kind"),
        )
        .expect("rule");
        let networks = NetworkService::new(FailingDeleteNetworkRepository {
            rules: Mutex::new(vec![rule]),
        });

        let error = delete_profile_with_network_rules(&profiles, &networks, profile.id().as_str())
            .expect_err("network deletion must fail");

        assert_eq!(
            error.code(),
            ApplicationErrorCode::NetworkStorageUnavailable
        );
        assert_eq!(profiles.list().expect("restored profile"), vec![profile]);
    }

    #[test]
    fn maps_validation_failures_to_stable_error_codes() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        let service = ProfileService::new(repository);
        let mut invalid = input("Production");
        invalid.host = "bad host".to_owned();

        let error = service.create(invalid).expect_err("invalid host must fail");
        assert_eq!(error.code(), ApplicationErrorCode::InvalidProfileHost);
        assert!(!error.retryable());
    }

    #[test]
    fn maps_sensitive_storage_to_a_non_retryable_stable_error() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        fs::write(
            &path,
            r#"{"schemaVersion":1,"profiles":[],"passphrase":"forbidden"}"#,
        )
        .expect("write fixture");
        let service = ProfileService::new(JsonProfileRepository::new(path));

        let error = service.list().expect_err("sensitive storage must fail");
        assert_eq!(
            error.code(),
            ApplicationErrorCode::ProfileStorageContainsSensitiveData
        );
        assert!(!error.retryable());
    }

    #[test]
    fn credential_reference_is_an_optional_non_secret_profile_value() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        let service = ProfileService::new(repository);
        let mut key_profile = input("Key profile");
        key_profile.auth_preference = AuthPreference::PrivateKey;
        key_profile.credential_id = Some("credential-1".into());

        let created = service.create(key_profile).expect("create key profile");
        assert_eq!(
            created.credential_id().map(|id| id.as_str()),
            Some("credential-1")
        );
    }

    #[test]
    fn group_names_are_unique_and_deleting_a_group_preserves_its_profiles() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        let service = ProfileService::new(repository);
        let group = service
            .create_group(ProfileGroupInput {
                name: "Production".into(),
            })
            .expect("create group");
        let duplicate = service
            .create_group(ProfileGroupInput {
                name: "production".into(),
            })
            .expect_err("duplicate group name");
        assert_eq!(
            duplicate.code(),
            ApplicationErrorCode::ProfileGroupAlreadyExists
        );

        let mut grouped = input("Server");
        grouped.group_id = Some(group.id().as_str().to_owned());
        let profile = service.create(grouped).expect("grouped profile");
        service
            .delete_group(group.id().as_str())
            .expect("delete group");

        assert!(service.list_groups().expect("groups").is_empty());
        assert_eq!(
            service.list().expect("profiles"),
            vec![profile.with_group_id(None)]
        );
    }
}
