use std::sync::Mutex;

use zeroize::Zeroizing;

use crate::domain::credential::RecoveryKeyFile;

pub struct PendingRecoveryReset {
    pub current: RecoveryKeyFile,
    pub replacement: RecoveryKeyFile,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PendingPrivateKeySource {
    File,
    Generated,
}

struct PendingPrivateKey {
    id: String,
    source: PendingPrivateKeySource,
    label: String,
    detail: String,
    bytes: Zeroizing<Vec<u8>>,
}

pub struct PendingPrivateKeySummary {
    pub id: String,
    pub source: PendingPrivateKeySource,
    pub label: String,
    pub detail: String,
}

#[derive(Default)]
pub struct CredentialWorkflowState {
    recovery_reset: Mutex<Option<PendingRecoveryReset>>,
    private_key: Mutex<Option<PendingPrivateKey>>,
}

impl CredentialWorkflowState {
    pub fn remember_recovery_reset(&self, pending: PendingRecoveryReset) {
        *self
            .recovery_reset
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pending);
    }

    pub fn take_recovery_reset(&self) -> Option<PendingRecoveryReset> {
        self.recovery_reset
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }

    pub fn clear_recovery_reset(&self) {
        let _ = self.take_recovery_reset();
    }

    pub fn remember_private_key(
        &self,
        source: PendingPrivateKeySource,
        label: String,
        detail: String,
        bytes: Zeroizing<Vec<u8>>,
    ) -> PendingPrivateKeySummary {
        let pending = PendingPrivateKey {
            id: uuid::Uuid::new_v4().to_string(),
            source,
            label,
            detail,
            bytes,
        };
        let summary = PendingPrivateKeySummary {
            id: pending.id.clone(),
            source,
            label: pending.label.clone(),
            detail: pending.detail.clone(),
        };
        *self
            .private_key
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pending);
        summary
    }

    pub fn private_key(
        &self,
        draft_id: &str,
    ) -> Option<(PendingPrivateKeySource, Zeroizing<Vec<u8>>)> {
        self.private_key
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            .filter(|draft| draft.id == draft_id)
            .map(|draft| (draft.source, draft.bytes.clone()))
    }

    pub fn complete_private_key(&self, draft_id: &str) {
        let mut pending = self
            .private_key
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if pending.as_ref().is_some_and(|draft| draft.id == draft_id) {
            pending.take();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CredentialWorkflowState, PendingPrivateKeySource, PendingRecoveryReset};
    use crate::domain::credential::RecoveryKeyFile;
    use zeroize::Zeroizing;

    #[test]
    fn pending_material_is_opaque_consumed_and_replaced() {
        let state = CredentialWorkflowState::default();
        state.remember_recovery_reset(PendingRecoveryReset {
            current: RecoveryKeyFile::new(vec![1]),
            replacement: RecoveryKeyFile::new(vec![2]),
        });
        assert_eq!(
            state
                .take_recovery_reset()
                .expect("pending")
                .current
                .expose(),
            &[1]
        );
        assert!(state.take_recovery_reset().is_none());

        let first = state.remember_private_key(
            PendingPrivateKeySource::File,
            "first".into(),
            "file".into(),
            Zeroizing::new(vec![3]),
        );
        let second = state.remember_private_key(
            PendingPrivateKeySource::Generated,
            "second".into(),
            "generated".into(),
            Zeroizing::new(vec![4]),
        );
        assert!(state.private_key(&first.id).is_none());
        assert_eq!(
            state.private_key(&second.id).expect("latest").1.as_slice(),
            &[4]
        );
        state.complete_private_key(&second.id);
        assert!(state.private_key(&second.id).is_none());
    }
}
