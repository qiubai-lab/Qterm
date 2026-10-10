use super::{JsonProfileRepository, ProfileCatalog};
use crate::{
    domain::profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    ports::sync::{SyncLocalStore, SyncResult},
};
use qterm_sync_core::{AuthPreference as PortableAuth, Catalog, Group, Profile};

fn portable(catalog: &ProfileCatalog) -> Catalog {
    Catalog {
        groups: catalog
            .groups
            .iter()
            .map(|g| {
                (
                    g.id().as_str().to_owned(),
                    Group {
                        name: g.name().into(),
                    },
                )
            })
            .collect(),
        profiles: catalog
            .profiles
            .iter()
            .map(|p| {
                (
                    p.id().as_str().to_owned(),
                    Profile {
                        name: p.name().into(),
                        host: p.host().into(),
                        port: p.port(),
                        username: p.username().into(),
                        auth_preference: match p.auth_preference() {
                            AuthPreference::Manual => PortableAuth::Manual,
                            AuthPreference::Password => PortableAuth::Password,
                            AuthPreference::PrivateKey => PortableAuth::PrivateKey,
                            AuthPreference::SshAgent => PortableAuth::SshAgent,
                        },
                        group_id: p.group_id().map(|id| id.as_str().into()),
                        jump_profile_ids: p
                            .jump_profile_ids()
                            .iter()
                            .map(|id| id.as_str().into())
                            .collect(),
                    },
                )
            })
            .collect(),
    }
}

