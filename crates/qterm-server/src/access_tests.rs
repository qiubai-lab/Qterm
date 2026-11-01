use super::*;

fn granted(value: Admission) -> (String, String) {
    match value {
        Admission::Granted { cookie, key } => (cookie, key),
        _ => panic!("expected admission"),
    }
}
fn ticket(value: Admission) -> String {
    match value {
        Admission::Occupied { ticket } => ticket,
        _ => panic!("expected occupancy"),
    }
}
fn proof(key: &str, client: &str) -> Proof {
    Proof {
        access_key: key.into(),
        client_id: client.into(),
    }
}

#[test]
fn login_check_does_not_evict_the_current_page() {
    let access = Access::default();
    let (cookie, key) = granted(access.login("first").unwrap());
    let owner = access.authorize(&cookie, &proof(&key, "first")).unwrap();
    let _pending = ticket(access.login("second").unwrap());
    assert!(access.valid(&owner));
    assert!(access.authorize(&cookie, &proof(&key, "second")).is_err());
}
#[test]
fn confirmed_takeover_revokes_old_http_and_socket_identity_even_with_shared_cookie() {
    let access = Access::default();
    let (cookie, key) = granted(access.login("first").unwrap());
    let old = access.authorize(&cookie, &proof(&key, "first")).unwrap();
    let pending = ticket(access.login("second").unwrap());
    let (new_cookie, new_key) = granted(access.takeover(&pending, "second").unwrap());
    assert!(!access.valid(&old));
    assert!(access.authorize(&cookie, &proof(&key, "first")).is_err());
    assert!(
        access
            .authorize(&new_cookie, &proof(&key, "first"))
            .is_err()
    );
    assert!(
        access
            .authorize(&new_cookie, &proof(&new_key, "second"))
            .is_ok()
    );
    assert!(access.takeover(&pending, "second").is_err());
}
#[test]
fn copied_tabs_need_confirmation_but_refresh_after_detach_preserves_login() {
    let access = Access::default();
    let (cookie, key) = granted(access.login("document-one").unwrap());
    let old = access
        .authorize(&cookie, &proof(&key, "document-one"))
        .unwrap();
    let transport = access.attach(&old).unwrap();
    let _pending = ticket(
        access
            .resume(&cookie, &proof(&key, "document-two"))
            .unwrap(),
    );
    assert!(access.valid(&old));
    access.detach(&old, &transport);
    // Fresh password logins still need confirmation during the refresh grace.
    assert!(matches!(
        access.login("third").unwrap(),
        Admission::Occupied { .. }
    ));
    let (resumed_cookie, resumed_key) = granted(
        access
            .resume(&cookie, &proof(&key, "document-two"))
            .unwrap(),
    );
    assert_eq!(resumed_cookie, cookie);
    assert_eq!(resumed_key, key);
    assert!(!access.valid(&old));
    let current = access
        .authorize(&cookie, &proof(&key, "document-two"))
        .unwrap();
    access.detach(&old, &transport); // A late close must not release the replacement.
    assert!(matches!(
        access.login("third").unwrap(),
        Admission::Occupied { .. }
    ));
    assert!(access.valid(&current));
}
#[test]
fn concurrent_confirmation_has_one_winner_and_late_requests_cannot_steal_it() {
    let access = std::sync::Arc::new(Access::default());
    granted(access.login("first").unwrap());
    let tickets = [
        ("second", ticket(access.login("second").unwrap())),
        ("third", ticket(access.login("third").unwrap())),
    ];
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let tasks = tickets
        .into_iter()
        .map(|(client, ticket)| {
            let access = access.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                access.takeover(&ticket, client).is_ok()
            })
        })
        .collect::<Vec<_>>();
    assert_eq!(
        tasks
            .into_iter()
            .filter_map(|task| task.join().ok())
            .filter(|ok| *ok)
            .count(),
        1
    );
}
#[test]
fn expired_confirmation_does_not_affect_current_owner() {
    let access = Access::default();
    let (cookie, key) = granted(access.login("first").unwrap());
    let pending = ticket(access.login("second").unwrap());
    access
        .inner
        .lock()
        .unwrap()
        .pending
        .get_mut(&pending)
        .unwrap()
        .expires = Instant::now() - Duration::from_secs(1);
    assert!(access.takeover(&pending, "second").is_err());
    assert!(access.authorize(&cookie, &proof(&key, "first")).is_ok());
}
#[test]
fn vanished_page_releases_occupancy_after_heartbeat_timeout() {
    let access = Access::default();
    granted(access.login("first").unwrap());
    access.inner.lock().unwrap().login.as_mut().unwrap().seen = Instant::now() - PRESENCE_TTL;
    assert!(matches!(
        access.login("second").unwrap(),
        Admission::Granted { .. }
    ));
}
#[test]
fn cancelling_or_waiting_does_not_lock_out_the_owner_and_pending_memory_is_bounded() {
    let access = Access::default();
    let (cookie, key) = granted(access.login("first").unwrap());
    for _ in 0..100 {
        ticket(access.login("same-retrying-page").unwrap());
    }
    assert_eq!(access.inner.lock().unwrap().pending.len(), 1);
    for n in 0..31 {
        ticket(access.login(&format!("page-{n}")).unwrap());
    }
    assert!(access.login("overflow").is_err());
    assert!(access.authorize(&cookie, &proof(&key, "first")).is_ok());
}

#[tokio::test]
async fn upgrade_headers_cannot_bypass_http_page_proof() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (_dir, state, cookie) = crate::tests::fixture();
    for (method, path) in [("GET", "/api/v1/workspace"), ("POST", "/api/v1/logout")] {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("Cookie", format!("qterm={cookie}"))
            .header("Origin", "http://localhost:1423")
            .header("Upgrade", "websocket")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            crate::router::router(state.clone())
                .oneshot(request)
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert!(state.auth.valid(&cookie));
}
