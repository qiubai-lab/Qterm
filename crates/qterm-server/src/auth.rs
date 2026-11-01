use crate::{
    error::{ApiError, Result},
    state::ServerState,
};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct Identity(pub String);
struct Login {
    token: String,
    expires: Instant,
}
pub struct Auth {
    login: Mutex<Option<Login>>,
    attempts: Mutex<(Instant, u32)>,
    pub verification: Arc<tokio::sync::Semaphore>,
}
impl Default for Auth {
    fn default() -> Self {
        Self {
            login: Mutex::new(None),
            attempts: Mutex::new((Instant::now(), 0)),
            verification: Arc::new(tokio::sync::Semaphore::new(2)),
        }
    }
}
impl Auth {
    pub fn valid(&self, token: &str) -> bool {
        self.login
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|login| login.token == token && login.expires > Instant::now())
    }
    pub fn issue(&self) -> Result<String> {
        let token = random_token()?;
        *self.login.lock().unwrap() = Some(Login {
            token: token.clone(),
            expires: Instant::now() + Duration::from_secs(8 * 3600),
        });
        Ok(token)
    }
    pub fn revoke(&self) {
        *self.login.lock().unwrap() = None;
    }
    fn attempt(&self) -> Result<()> {
        let mut attempts = self.attempts.lock().unwrap();
        if attempts.0.elapsed() >= Duration::from_secs(60) {
            *attempts = (Instant::now(), 0);
        }
        attempts.1 += 1;
        if attempts.1 > 10 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "rateLimited",
                "尝试过于频繁，请稍后重试",
            ));
        }
        Ok(())
    }
}
pub fn random_token() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| ApiError::storage())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
pub fn check_origin(headers: &HeaderMap, origin: &str) -> Result<()> {
    if headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) != Some(origin) {
        return Err(ApiError::forbidden());
    }
    Ok(())
}
fn cookie_name(secure: bool) -> &'static str {
    if secure { "__Host-qterm" } else { "qterm" }
}
fn token(headers: &HeaderMap, secure: bool) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|item| {
            let (key, value) = item.trim().split_once('=')?;
            (key == cookie_name(secure)).then_some(value)
        })
}
fn cookie(secure: bool, token: &str, age: u32) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{}",
        cookie_name(secure),
        if secure { "; Secure" } else { "" }
    ))
    .expect("generated cookie")
}
pub async fn guard(
    State(state): State<Arc<ServerState>>,
    mut request: Request,
    next: Next,
) -> Result<Response> {
    let token =
        token(request.headers(), state.config.secure_cookie).ok_or_else(ApiError::unauthorized)?;
    if !state.auth.valid(token) {
        return Err(ApiError::unauthorized());
    }
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD
    ) {
        check_origin(request.headers(), &state.config.origin)?;
    }
    let identity = Identity(token.to_owned());
    request.extensions_mut().insert(identity);
    Ok(next.run(request).await)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginInput {
    password: String,
}
pub async fn login(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(input): Json<LoginInput>,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
    state.auth.attempt()?;
    if input.password.len() > 1024 {
        return Err(ApiError::invalid());
    }
    let permit = state
        .auth
        .verification
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new(StatusCode::TOO_MANY_REQUESTS, "busy", "请稍后重试"))?;
    let password = zeroize::Zeroizing::new(input.password);
    let hash = state.config.password_hash.clone();
    let valid = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        PasswordHash::new(&hash).is_ok_and(|hash| {
            Argon2::default()
                .verify_password(password.as_bytes(), &hash)
                .is_ok()
        })
    })
    .await
    .map_err(|_| ApiError::storage())?;
    if !valid {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalidLogin",
            "密码不正确",
        ));
    }
    let _gate = state.vault_gate.lock().await;
    state.clear_login_secrets();
    state
        .vault
        .lock(qterm_core::application::credential_lifecycle::LockReason::Manual);
    let token = state.auth.issue()?;
    Ok((
        [(
            header::SET_COOKIE,
            cookie(state.config.secure_cookie, &token, 8 * 3600),
        )],
        Json(serde_json::json!({"authenticated":true})),
    )
        .into_response())
}
pub async fn logout(
    State(state): State<Arc<ServerState>>,
    axum::Extension(owner): axum::Extension<Identity>,
) -> Result<Response> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    state.auth.revoke();
    state.clear_login_secrets();
    state
        .vault
        .lock(qterm_core::application::credential_lifecycle::LockReason::Manual);
    Ok((
        [(
            header::SET_COOKIE,
            cookie(state.config.secure_cookie, "", 0),
        )],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn issuing_login_revokes_previous_and_logout_revokes_current() {
        let auth = Auth::default();
        let first = auth.issue().unwrap();
        assert!(auth.valid(&first));
        let second = auth.issue().unwrap();
        assert!(!auth.valid(&first));
        assert!(auth.valid(&second));
        auth.revoke();
        assert!(!auth.valid(&second));
    }
    #[test]
    fn origin_is_exact_not_a_prefix_or_substring() {
        for origin in [
            "https://qterm.example.attacker.test",
            "https://qterm.example/",
            "null",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::ORIGIN, origin.parse().unwrap());
            assert!(check_origin(&headers, "https://qterm.example").is_err());
        }
        assert!(check_origin(&HeaderMap::new(), "https://qterm.example").is_err());
    }
    #[test]
    fn login_attempts_are_bounded() {
        let auth = Auth::default();
        for _ in 0..10 {
            assert!(auth.attempt().is_ok());
        }
        assert!(auth.attempt().is_err());
    }
}
