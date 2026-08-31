use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Mutex,
};

use crate::{
    application::profile_service::ProfileInput,
    domain::profile::{AuthPreference, ConnectionProfile},
};

struct PendingImport {
    preview_id: String,
    path: PathBuf,
    home: PathBuf,
}

#[derive(Default)]
pub struct SshConfigImportSession {
    pending: Mutex<Option<PendingImport>>,
}

impl SshConfigImportSession {
    pub fn remember(&self, path: PathBuf, home: PathBuf) -> String {
        let preview_id = uuid::Uuid::new_v4().to_string();
        *self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(PendingImport {
            preview_id: preview_id.clone(),
            path,
            home,
        });
        preview_id
    }

    pub fn source(&self, preview_id: &str) -> Option<(PathBuf, PathBuf)> {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            .filter(|pending| pending.preview_id == preview_id)
            .map(|pending| (pending.path.clone(), pending.home.clone()))
    }

    pub fn complete(&self, preview_id: &str) {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if pending
            .as_ref()
            .is_some_and(|value| value.preview_id == preview_id)
        {
            pending.take();
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ImportIdentityStatus {
    Available,
    Unavailable,
    TooLarge,
    DynamicPath,
}

#[derive(Clone, Debug)]
pub struct ImportIdentity {
    pub index: usize,
    pub path: PathBuf,
    pub reuse_key: PathBuf,
    pub file_name: String,
    pub status: ImportIdentityStatus,
}

#[derive(Clone, Debug)]
pub struct SshConfigCandidate {
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub identity_files: Vec<ImportIdentity>,
    pub warnings: Vec<String>,
}

#[derive(Debug)]
pub struct SshConfigImportItem {
    pub alias: String,
    pub identity_file_index: Option<u32>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Eq, PartialEq)]
pub struct SshConfigImportOutcome {
    pub imported: usize,
    pub imported_private_keys: usize,
    pub reused_private_keys: usize,
}

#[derive(Debug)]
pub struct ImportedCredential {
    pub id: String,
    pub created: bool,
}

pub trait SshConfigImportCommitter {
    type Error;

    fn import_or_reuse_private_key(
        &mut self,
        name: String,
        path: &std::path::Path,
        passphrase: Option<String>,
    ) -> Result<ImportedCredential, Self::Error>;

    fn create_profiles(&mut self, inputs: Vec<ProfileInput>) -> Result<usize, Self::Error>;

    fn rollback_credential(&mut self, credential_id: &str);
}

#[derive(Debug)]
pub enum SshConfigImportCommitError<E> {
    InvalidSelection,
    Operation(E),
}

struct SelectedCandidate {
    candidate: SshConfigCandidate,
    profile_name: String,
    identity_file_index: Option<u32>,
    passphrase: Option<String>,
}

pub fn commit_ssh_config_import<C: SshConfigImportCommitter>(
    existing: &[ConnectionProfile],
    candidates: &HashMap<String, SshConfigCandidate>,
    items: Vec<SshConfigImportItem>,
    committer: &mut C,
) -> Result<SshConfigImportOutcome, SshConfigImportCommitError<C::Error>> {
    let selected = select_import_candidates(items, candidates, existing)?;
    let mut credential_by_path = HashMap::<PathBuf, String>::new();
    let mut created_credential_ids = Vec::new();
    let mut reused_credential_ids = HashSet::new();
    let mut profile_inputs = Vec::with_capacity(selected.len());

    for selected_candidate in selected {
        let SelectedCandidate {
            candidate,
            profile_name,
            identity_file_index,
            passphrase,
        } = selected_candidate;
        let credential_id = if let Some(identity_index) = identity_file_index {
            let identity = candidate
                .identity_files
                .iter()
                .find(|identity| identity.index == identity_index as usize)
                .filter(|identity| identity.status == ImportIdentityStatus::Available)
                .ok_or(SshConfigImportCommitError::InvalidSelection)?;
            if let Some(id) = credential_by_path.get(&identity.reuse_key) {
                Some(id.clone())
            } else {
                let outcome = match committer.import_or_reuse_private_key(
                    format!("{} 私钥", candidate.alias),
                    &identity.path,
                    passphrase,
                ) {
                    Ok(outcome) => outcome,
                    Err(error) => {
                        rollback_credentials(committer, &created_credential_ids);
                        return Err(SshConfigImportCommitError::Operation(error));
                    }
                };
                credential_by_path.insert(identity.reuse_key.clone(), outcome.id.clone());
                if outcome.created {
                    created_credential_ids.push(outcome.id.clone());
                } else if !created_credential_ids.contains(&outcome.id) {
                    reused_credential_ids.insert(outcome.id.clone());
                }
                Some(outcome.id)
            }
        } else {
            None
        };
        profile_inputs.push(imported_profile_input(
            candidate,
            profile_name,
            credential_id,
        ));
    }

    let imported = match committer.create_profiles(profile_inputs) {
        Ok(imported) => imported,
        Err(error) => {
            rollback_credentials(committer, &created_credential_ids);
            return Err(SshConfigImportCommitError::Operation(error));
        }
    };
    Ok(SshConfigImportOutcome {
        imported,
        imported_private_keys: created_credential_ids.len(),
        reused_private_keys: reused_credential_ids.len(),
    })
}

fn select_import_candidates<E>(
    items: Vec<SshConfigImportItem>,
    candidates: &HashMap<String, SshConfigCandidate>,
    existing: &[ConnectionProfile],
) -> Result<Vec<SelectedCandidate>, SshConfigImportCommitError<E>> {
    if items.is_empty() {
        return Err(SshConfigImportCommitError::InvalidSelection);
    }
    let mut aliases = HashSet::new();
    let mut used_names = existing
        .iter()
        .map(|profile| profile.name().to_lowercase())
        .collect::<HashSet<_>>();
    let mut selected = Vec::with_capacity(items.len());
    for item in items {
        if !aliases.insert(item.alias.clone()) {
            return Err(SshConfigImportCommitError::InvalidSelection);
        }
        let candidate = candidates
            .get(&item.alias)
            .cloned()
            .ok_or(SshConfigImportCommitError::InvalidSelection)?;
        if candidate.host.is_empty()
            || candidate.username.is_empty()
            || candidate_already_imported(existing, &candidate)
        {
            return Err(SshConfigImportCommitError::InvalidSelection);
        }
        if let Some(identity_index) = item.identity_file_index
            && !candidate.identity_files.iter().any(|identity| {
                identity.index == identity_index as usize
                    && identity.status == ImportIdentityStatus::Available
            })
        {
            return Err(SshConfigImportCommitError::InvalidSelection);
        }
        selected.push(SelectedCandidate {
            profile_name: allocate_import_name(&candidate.alias, &mut used_names),
            candidate,
            identity_file_index: item.identity_file_index,
            passphrase: item.passphrase,
        });
    }
    Ok(selected)
}

fn rollback_credentials<C: SshConfigImportCommitter>(committer: &mut C, credential_ids: &[String]) {
    for credential_id in credential_ids {
        committer.rollback_credential(credential_id);
    }
}

pub fn imported_profile_input(
    candidate: SshConfigCandidate,
    profile_name: String,
    credential_id: Option<String>,
) -> ProfileInput {
    ProfileInput {
        name: profile_name,
        host: candidate.host,
        port: u32::from(candidate.port),
        username: candidate.username,
        auth_preference: if credential_id.is_some() {
            AuthPreference::PrivateKey
        } else {
            AuthPreference::Manual
        },
        credential_id,
        group_id: None,
        jump_profile_ids: Vec::new(),
    }
}

pub fn candidate_already_imported(
    existing: &[ConnectionProfile],
    candidate: &SshConfigCandidate,
) -> bool {
    existing.iter().any(|profile| {
        profile.name().eq_ignore_ascii_case(candidate.alias.trim())
            && profile.host().eq_ignore_ascii_case(&candidate.host)
            && profile.port() == candidate.port
            && profile.username() == candidate.username
    })
}

pub fn allocate_import_name(base: &str, used_names: &mut HashSet<String>) -> String {
    const MAX_PROFILE_NAME_CHARS: usize = 80;
    let base = base
        .trim()
        .chars()
        .take(MAX_PROFILE_NAME_CHARS)
        .collect::<String>();
    if used_names.insert(base.to_lowercase()) {
        return base;
    }
    for sequence in 1_u64.. {
        let suffix = format!(" {sequence}");
        let prefix_length = MAX_PROFILE_NAME_CHARS.saturating_sub(suffix.chars().count());
        let candidate = format!(
            "{}{}",
            base.chars().take(prefix_length).collect::<String>(),
            suffix
        );
        if used_names.insert(candidate.to_lowercase()) {
            return candidate;
        }
    }
    unreachable!("the numeric import-name suffix space is unbounded")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::profile::ProfileId;

    #[derive(Default)]
    struct FakeCommitter {
        next_credential: usize,
        fail_profiles: bool,
        rolled_back: Vec<String>,
    }

    impl SshConfigImportCommitter for FakeCommitter {
        type Error = &'static str;

        fn import_or_reuse_private_key(
            &mut self,
            _name: String,
            _path: &std::path::Path,
            _passphrase: Option<String>,
        ) -> Result<ImportedCredential, Self::Error> {
            self.next_credential += 1;
            Ok(ImportedCredential {
                id: format!("credential-{}", self.next_credential),
                created: true,
            })
        }

        fn create_profiles(&mut self, inputs: Vec<ProfileInput>) -> Result<usize, Self::Error> {
            if self.fail_profiles {
                Err("profile batch failed")
            } else {
                Ok(inputs.len())
            }
        }

        fn rollback_credential(&mut self, credential_id: &str) {
            self.rolled_back.push(credential_id.to_owned());
        }
    }

    fn candidate(alias: &str, path: &str) -> SshConfigCandidate {
        SshConfigCandidate {
            alias: alias.into(),
            host: format!("{alias}.example.com"),
            port: 22,
            username: "deploy".into(),
            identity_files: vec![ImportIdentity {
                index: 0,
                path: PathBuf::from(path),
                reuse_key: PathBuf::from(path),
                file_name: "id_ed25519".into(),
                status: ImportIdentityStatus::Available,
            }],
            warnings: Vec::new(),
        }
    }

    #[test]
    fn profile_batch_failure_rolls_back_all_credentials_created_by_the_import() {
        let candidates = HashMap::from([
            ("one".into(), candidate("one", "/keys/one")),
            ("two".into(), candidate("two", "/keys/two")),
        ]);
        let items = vec![
            SshConfigImportItem {
                alias: "one".into(),
                identity_file_index: Some(0),
                passphrase: None,
            },
            SshConfigImportItem {
                alias: "two".into(),
                identity_file_index: Some(0),
                passphrase: None,
            },
        ];
        let mut committer = FakeCommitter {
            fail_profiles: true,
            ..FakeCommitter::default()
        };
        let result = commit_ssh_config_import(&[], &candidates, items, &mut committer);
        assert!(matches!(
            result,
            Err(SshConfigImportCommitError::Operation(
                "profile batch failed"
            ))
        ));
        assert_eq!(committer.rolled_back, ["credential-1", "credential-2"]);
    }

    #[test]
    fn same_identity_path_is_imported_once_and_shared_by_profiles() {
        let candidates = HashMap::from([
            ("one".into(), candidate("one", "/keys/shared")),
            ("two".into(), candidate("two", "/keys/shared")),
        ]);
        let items = vec![
            SshConfigImportItem {
                alias: "one".into(),
                identity_file_index: Some(0),
                passphrase: None,
            },
            SshConfigImportItem {
                alias: "two".into(),
                identity_file_index: Some(0),
                passphrase: None,
            },
        ];
        let mut committer = FakeCommitter::default();
        let outcome =
            commit_ssh_config_import(&[], &candidates, items, &mut committer).expect("commit");
        assert_eq!(
            outcome,
            SshConfigImportOutcome {
                imported: 2,
                imported_private_keys: 1,
                reused_private_keys: 0
            }
        );
        assert_eq!(committer.next_credential, 1);
    }

    #[test]
    fn preview_ids_replace_previous_state_and_expire_on_completion() {
        let session = SshConfigImportSession::default();
        let first = session.remember(PathBuf::from("first"), PathBuf::from("home"));
        let second = session.remember(PathBuf::from("second"), PathBuf::from("home"));
        assert!(session.source(&first).is_none());
        assert_eq!(
            session.source(&second).expect("latest").0,
            PathBuf::from("second")
        );
        session.complete(&second);
        assert!(session.source(&second).is_none());
    }

    #[test]
    fn imported_names_are_case_insensitive_unique_and_bounded() {
        let mut used = HashSet::from(["prod".into()]);
        assert_eq!(allocate_import_name("PROD", &mut used), "PROD 1");
        assert!(
            allocate_import_name(&"a".repeat(100), &mut used)
                .chars()
                .count()
                <= 80
        );
    }

    #[test]
    fn existing_profile_identity_is_detected_without_infrastructure_types() {
        let profile = ConnectionProfile::new(
            ProfileId::parse("profile-1").unwrap(),
            "prod",
            "prod.example.com",
            22,
            "deploy",
            AuthPreference::Manual,
            None,
        )
        .unwrap();
        assert!(candidate_already_imported(
            &[profile],
            &candidate("PROD", "/key")
        ));
    }
}
