use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    domain::{
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
    },
    ports::profile_repository::{ProfileRepository, ProfileRepositoryError},
};

const PROFILE_SCHEMA_VERSION: u64 = 4;
const MAX_PROFILE_DOCUMENT_BYTES: u64 = 4 * 1024 * 1024;

pub struct JsonProfileRepository {
    path: PathBuf,
    write_lock: Mutex<()>,
}

impl JsonProfileRepository {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            write_lock: Mutex::new(()),
        }
    }

    fn acquire_lock(&self) -> Result<MutexGuard<'_, ()>, ProfileRepositoryError> {
        self.write_lock
            .lock()
            .map_err(|_| ProfileRepositoryError::Io)
    }

    fn load_unlocked(&self) -> Result<ProfileCatalog, ProfileRepositoryError> {
        match fs::metadata(&self.path) {
            Ok(metadata) if metadata.len() > MAX_PROFILE_DOCUMENT_BYTES => {
                return Err(ProfileRepositoryError::CorruptData);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(ProfileCatalog::default());
            }
            Err(_) => return Err(ProfileRepositoryError::Io),
        }

        let bytes = fs::read(&self.path).map_err(|_| ProfileRepositoryError::Io)?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| ProfileRepositoryError::CorruptData)?;
        if contains_sensitive_field(&value) {
            return Err(ProfileRepositoryError::SensitiveField);
        }

        let schema_version = value
            .as_object()
            .and_then(|object| object.get("schemaVersion"))
            .and_then(Value::as_u64)
            .ok_or(ProfileRepositoryError::CorruptData)?;
        if schema_version != PROFILE_SCHEMA_VERSION {
            return Err(ProfileRepositoryError::UnsupportedSchemaVersion(
                schema_version,
            ));
        }

        let document: ProfileDocument =
            serde_json::from_value(value).map_err(|_| ProfileRepositoryError::CorruptData)?;
        let mut group_ids = HashSet::with_capacity(document.groups.len());
        let mut groups = Vec::with_capacity(document.groups.len());
        for record in document.groups {
            let group = record.try_into_domain()?;
            if !group_ids.insert(group.id().as_str().to_owned()) {
                return Err(ProfileRepositoryError::CorruptData);
            }
            if groups
                .iter()
                .any(|stored: &ProfileGroup| stored.name().eq_ignore_ascii_case(group.name()))
            {
                return Err(ProfileRepositoryError::CorruptData);
            }
            groups.push(group);
        }

        let mut ids = HashSet::with_capacity(document.profiles.len());
        let mut profiles = Vec::with_capacity(document.profiles.len());
        for record in document.profiles {
            let profile = record.try_into_domain()?;
            if !ids.insert(profile.id().as_str().to_owned()) {
                return Err(ProfileRepositoryError::CorruptData);
            }
            if profile
                .group_id()
                .is_some_and(|id| !group_ids.contains(id.as_str()))
            {
                return Err(ProfileRepositoryError::CorruptData);
            }
            profiles.push(profile);
        }

        Ok(ProfileCatalog { groups, profiles })
    }

    fn save_unlocked(&self, catalog: &ProfileCatalog) -> Result<(), ProfileRepositoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| ProfileRepositoryError::Io)?;
        }

        let document = ProfileDocument {
            schema_version: PROFILE_SCHEMA_VERSION,
            groups: catalog
                .groups
                .iter()
                .map(ProfileGroupRecord::from_domain)
                .collect(),
            profiles: catalog
                .profiles
                .iter()
                .map(ProfileRecord::from_domain)
                .collect(),
        };
        let mut bytes =
            serde_json::to_vec_pretty(&document).map_err(|_| ProfileRepositoryError::Io)?;
        bytes.push(b'\n');

        let mut file = AtomicWriteFile::open(&self.path).map_err(|_| ProfileRepositoryError::Io)?;
        file.write_all(&bytes)
            .map_err(|_| ProfileRepositoryError::Io)?;
        file.commit().map_err(|_| ProfileRepositoryError::Io)
    }
}

