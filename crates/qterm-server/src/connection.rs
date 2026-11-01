use crate::{
    error::{ApiError, Result},
    state::ServerState,
};
use qterm_core::{
    application::session_route::prepare_route,
    domain::{
        auth::{AuthRequest, SecretText},
        credential::CredentialMaterial,
        session::InitialDirectory,
    },
    infrastructure::ssh::client::{SessionConnectRequest, SessionPurpose},
};
use qterm_protocol::sessions::{SessionAuthDto, SessionConnectDto, terminal_size};
use std::sync::Arc;

pub fn resolve_auth(state: &ServerState, id: &str) -> Result<AuthRequest> {
    Ok(match state.vault.load(id)? {
        CredentialMaterial::Password(password) => AuthRequest::Password(password),
        CredentialMaterial::PrivateKey { data, passphrase } => {
            AuthRequest::PrivateKeyData { data, passphrase }
        }
    })
}
pub fn prepare(
    state: &ServerState,
    input: SessionConnectDto,
    purpose: SessionPurpose,
    terminal_output: Arc<dyn Fn(Vec<u8>) + Send + Sync>,
) -> Result<SessionConnectRequest> {
    let size = terminal_size(input.terminal_size, purpose)?;
    let auth = match input.auth {
        SessionAuthDto::Password { password } if password.len() <= 4096 => {
            AuthRequest::Password(SecretText::new(password))
        }
        SessionAuthDto::StoredCredential { credential_id } => resolve_auth(state, &credential_id)?,
        _ => return Err(ApiError::invalid()),
    };
    let profiles = state.profiles.route(&input.profile_id)?;
    if profiles
        .iter()
        .any(|p| p.auth_preference() == qterm_core::domain::profile::AuthPreference::SshAgent)
    {
        return Err(ApiError::invalid());
    }
    let route = prepare_route(profiles, auth, |id| resolve_auth(state, id))?;
    Ok(SessionConnectRequest {
        route,
        purpose,
        profile_id: Some(input.profile_id),
        terminal_size: size,
        initial_directory: input.initial_directory.and_then(InitialDirectory::new),
        terminal_output,
        remote_shell_integration_enabled: purpose == SessionPurpose::Terminal
            && state.settings.terminal().remote_shell_integration_enabled,
        history_free_bash_enabled: state.settings.terminal().history_free_bash_enabled,
    })
}