impl SyncLocalStore for JsonProfileRepository {
    fn catalog(&self) -> SyncResult<Catalog> {
        let _guard = self.acquire_lock().map_err(|_| "连接配置正被占用")?;
        self.load_unlocked()
            .map(|data| portable(&data))
            .map_err(|_| "本机连接配置无法读取，同步已暂停".into())
    }
    fn apply(&self, expected: &Catalog, desired: &Catalog) -> SyncResult<()> {
        desired.validate().map_err(str::to_owned)?;
        let _guard = self.acquire_lock().map_err(|_| "连接配置正被占用")?;
        let current = self.load_unlocked().map_err(|_| "本机连接配置无法读取")?;
        if portable(&current) != *expected {
            return Err("本机配置在同步期间发生变化，请重试".into());
        }
        // Local forwarding rules are not synced. Require explicit local cleanup before deletion.
        let network_path = self.path.with_file_name("network-forwards.json");
        let network =
            super::super::json_network_repository::JsonNetworkRepository::new(network_path);
        use crate::ports::network_repository::NetworkRepository;
        let removes_profile = expected
            .profiles
            .keys()
            .any(|id| !desired.profiles.contains_key(id));
        if removes_profile
            && network
                .list()
                .map_err(|_| "无法检查关联网络规则")?
                .iter()
                .any(|rule| !desired.profiles.contains_key(rule.profile_id().as_str()))
        {
            return Err(
                "远端删除的连接仍有本机网络规则，请先在本机删除该连接的网络规则再同步".into(),
            );
        }
        let mut profiles = Vec::new();
        for (id, p) in &desired.profiles {
            let auth = match p.auth_preference {
                PortableAuth::Manual => AuthPreference::Manual,
                PortableAuth::Password => AuthPreference::Password,
                PortableAuth::PrivateKey => AuthPreference::PrivateKey,
                PortableAuth::SshAgent => AuthPreference::SshAgent,
            };
            let binding = expected
                .profiles
                .get(id)
                .filter(|old| old.same_auth_target(p))
                .and_then(|_| current.profiles.iter().find(|old| old.id().as_str() == id))
                .and_then(|old| old.credential_id())
                .cloned();
            let profile = ConnectionProfile::new(
                ProfileId::parse(id).map_err(|_| "连接 ID 无效")?,
                &p.name,
                &p.host,
                p.port.into(),
                &p.username,
                auth,
                binding,
            )
            .map_err(|_| "连接格式无效")?
            .with_group_id(
                p.group_id
                    .as_ref()
                    .map(ProfileGroupId::parse)
                    .transpose()
                    .map_err(|_| "分组 ID 无效")?,
            )
            .with_jump_profile_ids(
                p.jump_profile_ids
                    .iter()
                    .map(ProfileId::parse)
                    .collect::<Result<_, _>>()
                    .map_err(|_| "跳板机 ID 无效")?,
            );
            profiles.push(profile);
        }
        let groups = desired
            .groups
            .iter()
            .map(|(id, g)| ProfileGroup::new(ProfileGroupId::parse(id)?, &g.name))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "分组格式无效")?;
        let data = ProfileCatalog { groups, profiles };
        let serialized = serde_json::to_vec(desired).map_err(|_| "连接配置编码失败")?;
        // Leave room for local-only fields and formatting in the existing JSON repository.
        if serialized.len() > 1024 * 1024 {
            return Err("连接配置超过本机同步容量限制（1 MiB）".into());
        }
        self.save_unlocked(&data)
            .map_err(|_| "无法保存同步连接配置".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ports::profile_repository::ProfileRepository;
    #[test]
    fn remote_jump_without_credentials_is_stored_but_cannot_connect() {
        let dir = tempfile::tempdir().unwrap();
        let repo = JsonProfileRepository::new(dir.path().join("connections.json"));
        let profile = Profile {
            name: "Jump".into(),
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            auth_preference: PortableAuth::Password,
            group_id: None,
            jump_profile_ids: vec![],
        };
        let mut desired = Catalog::default();
        desired.profiles.insert("jump".into(), profile.clone());
        desired.profiles.insert(
            "target".into(),
            Profile {
                name: "Target".into(),
                jump_profile_ids: vec!["jump".into()],
                ..profile
            },
        );
        repo.apply(&Catalog::default(), &desired).unwrap();
        assert_eq!(repo.catalog().unwrap(), desired);
        assert!(
            crate::domain::profile::resolve_profile_route(
                &repo.list().unwrap(),
                &ProfileId::parse("target").unwrap()
            )
            .is_err()
        );
        assert!(repo.apply(&Catalog::default(), &desired).is_err());
    }

    #[test]
    fn local_credentials_survive_rename_but_not_auth_target_change() {
        let dir = tempfile::tempdir().unwrap();
        let repo = JsonProfileRepository::new(dir.path().join("connections.json"));
        let bound = ConnectionProfile::new(
            ProfileId::parse("a").unwrap(),
            "A",
            "example.com",
            22,
            "root",
            AuthPreference::Password,
            Some(crate::domain::credential::CredentialId::parse("local-secret").unwrap()),
        )
        .unwrap();
        repo.insert(bound).unwrap();
        let before = repo.catalog().unwrap();
        let mut renamed = before.clone();
        renamed.profiles.get_mut("a").unwrap().name = "Renamed".into();
        repo.apply(&before, &renamed).unwrap();
        assert_eq!(
            repo.list().unwrap()[0].credential_id().unwrap().as_str(),
            "local-secret"
        );
        let mut moved = renamed.clone();
        moved.profiles.get_mut("a").unwrap().host = "other.example.com".into();
        repo.apply(&renamed, &moved).unwrap();
        assert!(repo.list().unwrap()[0].credential_id().is_none());
        assert!(
            !serde_json::to_string(&moved)
                .unwrap()
                .contains("local-secret")
        );
    }

    #[test]
    fn multiple_unbound_jumps_can_be_bound_one_at_a_time() {
        let dir = tempfile::tempdir().unwrap();
        let repo = JsonProfileRepository::new(dir.path().join("connections.json"));
        let jump = Profile {
            name: "Jump".into(),
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            auth_preference: PortableAuth::Password,
            group_id: None,
            jump_profile_ids: vec![],
        };
        let mut desired = Catalog::default();
        desired.profiles.insert("one".into(), jump.clone());
        desired.profiles.insert("two".into(), jump.clone());
        desired.profiles.insert(
            "target".into(),
            Profile {
                jump_profile_ids: vec!["one".into(), "two".into()],
                ..jump
            },
        );
        repo.apply(&Catalog::default(), &desired).unwrap();
        for id in ["one", "two"] {
            let profile = repo
                .list()
                .unwrap()
                .into_iter()
                .find(|p| p.id().as_str() == id)
                .unwrap();
            repo.update(profile.with_credential_id(Some(
                crate::domain::credential::CredentialId::parse("local").unwrap(),
            )))
            .unwrap();
        }
        assert!(
            crate::domain::profile::resolve_profile_route(
                &repo.list().unwrap(),
                &ProfileId::parse("target").unwrap()
            )
            .is_ok()
        );
    }
}
