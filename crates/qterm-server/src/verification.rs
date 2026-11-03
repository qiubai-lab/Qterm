//! Web-only verification budgets and failure response timing. No credential material is retained.
use crate::{
    auth,
    error::{ApiError, ResponseErrorCode, Result},
    state::ServerState,
};
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use qterm_core::{
    application::error::ApplicationError,
    domain::{auth::AuthFailure, credential::CredentialError},
};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

const WINDOW: Duration = Duration::from_secs(60);
const ATTEMPTS: usize = 5;
// Operational floor, not a constant-time guarantee: tune after measuring deployment KDF latency.
const FAILURE_FLOOR: Duration = Duration::from_secs(1);

#[derive(Default)]
struct Budget(Mutex<VecDeque<Instant>>);
impl Budget {
    fn admit(&self, now: Instant) -> bool {
        let mut times = self.0.lock().unwrap();
        // Concurrent callers can acquire the mutex in a different order than they sampled time.
        let now = times.back().copied().map_or(now, |last| now.max(last));
        while times
            .front()
            .is_some_and(|time| now.duration_since(*time) >= WINDOW)
        {
            times.pop_front();
        }
        if times.len() == ATTEMPTS {
            return false;
        }
        times.push_back(now);
        true
    }
}

pub struct Verification {
    budgets: [Budget; 4],
    pending: Semaphore,
}
impl Default for Verification {
    fn default() -> Self {
        Self {
            budgets: std::array::from_fn(|_| Budget::default()),
            pending: Semaphore::new(64),
        }
    }
}

#[derive(Clone, Copy)]
enum Scope {
    Login,
    Master,
    Recovery,
    PrivateKey,
}
impl Scope {
    fn request(method: &str, path: &str) -> Option<Self> {
        let path = path.strip_prefix("/api/v1").unwrap_or(path);
        match (method, path) {
            ("POST", "/login") => Some(Self::Login),
            ("POST", "/vault/unlock" | "/terminal-lock/unlock") | ("PUT", "/vault/password") => {
                Some(Self::Master)
            }
            ("POST", "/vault/reset/prepare") => Some(Self::Recovery),
            ("POST", path)
                if path.strip_prefix("/credentials/drafts/").is_some_and(|id| {
                    !id.is_empty() && !id.contains('/') && !matches!(id, "generate" | "import")
                }) =>
            {
                Some(Self::PrivateKey)
            }
            _ => None,
        }
    }
    fn error(self) -> ApiError {
        match self {
            Self::Login => ApiError::new(StatusCode::UNAUTHORIZED, "invalidLogin", "密码不正确"),
            Self::Master => CredentialError::InvalidMasterPassword.into(),
            Self::Recovery => CredentialError::RecoveryFileMismatch.into(),
            Self::PrivateKey => ApplicationError::from(AuthFailure::InvalidPassphrase).into(),
        }
    }
    fn failed(self, response: &Response) -> bool {
        response
            .extensions()
            .get::<ResponseErrorCode>()
            .is_some_and(|code| {
                code.0 == self.error().code
                    || code.0 == "busy"
                    || matches!(self, Self::Recovery) && code.0 == "vaultInvalidRecoveryFile"
            })
    }
}

/// Runs inside the authenticated guard for protected routes, outside all handler-owned locks.
pub async fn serve(
    State(state): State<Arc<ServerState>>,
    request: Request,
    next: Next,
) -> Result<Response> {
    let Some(scope) = Scope::request(request.method().as_str(), request.uri().path()) else {
        return Ok(next.run(request).await);
    };
    let started = Instant::now();
    auth::check_origin(request.headers(), &state.config.origin)?;
    // Saturation is an independent resource limit, applied before examining verification history.
    let _pending = state
        .auth
        .failures
        .pending
        .try_acquire()
        .map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "busy", "请稍后重试"))?;
    let mut random = [0u8; 1];
    getrandom::fill(&mut random).map_err(|_| ApiError::storage())?;
    let deadline = started + FAILURE_FLOOR + Duration::from_millis(u64::from(random[0]));
    let admitted = state.auth.failures.budgets[scope as usize].admit(Instant::now());
    let response = if admitted {
        next.run(request).await
    } else {
        scope.error().into_response()
    };
    if !admitted || scope.failed(&response) {
        // next.run has completed: no vault gate or expensive-work permit is held during padding.
        tokio::time::sleep_until(deadline.into()).await;
        let mut response = scope.error().into_response();
        if !admitted {
            // Response extensions are server-only; the public body stays identical.
            response
                .extensions_mut()
                .insert(ResponseErrorCode("rateLimited".into()));
        }
        return Ok(response);
    }
    Ok(response)
}

#[cfg(test)]
#[path = "verification_tests.rs"]
mod tests;
