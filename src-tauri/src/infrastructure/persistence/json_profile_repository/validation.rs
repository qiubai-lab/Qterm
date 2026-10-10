use crate::domain::profile::{
    ConnectionProfile, JumpRouteError, resolve_profile_route, validate_stored_jump_routes,
};

/// Existing portable routes awaiting device credentials must remain editable.
/// A mutation may not introduce a newly unusable route.
pub(super) fn validate_change(
    before: &[ConnectionProfile],
    after: &[ConnectionProfile],
) -> Result<(), JumpRouteError> {
    validate_stored_jump_routes(after)?;
    for profile in after {
        if let Err(error) = resolve_profile_route(after, profile.id()) {
            let was_unbound = before.iter().any(|old| {
                old.id() == profile.id() && old.jump_profile_ids() == profile.jump_profile_ids()
            }) && resolve_profile_route(before, profile.id())
                == Err(JumpRouteError::MissingCredential);
            if error != JumpRouteError::MissingCredential || !was_unbound {
                return Err(error);
            }
        }
    }
    Ok(())
}