impl ProfileRepository for JsonProfileRepository {
    fn list(&self) -> Result<Vec<ConnectionProfile>, ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        self.load_unlocked().map(|catalog| catalog.profiles)
    }

    fn list_groups(&self) -> Result<Vec<ProfileGroup>, ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        self.load_unlocked().map(|catalog| catalog.groups)
    }

    fn insert(&self, profile: ConnectionProfile) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        if catalog
            .profiles
            .iter()
            .any(|stored| stored.id() == profile.id())
        {
            return Err(ProfileRepositoryError::AlreadyExists);
        }
        if profile
            .group_id()
            .is_some_and(|id| !catalog.groups.iter().any(|group| group.id() == id))
        {
            return Err(ProfileRepositoryError::GroupNotFound);
        }
        catalog.profiles.push(profile);
        self.save_unlocked(&catalog)
    }

    fn insert_many(&self, profiles: Vec<ConnectionProfile>) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        let mut ids = catalog
            .profiles
            .iter()
            .map(|profile| profile.id().as_str().to_owned())
            .collect::<HashSet<_>>();
        for profile in &profiles {
            if !ids.insert(profile.id().as_str().to_owned()) {
                return Err(ProfileRepositoryError::AlreadyExists);
            }
            if profile
                .group_id()
                .is_some_and(|id| !catalog.groups.iter().any(|group| group.id() == id))
            {
                return Err(ProfileRepositoryError::GroupNotFound);
            }
        }
        catalog.profiles.extend(profiles);
        self.save_unlocked(&catalog)
    }

    fn update(&self, profile: ConnectionProfile) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        if profile
            .group_id()
            .is_some_and(|id| !catalog.groups.iter().any(|group| group.id() == id))
        {
            return Err(ProfileRepositoryError::GroupNotFound);
        }
        let stored = catalog
            .profiles
            .iter_mut()
            .find(|stored| stored.id() == profile.id())
            .ok_or(ProfileRepositoryError::NotFound)?;
        *stored = profile;
        self.save_unlocked(&catalog)
    }

    fn delete(&self, id: &ProfileId) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        let original_length = catalog.profiles.len();
        catalog.profiles.retain(|profile| profile.id() != id);
        if catalog.profiles.len() == original_length {
            return Err(ProfileRepositoryError::NotFound);
        }
        self.save_unlocked(&catalog)
    }

    fn clear_credential_references(&self, id: &CredentialId) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        catalog.profiles = catalog
            .profiles
            .into_iter()
            .map(|profile| {
                if profile.credential_id() == Some(id) {
                    profile.with_credential_id(None)
                } else {
                    profile
                }
            })
            .collect();
        self.save_unlocked(&catalog)
    }

    fn clear_all_credential_references(&self) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        catalog.profiles = catalog
            .profiles
            .into_iter()
            .map(|profile| profile.with_credential_id(None))
            .collect();
        self.save_unlocked(&catalog)
    }

    fn insert_group(&self, group: ProfileGroup) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        if catalog.groups.iter().any(|stored| {
            stored.id() == group.id() || stored.name().eq_ignore_ascii_case(group.name())
        }) {
            return Err(ProfileRepositoryError::GroupAlreadyExists);
        }
        catalog.groups.push(group);
        self.save_unlocked(&catalog)
    }

    fn update_group(&self, group: ProfileGroup) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        if catalog.groups.iter().any(|stored| {
            stored.id() != group.id() && stored.name().eq_ignore_ascii_case(group.name())
        }) {
            return Err(ProfileRepositoryError::GroupAlreadyExists);
        }
        let stored = catalog
            .groups
            .iter_mut()
            .find(|stored| stored.id() == group.id())
            .ok_or(ProfileRepositoryError::GroupNotFound)?;
        *stored = group;
        self.save_unlocked(&catalog)
    }

    fn delete_group(&self, id: &ProfileGroupId) -> Result<(), ProfileRepositoryError> {
        let _guard = self.acquire_lock()?;
        let mut catalog = self.load_unlocked()?;
        let original_length = catalog.groups.len();
        catalog.groups.retain(|group| group.id() != id);
        if catalog.groups.len() == original_length {
            return Err(ProfileRepositoryError::GroupNotFound);
        }
        catalog.profiles = catalog
            .profiles
            .into_iter()
            .map(|profile| {
                if profile.group_id() == Some(id) {
                    profile.with_group_id(None)
                } else {
                    profile
                }
            })
            .collect();
        self.save_unlocked(&catalog)
    }
}

