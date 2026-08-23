use std::{collections::HashSet, path::PathBuf, sync::Mutex};

use crate::{
    application::profile_service::ProfileInput,
    domain::profile::{AuthPreference, ConnectionProfile},
    infrastructure::ssh::config_import::SshConfigCandidate,
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
        let prefix = base.chars().take(prefix_length).collect::<String>();
        let candidate = format!("{prefix}{suffix}");
        if used_names.insert(candidate.to_lowercase()) {
            return candidate;
        }
    }
    unreachable!("the numeric import-name suffix space is unbounded")
}

#[cfg(test)]
mod tests {
    use super::{SshConfigImportSession, allocate_import_name};
    use std::{collections::HashSet, path::PathBuf};

    #[test]
    fn preview_ids_are_opaque_replace_previous_state_and_expire_on_completion() {
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
}
