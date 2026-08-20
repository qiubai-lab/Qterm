use std::{
    sync::{Mutex, MutexGuard},
    time::{Duration, Instant},
};

use crate::{
    application::credential_service::CredentialService,
    domain::{
        auth::{SecretBytes, SecretText},
        credential::{
            CredentialError, CredentialMaterial, CredentialSummary, RecoveryKeyFile, VaultStatus,
        },
        settings::SecuritySettings,
    },
    ports::credential_vault::CredentialVault,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LockReason {
    Manual,
    WindowsSession,
    Timeout,
}

impl LockReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::WindowsSession => "windowsSession",
            Self::Timeout => "timeout",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct LockSchedule {
    pub generation: u64,
    pub delay: Duration,
}

#[derive(Default)]
struct Session {
    unlocked_at: Option<Instant>,
    generation: u64,
}

pub struct CredentialLifecycle<V> {
    service: CredentialService<V>,
    session: Mutex<Session>,
}

impl<V: CredentialVault> CredentialLifecycle<V> {
    pub fn new(vault: V) -> Self {
        Self {
            service: CredentialService::new(vault),
            session: Mutex::new(Session::default()),
        }
    }

    fn session(&self) -> MutexGuard<'_, Session> {
        self.session
            .lock()
            .unwrap_or_else(|value| value.into_inner())
    }

    pub fn status(&self) -> Result<VaultStatus, CredentialError> {
        self.service.status()
    }

    pub fn initialize(
        &self,
        password: SecretText,
        recovery_file: RecoveryKeyFile,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.service.initialize(password, recovery_file)?;
        Ok(self.begin_session(settings))
    }

    pub fn prepare_initial_recovery(&self) -> Result<RecoveryKeyFile, CredentialError> {
        self.service.prepare_initial_recovery()
    }

    pub fn unlock(
        &self,
        password: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.service.unlock(password)?;
        Ok(self.begin_session(settings))
    }

    pub fn change_master_password(
        &self,
        old_password: SecretText,
        new_password: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.service
            .change_master_password(old_password, new_password)?;
        Ok(self.begin_session(settings))
    }

    pub fn prepare_recovery_reset(
        &self,
        current_recovery_file: RecoveryKeyFile,
    ) -> Result<RecoveryKeyFile, CredentialError> {
        self.service.prepare_recovery_reset(current_recovery_file)
    }

    pub fn reset_master_password(
        &self,
        current_recovery_file: RecoveryKeyFile,
        replacement_recovery_file: RecoveryKeyFile,
        new_password: SecretText,
        settings: SecuritySettings,
    ) -> Result<Option<LockSchedule>, CredentialError> {
        self.service.reset_master_password(
            current_recovery_file,
            replacement_recovery_file,
            new_password,
        )?;
        Ok(self.begin_session(settings))
    }

    fn begin_session(&self, settings: SecuritySettings) -> Option<LockSchedule> {
        let mut session = self.session();
        session.generation = session.generation.wrapping_add(1);
        session.unlocked_at = Some(Instant::now());
        settings
            .auto_lock_after_seconds
            .map(|seconds| LockSchedule {
                generation: session.generation,
                delay: Duration::from_secs(u64::from(seconds)),
            })
    }

    pub fn reschedule(&self, settings: SecuritySettings) -> Reschedule {
        let mut session = self.session();
        session.generation = session.generation.wrapping_add(1);
        let Some(unlocked_at) = session.unlocked_at else {
            return Reschedule::None;
        };
        let Some(seconds) = settings.auto_lock_after_seconds else {
            return Reschedule::None;
        };
        let ttl = Duration::from_secs(u64::from(seconds));
        let elapsed = unlocked_at.elapsed();
        if elapsed >= ttl {
            return Reschedule::LockNow;
        }
        Reschedule::Schedule(LockSchedule {
            generation: session.generation,
            delay: ttl - elapsed,
        })
    }

    pub fn lock(&self, _reason: LockReason) -> bool {
        let was_unlocked = self.service.status().is_ok_and(|value| value.unlocked);
        self.service.lock();
        let mut session = self.session();
        session.unlocked_at = None;
        session.generation = session.generation.wrapping_add(1);
        was_unlocked
    }

    pub fn lock_if_generation(&self, generation: u64) -> bool {
        if self.session().generation != generation {
            return false;
        }
        self.lock(LockReason::Timeout)
    }

    pub fn clear(&self) -> Result<(), CredentialError> {
        self.service.clear()?;
        let mut session = self.session();
        session.unlocked_at = None;
        session.generation = session.generation.wrapping_add(1);
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<CredentialSummary>, CredentialError> {
        self.service.list()
    }
    pub fn create_password(
        &self,
        name: String,
        password: SecretText,
    ) -> Result<CredentialSummary, CredentialError> {
        self.service.create_password(name, password)
    }
    pub fn import_private_key(
        &self,
        name: String,
        key: SecretBytes,
        passphrase: Option<SecretText>,
        algorithm: String,
    ) -> Result<CredentialSummary, CredentialError> {
        self.service
            .import_private_key(name, key, passphrase, algorithm)
    }
    pub fn load(&self, id: &str) -> Result<CredentialMaterial, CredentialError> {
        self.service.load(id)
    }
    pub fn delete(&self, id: &str) -> Result<(), CredentialError> {
        self.service.delete(id)
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Reschedule {
    None,
    Schedule(LockSchedule),
    LockNow,
}

#[cfg(test)]
mod tests {
    use super::{CredentialLifecycle, LockReason, Reschedule};
    use crate::{
        domain::{
            auth::{SecretBytes, SecretText},
            credential::{
                CredentialError, CredentialId, CredentialMaterial, CredentialSummary,
                RecoveryKeyFile, VaultStatus,
            },
            settings::SecuritySettings,
        },
        ports::credential_vault::CredentialVault,
    };
    use std::{
        sync::Mutex,
        time::{Duration, Instant},
    };

    #[derive(Default)]
    struct FakeVault(Mutex<bool>);
    impl CredentialVault for FakeVault {
        fn status(&self) -> Result<VaultStatus, CredentialError> {
            Ok(VaultStatus {
                initialized: true,
                unlocked: *self.0.lock().expect("lock"),
                legacy: false,
            })
        }
        fn prepare_initial_recovery(&self) -> Result<RecoveryKeyFile, CredentialError> {
            Ok(RecoveryKeyFile::new(vec![1]))
        }
        fn initialize(&self, _: SecretText, _: RecoveryKeyFile) -> Result<(), CredentialError> {
            *self.0.lock().expect("lock") = true;
            Ok(())
        }
        fn unlock(&self, _: SecretText) -> Result<(), CredentialError> {
            *self.0.lock().expect("lock") = true;
            Ok(())
        }
        fn change_master_password(
            &self,
            _: SecretText,
            _: SecretText,
        ) -> Result<(), CredentialError> {
            Ok(())
        }
        fn prepare_recovery_reset(
            &self,
            _: RecoveryKeyFile,
        ) -> Result<RecoveryKeyFile, CredentialError> {
            Ok(RecoveryKeyFile::new(vec![2]))
        }
        fn reset_master_password(
            &self,
            _: RecoveryKeyFile,
            _: RecoveryKeyFile,
            _: SecretText,
        ) -> Result<(), CredentialError> {
            *self.0.lock().expect("lock") = true;
            Ok(())
        }
        fn lock(&self) {
            *self.0.lock().expect("lock") = false;
        }
        fn clear(&self) -> Result<(), CredentialError> {
            *self.0.lock().expect("lock") = false;
            Ok(())
        }
        fn list(&self) -> Result<Vec<CredentialSummary>, CredentialError> {
            Ok(vec![])
        }
        fn save_password(
            &self,
            _: CredentialId,
            _: String,
            _: SecretText,
        ) -> Result<CredentialSummary, CredentialError> {
            Err(CredentialError::InvalidCredential)
        }
        fn save_private_key(
            &self,
            _: CredentialId,
            _: String,
            _: SecretBytes,
            _: Option<SecretText>,
            _: String,
        ) -> Result<CredentialSummary, CredentialError> {
            Err(CredentialError::InvalidCredential)
        }
        fn load(&self, _: &CredentialId) -> Result<CredentialMaterial, CredentialError> {
            Err(CredentialError::CredentialNotFound)
        }
        fn delete(&self, _: &CredentialId) -> Result<(), CredentialError> {
            Ok(())
        }
    }

    #[test]
    fn stale_deadline_cannot_lock_new_unlock_session() {
        let lifecycle = CredentialLifecycle::new(FakeVault::default());
        let settings = SecuritySettings::new(true, Some(3600)).expect("settings");
        let first = lifecycle
            .unlock(SecretText::new("first password".into()), settings)
            .expect("unlock")
            .expect("schedule");
        let second = lifecycle
            .unlock(SecretText::new("second password".into()), settings)
            .expect("unlock")
            .expect("schedule");
        assert!(!lifecycle.lock_if_generation(first.generation));
        assert!(lifecycle.lock_if_generation(second.generation));
        assert!(!lifecycle.lock(LockReason::Manual));
    }

    #[test]
    fn disabling_timeout_cancels_by_advancing_generation() {
        let lifecycle = CredentialLifecycle::new(FakeVault::default());
        let enabled = SecuritySettings::new(true, Some(3600)).expect("settings");
        let schedule = lifecycle
            .unlock(SecretText::new("password".into()), enabled)
            .expect("unlock")
            .expect("schedule");
        assert!(matches!(
            lifecycle.reschedule(SecuritySettings::new(true, None).expect("settings")),
            Reschedule::None
        ));
        assert!(!lifecycle.lock_if_generation(schedule.generation));
    }

    #[test]
    fn shortening_timeout_past_the_original_unlock_time_locks_now() {
        let lifecycle = CredentialLifecycle::new(FakeVault::default());
        let enabled = SecuritySettings::new(true, Some(3600)).expect("settings");
        lifecycle
            .unlock(SecretText::new("password".into()), enabled)
            .expect("unlock");
        lifecycle.session().unlocked_at = Some(Instant::now() - Duration::from_secs(61));
        assert!(matches!(
            lifecycle.reschedule(SecuritySettings::new(true, Some(60)).expect("settings")),
            Reschedule::LockNow
        ));
    }

    #[test]
    fn recovery_reset_starts_a_new_unlock_session() {
        let lifecycle = CredentialLifecycle::new(FakeVault::default());
        let settings = SecuritySettings::new(true, Some(3600)).expect("settings");
        let schedule = lifecycle
            .reset_master_password(
                RecoveryKeyFile::new(vec![1]),
                RecoveryKeyFile::new(vec![2]),
                SecretText::new("new-master-password".into()),
                settings,
            )
            .expect("reset")
            .expect("schedule");
        assert!(lifecycle.status().expect("status").unlocked);
        assert!(lifecycle.lock_if_generation(schedule.generation));
    }
}
