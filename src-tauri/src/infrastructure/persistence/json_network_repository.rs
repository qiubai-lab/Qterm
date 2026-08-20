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
        network::{ForwardRule, ForwardRuleKind, NetworkRuleId},
        profile::ProfileId,
    },
    ports::network_repository::{NetworkRepository, NetworkRepositoryError},
};

const SCHEMA_VERSION: u64 = 1;
const MAX_DOCUMENT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_RULES: usize = 512;

pub struct JsonNetworkRepository {
    path: PathBuf,
    write_lock: Mutex<()>,
}

impl JsonNetworkRepository {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            write_lock: Mutex::new(()),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, ()>, NetworkRepositoryError> {
        self.write_lock
            .lock()
            .map_err(|_| NetworkRepositoryError::Io)
    }

    fn load_unlocked(&self) -> Result<Vec<ForwardRule>, NetworkRepositoryError> {
        match fs::metadata(&self.path) {
            Ok(metadata) if metadata.len() > MAX_DOCUMENT_BYTES => {
                return Err(NetworkRepositoryError::CorruptData);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err(NetworkRepositoryError::Io),
        }
        let bytes = fs::read(&self.path).map_err(|_| NetworkRepositoryError::Io)?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| NetworkRepositoryError::CorruptData)?;
        if contains_sensitive_field(&value) {
            return Err(NetworkRepositoryError::SensitiveField);
        }
        let version = value
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .ok_or(NetworkRepositoryError::CorruptData)?;
        if version != SCHEMA_VERSION {
            return Err(NetworkRepositoryError::UnsupportedSchemaVersion(version));
        }
        let document: NetworkDocument =
            serde_json::from_value(value).map_err(|_| NetworkRepositoryError::CorruptData)?;
        if document.rules.len() > MAX_RULES {
            return Err(NetworkRepositoryError::CorruptData);
        }
        let mut ids = HashSet::with_capacity(document.rules.len());
        let mut rules = Vec::with_capacity(document.rules.len());
        for record in document.rules {
            let rule = record.into_domain()?;
            if !ids.insert(rule.id().as_str().to_owned()) {
                return Err(NetworkRepositoryError::CorruptData);
            }
            rules.push(rule);
        }
        Ok(rules)
    }

    fn save_unlocked(&self, rules: &[ForwardRule]) -> Result<(), NetworkRepositoryError> {
        if rules.len() > MAX_RULES {
            return Err(NetworkRepositoryError::CorruptData);
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| NetworkRepositoryError::Io)?;
        }
        let document = NetworkDocument {
            schema_version: SCHEMA_VERSION,
            rules: rules.iter().map(NetworkRuleRecord::from_domain).collect(),
        };
        let mut bytes =
            serde_json::to_vec_pretty(&document).map_err(|_| NetworkRepositoryError::Io)?;
        bytes.push(b'\n');
        let mut file = AtomicWriteFile::open(&self.path).map_err(|_| NetworkRepositoryError::Io)?;
        file.write_all(&bytes)
            .map_err(|_| NetworkRepositoryError::Io)?;
        file.commit().map_err(|_| NetworkRepositoryError::Io)
    }
}

impl NetworkRepository for JsonNetworkRepository {
    fn list(&self) -> Result<Vec<ForwardRule>, NetworkRepositoryError> {
        let _guard = self.lock()?;
        self.load_unlocked()
    }

    fn insert(&self, rule: ForwardRule) -> Result<(), NetworkRepositoryError> {
        let _guard = self.lock()?;
        let mut rules = self.load_unlocked()?;
        if rules.iter().any(|stored| stored.id() == rule.id()) {
            return Err(NetworkRepositoryError::AlreadyExists);
        }
        rules.push(rule);
        self.save_unlocked(&rules)
    }

    fn update(&self, rule: ForwardRule) -> Result<(), NetworkRepositoryError> {
        let _guard = self.lock()?;
        let mut rules = self.load_unlocked()?;
        let stored = rules
            .iter_mut()
            .find(|stored| stored.id() == rule.id())
            .ok_or(NetworkRepositoryError::NotFound)?;
        *stored = rule;
        self.save_unlocked(&rules)
    }

    fn delete(&self, id: &NetworkRuleId) -> Result<(), NetworkRepositoryError> {
        let _guard = self.lock()?;
        let mut rules = self.load_unlocked()?;
        let original_length = rules.len();
        rules.retain(|rule| rule.id() != id);
        if rules.len() == original_length {
            return Err(NetworkRepositoryError::NotFound);
        }
        self.save_unlocked(&rules)
    }

