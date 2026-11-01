use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    domain::{
        auth::AuthRequest,
        profile::{AuthPreference, ConnectionProfile},
        session::{HostEndpoint, validate_username},
        session_route::SessionRouteNode,
    },
};

/// Resolve every jump credential in the trusted backend. Target auth is consumed once.
pub fn prepare_route<E: From<ApplicationError>>(
    profiles: Vec<ConnectionProfile>,
    target_auth: AuthRequest,
    mut resolve: impl FnMut(&str) -> Result<AuthRequest, E>,
) -> Result<Vec<SessionRouteNode>, E> {
    if profiles.is_empty() {
        return Err(invalid_target().into());
    }
    let last = profiles.len() - 1;
    let mut target_auth = Some(target_auth);
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            let auth = if index == last {
                target_auth.take().expect("target consumed once")
            } else {
                match profile.auth_preference() {
                    AuthPreference::SshAgent => AuthRequest::SshAgent,
                    AuthPreference::Manual => return Err(invalid_jump().into()),
                    preference => {
                        let id = profile
                            .credential_id()
                            .ok_or_else(|| E::from(invalid_jump()))?;
                        let auth = resolve(id.as_str())?;
                        if !matches!(
                            (preference, &auth),
                            (AuthPreference::Password, AuthRequest::Password(_))
                                | (
                                    AuthPreference::PrivateKey,
                                    AuthRequest::PrivateKey { .. }
                                        | AuthRequest::PrivateKeyData { .. }
                                )
                        ) {
                            return Err(invalid_jump().into());
                        }
                        auth
                    }
                }
            };
            Ok(SessionRouteNode {
                profile_id: profile.id().as_str().to_owned(),
                name: profile.name().to_owned(),
                endpoint: HostEndpoint::new(profile.host(), u32::from(profile.port()))
                    .map_err(|_| E::from(invalid_target()))?,
                username: validate_username(profile.username())
                    .map_err(|_| E::from(invalid_target()))?,
                auth,
            })
        })
        .collect()
}

fn invalid_jump() -> ApplicationError {
    ApplicationError::new(
        ApplicationErrorCode::InvalidProfileJump,
        "中间节点没有可自动使用的认证配置",
        false,
    )
}
fn invalid_target() -> ApplicationError {
    ApplicationError::new(
        ApplicationErrorCode::InvalidSessionTarget,
        "SSH 连接目标或用户名无效",
        false,
    )
}