#[derive(Default)]
struct ProfileCatalog {
    groups: Vec<ProfileGroup>,
    profiles: Vec<ConnectionProfile>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProfileDocument {
    schema_version: u64,
    #[serde(default)]
    groups: Vec<ProfileGroupRecord>,
    profiles: Vec<ProfileRecord>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProfileGroupRecord {
    id: String,
    name: String,
}

impl ProfileGroupRecord {
    fn from_domain(group: &ProfileGroup) -> Self {
        Self {
            id: group.id().as_str().to_owned(),
            name: group.name().to_owned(),
        }
    }

    fn try_into_domain(self) -> Result<ProfileGroup, ProfileRepositoryError> {
        ProfileGroup::new(
            ProfileGroupId::parse(self.id).map_err(|_| ProfileRepositoryError::CorruptData)?,
            self.name,
        )
        .map_err(|_| ProfileRepositoryError::CorruptData)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProfileRecord {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_preference: AuthPreferenceRecord,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    credential_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    group_id: Option<String>,
}

impl ProfileRecord {
    fn from_domain(profile: &ConnectionProfile) -> Self {
        Self {
            id: profile.id().as_str().to_owned(),
            name: profile.name().to_owned(),
            host: profile.host().to_owned(),
            port: profile.port(),
            username: profile.username().to_owned(),
            auth_preference: profile.auth_preference().into(),
            credential_id: profile.credential_id().map(|id| id.as_str().to_owned()),
            group_id: profile.group_id().map(|id| id.as_str().to_owned()),
        }
    }

    fn try_into_domain(self) -> Result<ConnectionProfile, ProfileRepositoryError> {
        let profile = ConnectionProfile::new(
            ProfileId::parse(self.id).map_err(|_| ProfileRepositoryError::CorruptData)?,
            self.name,
            self.host,
            self.port.into(),
            self.username,
            self.auth_preference.into(),
            self.credential_id
                .map(CredentialId::parse)
                .transpose()
                .map_err(|_| ProfileRepositoryError::CorruptData)?,
        )
        .map_err(|_| ProfileRepositoryError::CorruptData)?;
        let group_id = self
            .group_id
            .map(ProfileGroupId::parse)
            .transpose()
            .map_err(|_| ProfileRepositoryError::CorruptData)?;
        Ok(profile.with_group_id(group_id))
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum AuthPreferenceRecord {
    Password,
    PrivateKey,
    SshAgent,
    Manual,
}

impl From<AuthPreference> for AuthPreferenceRecord {
    fn from(value: AuthPreference) -> Self {
        match value {
            AuthPreference::Password => Self::Password,
            AuthPreference::PrivateKey => Self::PrivateKey,
            AuthPreference::SshAgent => Self::SshAgent,
            AuthPreference::Manual => Self::Manual,
        }
    }
}

impl From<AuthPreferenceRecord> for AuthPreference {
    fn from(value: AuthPreferenceRecord) -> Self {
        match value {
            AuthPreferenceRecord::Password => Self::Password,
            AuthPreferenceRecord::PrivateKey => Self::PrivateKey,
            AuthPreferenceRecord::SshAgent => Self::SshAgent,
            AuthPreferenceRecord::Manual => Self::Manual,
        }
    }
}

fn contains_sensitive_field(value: &Value) -> bool {
    match value {
        Value::Object(object) => object
            .iter()
            .any(|(key, value)| is_sensitive_key(key) || contains_sensitive_field(value)),
        Value::Array(values) => values.iter().any(contains_sensitive_field),
        _ => false,
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized: String = key
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect();
    matches!(
        normalized.as_str(),
        "password"
            | "passphrase"
            | "privatekeydata"
            | "credential"
            | "credentials"
            | "ciphertext"
            | "encryptedpassword"
    )
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc, thread};

    use tempfile::tempdir;

    use super::JsonProfileRepository;
    use crate::{
        domain::{
            credential::CredentialId,
            profile::{AuthPreference, ConnectionProfile, ProfileGroup, ProfileGroupId, ProfileId},
        },
        ports::profile_repository::{ProfileRepository, ProfileRepositoryError},
    };

    fn profile(id: &str, name: &str) -> ConnectionProfile {
        ConnectionProfile::new(
            ProfileId::parse(id).expect("fixture id must be valid"),
            name,
            "example.com",
            22,
            "deploy",
            AuthPreference::PrivateKey,
            Some(CredentialId::parse("credential-1").expect("credential")),
        )
        .expect("fixture profile must be valid")
    }

    #[test]
    fn persists_crud_and_recovers_after_repository_restart() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("nested/profiles.json");
        let repository = JsonProfileRepository::new(path.clone());

        repository
            .insert(profile("profile-1", "Production"))
            .expect("insert profile");
        repository
            .update(profile("profile-1", "Production updated"))
            .expect("update profile");

        let restarted = JsonProfileRepository::new(path);
        let profiles = restarted.list().expect("reload profiles");
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name(), "Production updated");

        restarted.delete(profiles[0].id()).expect("delete profile");
        assert!(restarted.list().expect("reload empty profiles").is_empty());
    }

    #[test]
    fn stores_schema_v4_credential_references_and_never_serializes_secret_fields() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        let repository = JsonProfileRepository::new(path.clone());

        repository
            .insert(profile("profile-1", "Production"))
            .expect("insert profile");

        let json = fs::read_to_string(path).expect("read profile document");
        assert!(json.contains("\"schemaVersion\": 4"));
        assert!(json.contains("\"groups\": []"));
        assert!(json.contains("\"credentialId\": \"credential-1\""));
        assert!(!json.contains("privateKeyPath"));
        for forbidden in ["password", "passphrase", "privateKeyData", "ciphertext"] {
            assert!(!json.contains(forbidden), "must not persist {forbidden}");
        }
    }

    #[test]
    fn rejects_sensitive_fields_without_modifying_the_source_file() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        let original = br#"{
  "schemaVersion": 1,
  "profiles": [{
    "id": "profile-1",
    "name": "Production",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password",
    "password": "must-not-be-here"
  }]
}"#;
        fs::write(&path, original).expect("write fixture");
        let repository = JsonProfileRepository::new(path.clone());

        assert_eq!(
            repository.list(),
            Err(ProfileRepositoryError::SensitiveField)
        );
        assert_eq!(fs::read(path).expect("read unchanged fixture"), original);
    }

    #[test]
    fn rejects_unknown_schema_and_corrupt_json_without_overwriting_them() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        let repository = JsonProfileRepository::new(path.clone());

        let unknown = br#"{"schemaVersion":99,"profiles":[]}"#;
        fs::write(&path, unknown).expect("write unknown schema fixture");
        assert_eq!(
            repository.list(),
            Err(ProfileRepositoryError::UnsupportedSchemaVersion(99))
        );
        assert_eq!(fs::read(&path).expect("read unknown schema"), unknown);

        let corrupt = br#"{"schemaVersion":1,"profiles":["#;
        fs::write(&path, corrupt).expect("write corrupt fixture");
        assert_eq!(repository.list(), Err(ProfileRepositoryError::CorruptData));
        assert_eq!(fs::read(path).expect("read corrupt fixture"), corrupt);
    }

