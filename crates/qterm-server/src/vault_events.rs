//! Web vault lifecycle notifications. Never advances Access's revocation generation.
use qterm_core::{
    application::credential_lifecycle::{CredentialLifecycle, LockReason, LockSchedule},
    domain::{
        auth::SecretText,
        credential::{CredentialError, RecoveryKeyFile},
        settings::SecuritySettings,
    },
    infrastructure::persistence::json_credential_vault::JsonCredentialVault,
};
use serde::Serialize;
use std::{ops::Deref, sync::Mutex};
use tokio::sync::watch;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Status {
    pub revision: u64,
    pub initialized: bool,
    pub unlocked: bool,
    pub legacy: bool,
    pub reason: &'static str,
}

pub struct ObservedVault {
    access_log: std::sync::Arc<crate::access_log::AccessLog>,
    lifecycle: CredentialLifecycle<JsonCredentialVault>,
    changes: watch::Sender<Option<Status>>,
    mutation: Mutex<()>,
}
impl Deref for ObservedVault {
    type Target = CredentialLifecycle<JsonCredentialVault>;
    fn deref(&self) -> &Self::Target {
        &self.lifecycle
    }
}
impl ObservedVault {
    pub fn new(
        vault: JsonCredentialVault,
        access_log: std::sync::Arc<crate::access_log::AccessLog>,
    ) -> Self {
        let value = Self {
            access_log,
            lifecycle: CredentialLifecycle::new(vault),
            changes: watch::channel(None).0,
            mutation: Mutex::new(()),
        };
        value.publish(LockReason::Manual);
        value
    }
    pub fn subscribe(&self) -> watch::Receiver<Option<Status>> {
        self.changes.subscribe()
    }
    fn publish(&self, reason: LockReason) {
        let Ok(status) = self.lifecycle.status() else {
            return;
        };
        self.changes.send_if_modified(|previous| {
            if previous.as_ref().is_some_and(|p| {
                (p.initialized, p.unlocked, p.legacy)
                    == (status.initialized, status.unlocked, status.legacy)
            }) {
                return false;
            }
            *previous = Some(Status {
                revision: previous.as_ref().map_or(1, |p| p.revision + 1),
                initialized: status.initialized,
                unlocked: status.unlocked,
                legacy: status.legacy,
                reason: reason.as_str(),
            });
            true
        });
    }
    fn change<T>(
        &self,
        reason: LockReason,
        operation: impl FnOnce(&CredentialLifecycle<JsonCredentialVault>) -> T,
    ) -> T {
        let _guard = self.mutation.lock().unwrap();
        let result = operation(&self.lifecycle);
        self.publish(reason);
        result
    }
    pub fn initialize(
        &self,
        password: SecretText,
        recovery: RecoveryKeyFile,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.change(LockReason::Manual, |v| {
            v.initialize(password, recovery, settings)
        })
    }
    pub fn unlock(
        &self,
        password: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.change(LockReason::Manual, |v| v.unlock(password, settings))
    }
    pub fn change_master_password(
        &self,
        old: SecretText,
        new: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.change(LockReason::Manual, |v| {
            v.change_master_password(old, new, settings)
        })
    }
    pub fn reset_master_password(
        &self,
        current: RecoveryKeyFile,
        next: RecoveryKeyFile,
        password: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.change(LockReason::Manual, |v| {
            v.reset_master_password(current, next, password, settings)
        })
    }
    pub fn lock(&self, reason: LockReason) -> bool {
        self.change(reason, |v| v.lock(reason))
    }
    pub fn lock_if_generation(&self, generation: u64) -> bool {
        let locked = self.change(LockReason::Timeout, |v| v.lock_if_generation(generation));
        if locked {
            self.access_log.record(
                crate::access_log::Kind::VaultLock,
                true,
                "timeout",
                Default::default(),
            );
        }
        locked
    }
    pub fn clear(&self) -> Result<(), CredentialError> {
        self.change(LockReason::Manual, |v| v.clear())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publishes_real_transitions_and_timeout_reason_without_revoking_access() {
        let (_dir, state, owner) = crate::tests::fixture();
        let permit = crate::data_access::Permit::new(&state, &owner).unwrap();
        let mut events = state.vault.subscribe();
        let baseline = events.borrow_and_update().clone().unwrap();
        assert!(!baseline.initialized);
        assert!(!state.vault.lock(LockReason::Manual));
        assert!(!events.has_changed().unwrap());
        let settings = SecuritySettings::new(Some(3600), Some(900)).unwrap();
        let recovery = state.vault.prepare_initial_recovery().unwrap();
        let schedule = state
            .vault
            .initialize(
                SecretText::new("fixture-password".into()),
                recovery,
                settings,
            )
            .unwrap()
            .unwrap();
        let unlocked = events.borrow_and_update().clone().unwrap();
        assert!(unlocked.initialized && unlocked.unlocked);
        assert_eq!(unlocked.revision, baseline.revision + 1);
        assert!(
            state
                .vault
                .unlock(SecretText::new("wrong-password".into()), settings)
                .is_err()
        );
        assert!(!events.has_changed().unwrap());
        assert!(!state.vault.lock_if_generation(schedule.generation + 1));
        assert!(!events.has_changed().unwrap());
        assert!(state.vault.lock_if_generation(schedule.generation));
        let locked = events.borrow_and_update().clone().unwrap();
        assert!(!locked.unlocked);
        assert_eq!(locked.reason, "timeout");
        assert_eq!(locked.revision, unlocked.revision + 1);
        assert!(permit.check().is_ok());
        state.vault.clear().unwrap();
        assert!(!events.borrow().as_ref().unwrap().initialized);
    }
}
