//! Browser data admission and revocation; retained processes outlive these permits.
use crate::{
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{body::Body, extract::Request, http::StatusCode, middleware::Next, response::Response};
use futures_util::StreamExt;
use std::sync::Arc;

pub fn locked() -> ApiError {
    ApiError::new(StatusCode::LOCKED, "terminalLocked", "终端已锁定，请先解锁")
}

pub fn control_route(path: &str, method: &str) -> bool {
    matches!(
        (method, path),
        ("GET", "/auth" | "/access" | "/terminal-lock")
            | (
                "POST",
                "/logout" | "/terminal-lock/lock" | "/terminal-lock/unlock"
            )
    )
}

#[derive(Clone)]
pub struct Permit {
    state: Arc<ServerState>,
    owner: String,
    changes: tokio::sync::watch::Receiver<u64>,
    revision: u64,
}
impl Permit {
    pub fn new(state: &Arc<ServerState>, owner: &str) -> Result<Self> {
        let changes = state.auth.access.subscribe();
        let revision = *changes.borrow();
        let permit = Self {
            state: state.clone(),
            owner: owner.into(),
            changes,
            revision,
        };
        permit.check()?;
        Ok(permit)
    }
    pub fn check(&self) -> Result<()> {
        if self.state.auth.access.terminal_locked(&self.owner)?
            || *self.changes.borrow() != self.revision
        {
            return Err(locked());
        }
        Ok(())
    }
    pub async fn run<T>(&self, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
        self.check()?;
        let mut changes = self.changes.clone();
        tokio::select! {
            biased;
            _ = changes.changed() => Err(locked()),
            result = future => { self.check()?; result }
        }
    }
    fn body(self, body: Body) -> Body {
        let stream = body.into_data_stream();
        Body::from_stream(futures_util::stream::unfold(
            (self, stream, false),
            |(permit, mut stream, ended)| async move {
                if ended {
                    return None;
                }
                let result = permit.run(async { Ok(stream.next().await) }).await;
                match result {
                    Ok(Some(chunk)) => Some((chunk, (permit, stream, false))),
                    Ok(None) => None,
                    Err(_) => Some((
                        Err(axum::Error::new(std::io::Error::other("terminal locked"))),
                        (permit, stream, true),
                    )),
                }
            },
        ))
    }
}

pub async fn serve(
    state: Arc<ServerState>,
    owner: String,
    request: Request,
    next: Next,
) -> Result<Response> {
    let path = request
        .uri()
        .path()
        .strip_prefix("/api/v1")
        .unwrap_or(request.uri().path());
    if control_route(path, request.method().as_str()) {
        return Ok(next.run(request).await);
    }
    let permit = Permit::new(&state, &owner)?;
    // Stop receiving upload bodies too. Already accepted mutations are never replayed.
    let (parts, body) = request.into_parts();
    let response = next
        .run(Request::from_parts(parts, permit.clone().body(body)))
        .await;
    permit.check()?;
    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        return Ok(response);
    }
    let (parts, body) = response.into_parts();
    Ok(Response::from_parts(parts, permit.body(body)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{call, fixture};
    use http_body_util::BodyExt;
    use serde_json::json;

    #[tokio::test]
    async fn locked_login_admits_only_control_routes_and_no_business_payloads() {
        let (_dir, state, token) = fixture();
        state.auth.access.set_terminal_locked(&token, true).unwrap();
        for (method, path) in [
            ("POST", "/git/snapshot"),
            ("GET", "/settings"),
            ("GET", "/vault"),
            ("GET", "/credentials"),
            ("GET", "/workspace"),
            ("PUT", "/workspace"),
            ("GET", "/runtime/sessions"),
            ("GET", "/runtime/panes/block"),
            ("GET", "/profiles"),
            ("GET", "/network/rules"),
            ("POST", "/local/files/list"),
            ("POST", "/files/read"),
            ("GET", "/downloads/old-ticket"),
            ("GET", "/sessions"),
            ("GET", "/local/sessions"),
            ("GET", "/runtime/attach"),
            ("POST", "/vault/unlock"),
            ("POST", "/transfers/upload"),
        ] {
            let (status, body) = call(
                state.clone(),
                &token,
                method,
                &format!("/api/v1{path}"),
                json!(null),
            )
            .await;
            assert_eq!(status, StatusCode::LOCKED, "{method} {path}");
            assert_eq!(body["code"], "terminalLocked");
        }
        assert_eq!(
            call(state.clone(), &token, "GET", "/api/v1/auth", json!(null))
                .await
                .0,
            StatusCode::OK
        );
        assert_eq!(
            call(
                state.clone(),
                &token,
                "GET",
                "/api/v1/terminal-lock",
                json!(null)
            )
            .await
            .1,
            json!({"locked":true})
        );
        state
            .auth
            .access
            .set_terminal_locked(&token, false)
            .unwrap();
        assert_eq!(
            call(
                state,
                &token,
                "GET",
                "/api/v1/runtime/sessions",
                json!(null)
            )
            .await
            .0,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn lock_revokes_existing_streams_even_if_unlock_happens_before_the_next_chunk() {
        let (_dir, state, token) = fixture();
        let permit = Permit::new(&state, &token).unwrap();
        let body = permit.clone().body(Body::from("private file content"));
        state.auth.access.set_terminal_locked(&token, true).unwrap();
        state
            .auth
            .access
            .set_terminal_locked(&token, false)
            .unwrap();
        assert!(body.collect().await.is_err());
        assert!(permit.check().is_err());
        let fresh = Permit::new(&state, &token)
            .unwrap()
            .body(Body::from("fresh data"));
        assert_eq!(fresh.collect().await.unwrap().to_bytes(), "fresh data");
    }

    #[tokio::test]
    async fn lock_interrupts_a_pending_stream_without_waiting_for_more_data() {
        let (_dir, state, token) = fixture();
        let permit = Permit::new(&state, &token).unwrap();
        let pending =
            tokio::spawn(async move { permit.run(std::future::pending::<Result<()>>()).await });
        state.auth.access.set_terminal_locked(&token, true).unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(1), pending)
                .await
                .unwrap()
                .unwrap()
                .is_err()
        );
    }
}