    #[test]
    fn reports_duplicate_and_missing_profile_operations() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        repository
            .insert(profile("profile-1", "Production"))
            .expect("insert profile");

        assert_eq!(
            repository.insert(profile("profile-1", "Duplicate")),
            Err(ProfileRepositoryError::AlreadyExists)
        );
        assert_eq!(
            repository.update(profile("missing", "Missing")),
            Err(ProfileRepositoryError::NotFound)
        );
        assert_eq!(
            repository.delete(&ProfileId::parse("missing").expect("fixture id")),
            Err(ProfileRepositoryError::NotFound)
        );
    }

    #[test]
    fn batch_insert_validates_every_profile_before_writing_any() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        let invalid = profile("profile-2", "Invalid group").with_group_id(Some(
            ProfileGroupId::parse("missing-group").expect("group id"),
        ));

        assert_eq!(
            repository.insert_many(vec![profile("profile-1", "Valid"), invalid]),
            Err(ProfileRepositoryError::GroupNotFound)
        );
        assert!(repository.list().expect("list profiles").is_empty());
    }

    #[test]
    fn serializes_concurrent_writes_through_the_single_repository_instance() {
        let directory = tempdir().expect("temporary directory");
        let repository = Arc::new(JsonProfileRepository::new(
            directory.path().join("profiles.json"),
        ));
        let handles: Vec<_> = (0..8)
            .map(|index| {
                let repository = Arc::clone(&repository);
                thread::spawn(move || {
                    repository
                        .insert(profile(
                            &format!("profile-{index}"),
                            &format!("Profile {index}"),
                        ))
                        .expect("concurrent insert")
                })
            })
            .collect();

        for handle in handles {
            handle.join().expect("join writer");
        }

        assert_eq!(repository.list().expect("list profiles").len(), 8);
    }

    #[test]
    fn persists_groups_and_moves_profiles_to_ungrouped_when_a_group_is_deleted() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        let repository = JsonProfileRepository::new(path.clone());
        let group_id = ProfileGroupId::parse("group-1").expect("group id");
        repository
            .insert_group(ProfileGroup::new(group_id.clone(), "Production").expect("group"))
            .expect("insert group");
        repository
            .insert(profile("profile-1", "Server").with_group_id(Some(group_id.clone())))
            .expect("insert grouped profile");

        repository.delete_group(&group_id).expect("delete group");

        assert!(repository.list_groups().expect("groups").is_empty());
        assert_eq!(repository.list().expect("profiles")[0].group_id(), None);
        let json = fs::read_to_string(path).expect("profile document");
        assert!(json.contains("\"schemaVersion\": 4"));
        assert!(!json.contains("\"groupId\""));
    }

    #[test]
    fn clearing_a_shared_credential_reference_preserves_all_profiles() {
        let directory = tempdir().expect("temporary directory");
        let repository = JsonProfileRepository::new(directory.path().join("profiles.json"));
        repository.insert(profile("profile-1", "One")).expect("one");
        repository.insert(profile("profile-2", "Two")).expect("two");

        repository
            .clear_credential_references(&CredentialId::parse("credential-1").expect("id"))
            .expect("clear references");

        let profiles = repository.list().expect("profiles");
        assert_eq!(profiles.len(), 2);
        assert!(
            profiles
                .iter()
                .all(|profile| profile.credential_id().is_none())
        );
    }

    #[test]
    fn rejects_old_profile_schemas_without_modifying_them() {
        for schema_version in [1, 2, 3] {
            let directory = tempdir().expect("temporary directory");
            let path = directory.path().join("profiles.json");
            fs::write(
                &path,
                format!(
                    r#"{{
  "schemaVersion": {schema_version},
  "profiles": [{{
    "id": "profile-1",
    "name": "Legacy",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password"
  }}]
}}"#
                ),
            )
            .expect("legacy fixture");
            let repository = JsonProfileRepository::new(path.clone());

            assert_eq!(
                repository.list(),
                Err(ProfileRepositoryError::UnsupportedSchemaVersion(
                    schema_version
                ))
            );
            assert_eq!(
                fs::read_to_string(path).expect("unchanged"),
                format!(
                    r#"{{
  "schemaVersion": {schema_version},
  "profiles": [{{
    "id": "profile-1",
    "name": "Legacy",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password"
  }}]
}}"#
                )
            );
        }
    }

    #[test]
    fn rejects_dangling_group_references_without_overwriting_the_source() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("profiles.json");
        let original = br#"{
  "schemaVersion": 4,
  "groups": [],
  "profiles": [{
    "id": "profile-1",
    "name": "Dangling",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "authPreference": "password",
    "groupId": "missing-group"
  }]
}"#;
        fs::write(&path, original).expect("dangling fixture");
        let repository = JsonProfileRepository::new(path.clone());

        assert_eq!(repository.list(), Err(ProfileRepositoryError::CorruptData));
        assert_eq!(fs::read(path).expect("unchanged source"), original);
    }
}
