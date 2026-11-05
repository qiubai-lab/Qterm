use crate::tests::{call, fixture};
use axum::http::StatusCode;
use qterm_core::{
    domain::session::{HostEndpoint, PresentedHostKey},
    infrastructure::persistence::json_known_host_repository::JsonKnownHostRepository,
    ports::known_host_repository::KnownHostRepository,
};
use serde_json::json;

#[tokio::test]
async fn host_key_removal_requires_current_access_and_unlocked_data() {
    let (_dir, state, token) = fixture();
    let body = json!({"host":"example.com","port":22,"trustedFingerprint":"SHA256:old"});
    let path = "/api/v1/host-keys/forget";
    assert_eq!(
        call(state.clone(), "wrong", "POST", path, body.clone())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    state.auth.access.set_terminal_locked(&token, true).unwrap();
    assert_ne!(
        call(state.clone(), &token, "POST", path, body.clone())
            .await
            .0,
        StatusCode::OK
    );
    state
        .auth
        .access
        .set_terminal_locked(&token, false)
        .unwrap();
    assert_eq!(
        call(state.clone(), &token, "POST", path, body).await.0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn host_key_removal_rejects_stale_fingerprint_and_preserves_other_ports() {
    let (_dir, state, token) = fixture();
    let repository =
        JsonKnownHostRepository::new(state.config.data.join("device/known-hosts.json"));
    let endpoint = HostEndpoint::new("example.com", 22).unwrap();
    let other = HostEndpoint::new("example.com", 2222).unwrap();
    let key = PresentedHostKey::new(
        "ssh-ed25519".into(),
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ".into(),
        "SHA256:xcTb/ZL8NmQsvo9k2j/c7dIyp7nvDnswfPZHlzcZwz0".into(),
    );
    repository.trust(&endpoint, &key).unwrap();
    repository.trust(&other, &key).unwrap();
    let path = "/api/v1/host-keys/forget";
    assert_ne!(
        call(
            state.clone(),
            &token,
            "POST",
            path,
            json!({"host":"example.com","port":22,"trustedFingerprint":"SHA256:stale"})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(repository.find(&endpoint).unwrap(), Some(key.clone()));
    assert_eq!(
        call(
            state.clone(),
            &token,
            "POST",
            path,
            json!({"host":"example.com","port":22,"trustedFingerprint":key.fingerprint()})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(repository.find(&endpoint).unwrap(), None);
    assert_eq!(repository.find(&other).unwrap(), Some(key));
}

#[tokio::test]
async fn retained_host_key_details_survive_the_following_generic_failure() {
    let (_dir, state, _token) = fixture();
    let session = crate::retained_session::RetainedSession::new(
        state.screen_worker.clone(),
        crate::socket_io::SessionControl::Remote(state.sessions.clone()),
        Some("files-block".into()),
        "files",
        Some("profile".into()),
        80,
        24,
    )
    .unwrap();
    session.ready("files-session".into(), None);
    let event = session.events();
    let changed = json!({"type":"hostKeyChanged","node":{"host":"example.com","port":22},"trustedFingerprint":"SHA256:old","presentedFingerprint":"SHA256:new"});
    event(changed.clone());
    event(json!({"type":"failed","code":"hostKeyChanged","message":"连接已阻断"}));
    event(json!({"type":"stateChanged","state":"failed"}));
    assert_eq!(session.attach().unwrap().1["failure"], changed);
}
