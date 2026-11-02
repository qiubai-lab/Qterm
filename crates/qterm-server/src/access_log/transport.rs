use super::{
    Kind, Source,
    model::{Page, Query},
};
use crate::{auth, error::Result, state::ServerState};
use axum::{
    Json,
    extract::{ConnectInfo, Query as Params, Request, State},
    middleware::Next,
    response::Response,
};
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
};

fn source(request: &Request, state: &ServerState) -> Source {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip());
    let mut ip = peer;
    if peer.is_some_and(|peer| state.config.trusted_proxies.contains(&peer))
        && let Some(chain) = request
            .headers()
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
    {
        let parsed: std::result::Result<Vec<IpAddr>, _> = chain
            .split(',')
            .take(17)
            .map(|part| part.trim().parse())
            .collect();
        if let Ok(chain) = parsed
            && chain.len() <= 16
        {
            for hop in chain.into_iter().rev() {
                if !ip.is_some_and(|value| state.config.trusted_proxies.contains(&value)) {
                    break;
                }
                ip = Some(hop);
            }
        }
    }
    let headers = request.headers();
    let cookie = auth::token(headers, state.config.secure_cookie).unwrap_or_default();
    let key = headers
        .get("x-qterm-access")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let client = headers
        .get("x-qterm-client")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    Source {
        ip: ip.map(|value| value.to_string()),
        browser: headers
            .get("user-agent")
            .and_then(|value| value.to_str().ok())
            .map(|value| {
                value
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(256)
                    .collect()
            }),
        session: state.auth.access.audit_session(cookie, key, client),
    }
}

fn operation(method: &str, path: &str) -> Option<Kind> {
    match (method, path) {
        ("POST", "/api/v1/login") => Some(Kind::Login),
        ("POST", "/api/v1/access/resume") => Some(Kind::Resume),
        ("POST", "/api/v1/access/takeover") => Some(Kind::Takeover),
        ("POST", "/api/v1/logout") => Some(Kind::Logout),
        ("POST", "/api/v1/vault/unlock") => Some(Kind::VaultUnlock),
        ("POST", "/api/v1/vault/lock") => Some(Kind::VaultLock),
        ("POST", "/api/v1/vault/initialize") => Some(Kind::VaultInitialize),
        ("PUT", "/api/v1/vault/password") => Some(Kind::VaultPasswordChange),
        ("POST", "/api/v1/vault/reset") => Some(Kind::VaultReset),
        ("POST", "/api/v1/vault/clear") => Some(Kind::VaultClear),
        ("POST", "/api/v1/terminal-lock/unlock") => Some(Kind::WorkbenchUnlock),
        ("POST", "/api/v1/terminal-lock/lock") => Some(Kind::WorkbenchLock),
        _ => None,
    }
}

pub async fn observe(
    State(state): State<Arc<ServerState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let mut context = source(&request, &state);
    let kind = operation(request.method().as_str(), request.uri().path());
    let api = request.uri().path().starts_with("/api/v1/");
    request.extensions_mut().insert(context.clone());
    let response = next.run(request).await;
    let status = response.status();
    if status.is_success()
        && response
            .extensions()
            .get::<crate::access_lifecycle::LockOutcome>()
            .is_some_and(|outcome| !outcome.changed)
    {
        return response;
    }
    let refused = api && matches!(status.as_u16(), 401 | 403 | 423 | 429);
    if let Some(kind) = kind.or(if refused {
        Some(Kind::AccessDenied)
    } else {
        None
    }) {
        let success = status.is_success();
        let reason = if success {
            if let Some(admission) = response
                .extensions()
                .get::<crate::access_transport::AdmissionOutcome>()
            {
                if admission.session.is_some() {
                    context.session.clone_from(&admission.session);
                }
                if admission.pending {
                    "confirmationRequired"
                } else {
                    "admitted"
                }
            } else {
                "completed"
            }
        } else {
            match response
                .extensions()
                .get::<crate::error::ResponseErrorCode>()
                .map(|error| error.0.as_str())
            {
                Some("invalidLogin") => "invalidPassword",
                Some("sessionReplaced") => "sessionReplaced",
                Some("unauthorized") => "sessionExpired",
                Some("terminalLocked") => "workbenchLocked",
                Some("claimExpired") => "claimExpired",
                Some("forbidden") => "forbidden",
                _ if status.as_u16() == 429 => "rateLimited",
                _ if status.is_server_error() => "serviceError",
                Some("vaultInvalidMasterPassword") => "verificationFailed",
                Some("vaultInvalidRecoveryFile" | "vaultRecoveryFileMismatch") => "invalidRecovery",
                Some("vaultNotInitialized") => "vaultNotInitialized",
                Some("vaultLocked") => "vaultLocked",
                _ => "requestRejected",
            }
        };
        state
            .access_log
            .record(kind, success, reason, context.clone());
    }
    response
}

pub async fn list(
    State(state): State<Arc<ServerState>>,
    Params(query): Params<Query>,
) -> Result<Json<Page>> {
    state.access_log.query(query).await.map(Json)
}
