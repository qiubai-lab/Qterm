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
use std::sync::Arc;

#[derive(Clone)]
pub struct Identity(pub String);
pub struct Auth {
    pub access: crate::access::Access,
    pub failures: crate::verification::Verification,
    pub verification: Arc<tokio::sync::Semaphore>,
}
impl Default for Auth {
    fn default() -> Self {
        Self {
            access: Default::default(),
            failures: Default::default(),
            verification: Arc::new(tokio::sync::Semaphore::new(2)),
        }
    }
}
impl Auth {
    pub fn valid(&self, token: &str) -> bool {
        self.access.valid(token)
    }
    #[cfg(test)]
    pub fn issue(&self) -> Result<String> {
        self.access.fixture()
    }
    pub fn revoke(&self) {
        self.access.revoke();
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
pub fn token(headers: &HeaderMap, secure: bool) -> Option<&str> {
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
pub fn cookie(secure: bool, token: &str, age: u32) -> HeaderValue {
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
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD
    ) {
        check_origin(request.headers(), &state.config.origin)?;
    }
    let cookie =
        token(request.headers(), state.config.secure_cookie).ok_or_else(ApiError::unauthorized)?;
    // Browser downloads cannot set headers. Their short-lived, single-use ticket
    // is already bound to the current owner and is cleared during takeover.
    let path = request.uri().path();
    let path = path.strip_prefix("/api/v1").unwrap_or(path);
    let ticket_download =
        *request.method() == axum::http::Method::GET && path.starts_with("/downloads/");
    let socket_upgrade = *request.method() == axum::http::Method::GET
        && matches!(
            path,
            "/access" | "/git/events" | "/sessions" | "/local/sessions" | "/runtime/attach"
        )
        && request
            .headers()
            .get(header::UPGRADE)
            .is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"websocket"));
    let owner = if ticket_download || socket_upgrade {
        state.auth.access.cookie_owner(cookie)?
    } else {
        let proof = crate::access::Proof {
            access_key: request
                .headers()
                .get("x-qterm-access")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default()
                .into(),
            client_id: request
                .headers()
                .get("x-qterm-client")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default()
                .into(),
        };
        state.auth.access.authorize(cookie, &proof)?
    };
    let identity = Identity(owner.clone());
    request.extensions_mut().insert(identity);
    crate::data_access::serve(state, owner, request, next).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginInput {
    password: String,
    #[serde(rename = "clientId")]
    client_id: String,
}
pub async fn login(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(input): Json<LoginInput>,
) -> Result<Response> {
    check_origin(&headers, &state.config.origin)?;
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
    let admission = crate::access_lifecycle::login(&state, &input.client_id).await?;
    crate::access_transport::admitted(&state, admission)
}

pub async fn logout(
    State(state): State<Arc<ServerState>>,
    axum::Extension(owner): axum::Extension<Identity>,
) -> Result<Response> {
    crate::access_lifecycle::logout(&state, &owner.0).await?;
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
}
