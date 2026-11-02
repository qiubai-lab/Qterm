use crate::{
    access::{Admission, Proof},
    state::ServerState,
    tests::{call, fixture},
};
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
    response::Response,
};
use http_body_util::BodyExt;
use qterm_core::{application::credential_lifecycle::LockReason, domain::auth::SecretText};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

const MASTER: &str = "takeover-master-password";

struct Page {
    cookie: String,
    key: String,
}
impl Page {
    async fn request(
        &self,
        state: &Arc<ServerState>,
        method: &str,
        path: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        let request = Request::builder()
            .method(method)
            .uri(format!("/api/v1{path}"))
            .header("Cookie", &self.cookie)
            .header("x-qterm-access", &self.key)
            .header("x-qterm-client", "new-page")
            .header("Origin", "http://localhost:1423")
            .header("Content-Type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = crate::router::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        (response.status(), body_json(response).await)
    }
}

async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn take_over(state: &Arc<ServerState>) -> Page {
    let Admission::Occupied { ticket } = state.auth.access.login("new-page", false).unwrap() else {
        panic!("expected occupied");
    };
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/access/takeover")
        .header("Origin", "http://localhost:1423")
        .header("Content-Type", "application/json")
        .body(Body::from(
            json!({"ticket":ticket,"clientId":"new-page"}).to_string(),
        ))
        .unwrap();
    let response = crate::router::router(state.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let body = body_json(response).await;
    assert_eq!(body["authenticated"], true);
    Page {
        cookie,
        key: body["accessKey"].as_str().unwrap().into(),
    }
}

#[tokio::test]
async fn initialized_vault_takeover_requires_master_password_before_data_access() {
    for already_locked in [false, true] {
        let (_dir, state, old_token) = fixture();
        let recovery = state.vault.prepare_initial_recovery().unwrap();
        state
            .vault
            .initialize(
                SecretText::new(MASTER.into()),
                recovery,
                state.settings.security(),
            )
            .unwrap();
        if already_locked {
            state.vault.lock(LockReason::Manual);
        }
        let old_permit = crate::data_access::Permit::new(&state, &old_token).unwrap();
        let page = take_over(&state).await;
        assert!(!state.vault.status().unwrap().unlocked);
        assert!(old_permit.check().is_err());
        assert_eq!(
            call(
                state.clone(),
                &old_token,
                "GET",
                "/api/v1/workspace",
                Value::Null
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            page.request(&state, "GET", "/terminal-lock", Value::Null)
                .await,
            (StatusCode::OK, json!({"locked":true}))
        );

        for (method, path) in [
            ("GET", "/workspace"),
            ("GET", "/credentials"),
            ("POST", "/local/files/list"),
            ("GET", "/runtime/sessions"),
            ("GET", "/sessions"),
            ("GET", "/runtime/attach"),
            ("POST", "/vault/unlock"),
        ] {
            let (status, body) = page
                .request(&state, method, path, json!({"masterPassword":MASTER}))
                .await;
            assert_eq!(status, StatusCode::LOCKED, "{method} {path}");
            assert_eq!(body["code"], "terminalLocked");
        }
        // Refresh/resume must not remove the newly imposed lock.
        let (status, body) = page
            .request(
                &state,
                "POST",
                "/access/resume",
                json!({"accessKey":page.key,"clientId":"new-page"}),
            )
            .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["authenticated"], true);
        assert_eq!(
            page.request(&state, "GET", "/terminal-lock", Value::Null)
                .await
                .1,
            json!({"locked":true})
        );
        assert_eq!(
            page.request(
                &state,
                "POST",
                "/terminal-lock/unlock",
                json!({"masterPassword":"wrong-password"})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            page.request(&state, "GET", "/workspace", Value::Null)
                .await
                .0,
            StatusCode::LOCKED
        );
        assert!(!state.vault.status().unwrap().unlocked);

        assert_eq!(
            page.request(
                &state,
                "POST",
                "/terminal-lock/unlock",
                json!({"masterPassword":MASTER})
            )
            .await,
            (StatusCode::OK, json!({"locked":false}))
        );
        assert!(state.vault.status().unwrap().unlocked);
        assert_eq!(
            page.request(&state, "GET", "/workspace", Value::Null)
                .await
                .0,
            StatusCode::OK
        );
        assert_eq!(
            page.request(&state, "GET", "/credentials", Value::Null)
                .await
                .0,
            StatusCode::OK
        );
    }
}

#[tokio::test]
async fn uninitialized_vault_takeover_does_not_create_an_unusable_lock() {
    let (_dir, state, _old_token) = fixture();
    let page = take_over(&state).await;
    assert_eq!(
        page.request(&state, "GET", "/terminal-lock", Value::Null)
            .await,
        (StatusCode::OK, json!({"locked":false}))
    );
    assert_eq!(
        page.request(&state, "GET", "/workspace", Value::Null)
            .await
            .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn invalid_takeover_ticket_does_not_lock_or_revoke_current_owner() {
    let (_dir, state, token) = fixture();
    let recovery = state.vault.prepare_initial_recovery().unwrap();
    state
        .vault
        .initialize(
            SecretText::new(MASTER.into()),
            recovery,
            state.settings.security(),
        )
        .unwrap();
    let (status, _) = call(
        state.clone(),
        &token,
        "POST",
        "/api/v1/access/takeover",
        json!({"ticket":"invalid","clientId":"new-page"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(state.vault.status().unwrap().unlocked);
    assert!(!state.auth.access.terminal_locked(&token).unwrap());
}

#[test]
fn takeover_publishes_the_owner_already_locked() {
    let access = crate::access::Access::default();
    access.fixture().unwrap();
    let Admission::Occupied { ticket } = access.login("new-page", false).unwrap() else {
        panic!("expected occupied");
    };
    let changes = access.subscribe();
    let Admission::Granted { cookie, key } = access.takeover(&ticket, "new-page", true).unwrap()
    else {
        panic!("expected granted");
    };
    assert!(changes.has_changed().unwrap());
    let owner = access
        .authorize(
            &cookie,
            &Proof {
                access_key: key,
                client_id: "new-page".into(),
            },
        )
        .unwrap();
    assert!(access.terminal_locked(&owner).unwrap());
}
