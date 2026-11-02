use super::*;
use crate::tests::{call, fixture};
use axum::http::StatusCode;
use qterm_core::domain::auth::SecretText;
use serde_json::{Value, json};

fn initialize(state: &ServerState) {
    let recovery = state.vault.prepare_initial_recovery().unwrap();
    state
        .vault
        .initialize(
            SecretText::new("lifecycle-master-password".into()),
            recovery,
            state.settings.security(),
        )
        .unwrap();
}

fn proof(token: &str) -> Proof {
    Proof {
        access_key: token.into(),
        client_id: "test-client".into(),
    }
}

fn granted(state: &ServerState, admission: Admission, client: &str) -> (String, String, Proof) {
    let Admission::Granted { cookie, key } = admission else {
        panic!("expected admission")
    };
    let proof = Proof {
        access_key: key,
        client_id: client.into(),
    };
    let owner = state.auth.access.authorize(&cookie, &proof).unwrap();
    (owner, cookie, proof)
}

async fn unlock(state: &ServerState, owner: &str) {
    let _gate = state.vault_gate.lock().await;
    crate::vault::unlock_for_owner(state, owner, "lifecycle-master-password".into())
        .await
        .unwrap();
    state.auth.access.set_terminal_locked(owner, false).unwrap();
}

#[tokio::test]
async fn fresh_login_and_relogin_publish_a_locked_owner_before_data_access() {
    let (_dir, state, old) = fixture();
    initialize(&state);
    logout(&state, &old).await.unwrap();
    for client in ["initial-page", "relogin-page"] {
        let (owner, _, proof) = granted(&state, login(&state, client).await.unwrap(), client);
        assert!(state.auth.access.terminal_locked(&owner).unwrap());
        assert!(!state.vault.status().unwrap().unlocked);
        assert!(crate::data_access::Permit::new(&state, &owner).is_err());
        attach(&state, &owner, &proof).await.unwrap();
        unlock(&state, &owner).await;
        assert!(crate::data_access::Permit::new(&state, &owner).is_ok());
        logout(&state, &owner).await.unwrap();
        assert!(!state.vault.status().unwrap().unlocked);
        assert!(!state.auth.valid(&owner));
    }
}

#[tokio::test]
async fn resume_and_presence_reconnect_require_new_verification() {
    let (_dir, state, owner) = fixture();
    initialize(&state);
    let proof = proof(&owner);
    let first = attach(&state, &owner, &proof).await.unwrap();
    unlock(&state, &owner).await;
    let old_reader = crate::data_access::Permit::new(&state, &owner).unwrap();
    resume(&state, &owner, &proof).await.unwrap();
    assert!(state.auth.access.terminal_locked(&owner).unwrap());
    assert!(old_reader.check().is_err());
    unlock(&state, &owner).await;
    let second = attach(&state, &owner, &proof).await.unwrap();
    assert!(state.auth.access.terminal_locked(&owner).unwrap());
    assert!(!state.auth.access.owns_transport(&owner, &first));
    unlock(&state, &owner).await;
    let reader = crate::data_access::Permit::new(&state, &owner).unwrap();
    // A delayed close from the previous transport must not lock the new connection.
    detach(&state, &owner, &first).await;
    assert!(reader.check().is_ok());
    assert!(state.vault.status().unwrap().unlocked);
    detach(&state, &owner, &second).await;
    assert!(reader.check().is_err());
    assert!(state.auth.access.terminal_locked(&owner).unwrap());
    assert!(!state.vault.status().unwrap().unlocked);
    let changes = state.auth.access.subscribe();
    let vault_changes = state.vault.subscribe();
    detach(&state, &owner, &second).await;
    assert!(!changes.has_changed().unwrap());
    assert!(!vault_changes.has_changed().unwrap());
}

#[tokio::test]
async fn rejected_admissions_and_stale_callbacks_do_not_lock_the_active_owner() {
    let (_dir, state, old) = fixture();
    initialize(&state);
    let transport = attach(&state, &old, &proof(&old)).await.unwrap();
    unlock(&state, &old).await;
    let Admission::Occupied { ticket } = login(&state, "next-page").await.unwrap() else {
        panic!("occupied")
    };
    let other_proof = Proof {
        client_id: "next-page".into(),
        ..proof(&old)
    };
    assert!(matches!(
        resume(&state, &old, &other_proof).await.unwrap(),
        Admission::Occupied { .. }
    ));
    // Resume replaced the pending ticket for this client, so obtain a fresh one.
    let Admission::Occupied {
        ticket: current_ticket,
    } = login(&state, "next-page").await.unwrap()
    else {
        panic!("occupied")
    };
    assert!(takeover(&state, &ticket, "next-page").await.is_err());
    assert!(attach(&state, &old, &other_proof).await.is_err());
    assert!(!state.auth.access.terminal_locked(&old).unwrap());
    assert!(state.vault.status().unwrap().unlocked);
    let (owner, _, proof) = granted(
        &state,
        takeover(&state, &current_ticket, "next-page")
            .await
            .unwrap(),
        "next-page",
    );
    assert!(state.auth.access.terminal_locked(&owner).unwrap());
    attach(&state, &owner, &proof).await.unwrap();
    unlock(&state, &owner).await;
    let reader = crate::data_access::Permit::new(&state, &owner).unwrap();
    detach(&state, &old, &transport).await;
    assert!(logout(&state, &old).await.is_err());
    assert!(lock(&state, &old).await.is_err());
    assert!(reader.check().is_ok());
    assert!(state.vault.status().unwrap().unlocked);
}

#[tokio::test]
async fn uninitialized_vault_keeps_admission_and_reconnect_unlocked() {
    let (_dir, state, old) = fixture();
    logout(&state, &old).await.unwrap();
    let (owner, cookie, proof) = granted(&state, login(&state, "page").await.unwrap(), "page");
    let transport = attach(&state, &owner, &proof).await.unwrap();
    detach(&state, &owner, &transport).await;
    resume(&state, &cookie, &proof).await.unwrap();
    assert!(!state.auth.access.terminal_locked(&owner).unwrap());
    let Admission::Occupied { ticket } = login(&state, "next-page").await.unwrap() else {
        panic!("occupied")
    };
    let (owner, _, _) = granted(
        &state,
        takeover(&state, &ticket, "next-page").await.unwrap(),
        "next-page",
    );
    assert!(!state.auth.access.terminal_locked(&owner).unwrap());
}

#[tokio::test]
async fn repeated_lock_does_not_repeat_notifications_or_audit_events() {
    let (_dir, state, owner) = fixture();
    initialize(&state);
    for attempt in 0..2 {
        let changes = state.auth.access.subscribe();
        let vault_changes = state.vault.subscribe();
        assert_eq!(
            call(
                state.clone(),
                &owner,
                "POST",
                "/api/v1/terminal-lock/lock",
                Value::Null
            )
            .await,
            (StatusCode::OK, json!({"locked":true}))
        );
        assert_eq!(changes.has_changed().unwrap(), attempt == 0);
        assert_eq!(vault_changes.has_changed().unwrap(), attempt == 0);
    }
    unlock(&state, &owner).await;
    let (status, page) = call(
        state.clone(),
        &owner,
        "GET",
        "/api/v1/access-log",
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let entries = page["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["kind"], "workbenchLock");
}
