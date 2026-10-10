use super::*;
use qterm_sync_core::{AuthPreference, Profile};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};

#[derive(Clone, Default)]
struct Local(Arc<Mutex<Catalog>>, Arc<AtomicBool>);
impl SyncLocalStore for Local {
    fn catalog(&self) -> SyncResult<Catalog> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn apply(&self, expected: &Catalog, desired: &Catalog) -> SyncResult<()> {
        if self.1.swap(false, Ordering::SeqCst) {
            return Err("simulated crash".into());
        }
        let mut data = self.0.lock().unwrap();
        if *data != *expected {
            return Err("race".into());
        }
        *data = desired.clone();
        Ok(())
    }
}
#[derive(Default)]
struct Device {
    settings: Mutex<SyncSettings>,
    checkpoint: Mutex<SyncCheckpoint>,
}
impl SyncDeviceStore for Device {
    fn settings(&self) -> SyncResult<SyncSettings> {
        Ok(self.settings.lock().unwrap().clone())
    }
    fn save_settings(&self, settings: &SyncSettings, _: Option<&str>) -> SyncResult<()> {
        *self.settings.lock().unwrap() = settings.clone();
        Ok(())
    }
    fn checkpoint(&self) -> SyncResult<SyncCheckpoint> {
        Ok(self.checkpoint.lock().unwrap().clone())
    }
    fn save_checkpoint(&self, c: &SyncCheckpoint) -> SyncResult<()> {
        *self.checkpoint.lock().unwrap() = c.clone();
        Ok(())
    }
    fn token(&self, _: &SyncSettings) -> SyncResult<zeroize::Zeroizing<String>> {
        Ok(zeroize::Zeroizing::new("test-token".into()))
    }
}
#[derive(Clone)]
struct Remote(Arc<Mutex<Snapshot>>, Arc<AtomicUsize>);
impl SyncRemote for Remote {
    fn validate_settings(&self, _: &mut SyncSettings) -> SyncResult<()> {
        Ok(())
    }
    async fn fetch(&self, _: &SyncSettings, _: &str) -> SyncResult<Snapshot> {
        self.1.fetch_add(1, Ordering::SeqCst);
        Ok(self.0.lock().unwrap().clone())
    }
    async fn push(&self, _: &SyncSettings, _: &str, request: Push) -> SyncResult<Snapshot> {
        let mut remote = self.0.lock().unwrap();
        if remote.revision != request.base_revision {
            return Err("race".into());
        }
        remote.revision += 1;
        remote.catalog = request.catalog;
        Ok(remote.clone())
    }
}
fn remote() -> Remote {
    Remote(
        Arc::new(Mutex::new(Snapshot {
            protocol: PROTOCOL,
            server_id: "server".into(),
            revision: 0,
            catalog: Catalog::default(),
        })),
        Arc::new(AtomicUsize::new(0)),
    )
}
fn service(remote: Remote) -> SyncService<Local, Device, Remote> {
    let service = SyncService::new(Local::default(), Device::default(), remote);
    *service.device.settings.lock().unwrap() = SyncSettings {
        enabled: true,
        server_url: "https://sync.test".into(),
        ..Default::default()
    };
    service
}
fn profile() -> Profile {
    Profile {
        name: "A".into(),
        host: "example.com".into(),
        port: 22,
        username: "root".into(),
        auth_preference: AuthPreference::Password,
        group_id: None,
        jump_profile_ids: vec![],
    }
}

#[tokio::test]
async fn two_devices_converge_and_offline_delete_is_not_resurrected() {
    let remote = remote();
    let mut a = service(remote.clone());
    let mut b = service(remote);
    a.local
        .0
        .lock()
        .unwrap()
        .profiles
        .insert("a".into(), profile());
    a.run(None).await.unwrap();
    b.run(None).await.unwrap();
    assert_eq!(a.local.catalog().unwrap(), b.local.catalog().unwrap());
    a.local.0.lock().unwrap().profiles.clear();
    a.run(None).await.unwrap();
    b.run(None).await.unwrap();
    assert!(b.local.catalog().unwrap().profiles.is_empty());
}
#[tokio::test]
async fn disabled_never_contacts_server() {
    let remote = remote();
    let mut a = service(remote.clone());
    a.device.settings.lock().unwrap().enabled = false;
    assert!(!a.run(None).await.unwrap());
    assert_eq!(remote.1.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn conflict_is_guarded_and_explicitly_resolved() {
    let remote = remote();
    let mut a = service(remote.clone());
    let mut b = service(remote);
    a.local
        .0
        .lock()
        .unwrap()
        .profiles
        .insert("a".into(), profile());
    a.run(None).await.unwrap();
    b.run(None).await.unwrap();
    a.local
        .0
        .lock()
        .unwrap()
        .profiles
        .get_mut("a")
        .unwrap()
        .port = 23;
    b.local
        .0
        .lock()
        .unwrap()
        .profiles
        .get_mut("a")
        .unwrap()
        .port = 24;
    a.run(None).await.unwrap();
    assert!(b.run(None).await.is_err());
    assert!(
        b.run(Some(("stale".into(), Resolution::Remote)))
            .await
            .is_err()
    );
    let nonce = b.status.conflict_token.clone().unwrap();
    b.run(Some((nonce, Resolution::Remote))).await.unwrap();
    assert_eq!(b.local.catalog().unwrap().profiles["a"].port, 23);
}
#[tokio::test]
async fn durable_pending_commit_recovers_after_local_write_failure() {
    let remote = remote();
    let mut a = service(remote.clone());
    let mut b = service(remote);
    a.local
        .0
        .lock()
        .unwrap()
        .profiles
        .insert("a".into(), profile());
    a.run(None).await.unwrap();
    b.local.1.store(true, Ordering::SeqCst);
    assert!(b.run(None).await.is_err());
    assert!(b.device.checkpoint().unwrap().pending.is_some());
    let mut restarted = SyncService::new(b.local, b.device, b.remote);
    restarted.run(None).await.unwrap();
    assert_eq!(
        a.local.catalog().unwrap(),
        restarted.local.catalog().unwrap()
    );
    assert!(restarted.device.checkpoint().unwrap().pending.is_none());
}
#[tokio::test]
async fn server_replacement_never_reimports_or_erases_data() {
    let remote = remote();
    let mut a = service(remote.clone());
    a.local
        .0
        .lock()
        .unwrap()
        .profiles
        .insert("a".into(), profile());
    a.run(None).await.unwrap();
    remote.0.lock().unwrap().server_id = "other".into();
    assert!(a.run(None).await.is_err());
    assert_eq!(a.local.catalog().unwrap().profiles.len(), 1);
}