    fn has_profile_rules(&self, profile_id: &ProfileId) -> Result<bool, NetworkRepositoryError> {
        let _guard = self.lock()?;
        self.load_unlocked()
            .map(|rules| rules.iter().any(|rule| rule.profile_id() == profile_id))
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct NetworkDocument {
    schema_version: u64,
    rules: Vec<NetworkRuleRecord>,
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum NetworkRuleRecord {
    Local {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
    },
    Remote {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
        target_host: String,
        target_port: u16,
    },
    Socks5 {
        id: String,
        profile_id: String,
        name: String,
        bind_host: String,
        bind_port: u16,
    },
}

impl NetworkRuleRecord {
    fn from_domain(rule: &ForwardRule) -> Self {
        let common = || {
            (
                rule.id().as_str().to_owned(),
                rule.profile_id().as_str().to_owned(),
                rule.name().to_owned(),
            )
        };
        match rule.kind() {
            ForwardRuleKind::Local {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name) = common();
                Self::Local {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                }
            }
            ForwardRuleKind::Remote {
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => {
                let (id, profile_id, name) = common();
                Self::Remote {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                    target_host: target_host.clone(),
                    target_port: *target_port,
                }
            }
            ForwardRuleKind::Socks5 {
                bind_host,
                bind_port,
            } => {
                let (id, profile_id, name) = common();
                Self::Socks5 {
                    id,
                    profile_id,
                    name,
                    bind_host: bind_host.clone(),
                    bind_port: *bind_port,
                }
            }
        }
    }

    fn into_domain(self) -> Result<ForwardRule, NetworkRepositoryError> {
        let (id, profile_id, name, kind) = match self {
            Self::Local {
                id,
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                id,
                profile_id,
                name,
                ForwardRuleKind::local(
                    bind_host,
                    bind_port.into(),
                    target_host,
                    target_port.into(),
                ),
            ),
            Self::Remote {
                id,
                profile_id,
                name,
                bind_host,
                bind_port,
                target_host,
                target_port,
            } => (
                id,
                profile_id,
                name,
                ForwardRuleKind::remote(
                    bind_host,
                    bind_port.into(),
                    target_host,
                    target_port.into(),
                ),
            ),
            Self::Socks5 {
                id,
                profile_id,
                name,
                bind_host,
                bind_port,
            } => (
                id,
                profile_id,
                name,
                ForwardRuleKind::socks5(bind_host, bind_port.into()),
            ),
        };
        ForwardRule::new(
            NetworkRuleId::parse(id).map_err(|_| NetworkRepositoryError::CorruptData)?,
            ProfileId::parse(profile_id).map_err(|_| NetworkRepositoryError::CorruptData)?,
            name,
            kind.map_err(|_| NetworkRepositoryError::CorruptData)?,
        )
        .map_err(|_| NetworkRepositoryError::CorruptData)
    }
}

fn contains_sensitive_field(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, value)| {
            matches!(
                key.to_ascii_lowercase().as_str(),
                "password"
                    | "passphrase"
                    | "privatekey"
                    | "privatekeydata"
                    | "credential"
                    | "credentialid"
                    | "sessionid"
                    | "token"
                    | "secret"
            ) || contains_sensitive_field(value)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_field),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::JsonNetworkRepository;
    use crate::{
        domain::{
            network::{ForwardRule, ForwardRuleKind, NetworkRuleId},
            profile::ProfileId,
        },
        ports::network_repository::{NetworkRepository, NetworkRepositoryError},
    };

    fn rule() -> ForwardRule {
        ForwardRule::new(
            NetworkRuleId::parse("network-1").expect("id"),
            ProfileId::parse("profile-1").expect("profile"),
            "SOCKS",
            ForwardRuleKind::socks5("127.0.0.1", 1080).expect("kind"),
        )
        .expect("rule")
    }

    #[test]
    fn round_trips_strict_non_sensitive_records() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("network-forwards.json");
        let repository = JsonNetworkRepository::new(path.clone());
        repository.insert(rule()).expect("insert");
        assert_eq!(repository.list().expect("list"), vec![rule()]);
        let text = fs::read_to_string(path).expect("document");
        assert!(text.contains("\"schemaVersion\": 1"));
        assert!(!text.contains("sessionId"));
    }

    #[test]
    fn rejects_unknown_sensitive_and_unsupported_documents_without_rewriting() {
        for (name, bytes, expected) in [
            (
                "unknown",
                br#"{"schemaVersion":1,"rules":[],"runtime":{}}"#.as_slice(),
                NetworkRepositoryError::CorruptData,
            ),
            (
                "sensitive",
                br#"{"schemaVersion":1,"rules":[],"password":"secret"}"#.as_slice(),
                NetworkRepositoryError::SensitiveField,
            ),
            (
                "version",
                br#"{"schemaVersion":2,"rules":[]}"#.as_slice(),
                NetworkRepositoryError::UnsupportedSchemaVersion(2),
            ),
        ] {
            let directory = tempdir().expect("tempdir");
            let path = directory.path().join(format!("{name}.json"));
            fs::write(&path, bytes).expect("fixture");
            let repository = JsonNetworkRepository::new(path.clone());
            assert_eq!(repository.list().expect_err("reject"), expected);
            assert_eq!(fs::read(path).expect("unchanged"), bytes);
        }
    }
}
