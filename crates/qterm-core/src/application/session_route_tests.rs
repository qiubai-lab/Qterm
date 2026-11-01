use super::session_route::prepare_route;
use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    domain::{
        auth::{AuthRequest, SecretText},
        credential::CredentialId,
        profile::{AuthPreference, ConnectionProfile, ProfileId},
    },
};

fn profile(id: &str, preference: AuthPreference) -> ConnectionProfile {
    ConnectionProfile::new(
        ProfileId::parse(id).unwrap(),
        id,
        "example.test",
        22,
        "test",
        preference,
        Some(CredentialId::parse("saved").unwrap()),
    )
    .unwrap()
}
#[test]
fn target_uses_explicit_auth_and_jumps_resolve_stored_credentials() {
    let route = prepare_route::<ApplicationError>(
        vec![
            profile("jump", AuthPreference::Password),
            profile("target", AuthPreference::Manual),
        ],
        AuthRequest::Password(SecretText::new("target-secret".into())),
        |id| {
            assert_eq!(id, "saved");
            Ok(AuthRequest::Password(SecretText::new("jump-secret".into())))
        },
    )
    .unwrap();
    assert_eq!(route.len(), 2);
    assert!(matches!(&route[0].auth,AuthRequest::Password(value) if value.expose()=="jump-secret"));
    assert!(
        matches!(&route[1].auth,AuthRequest::Password(value) if value.expose()=="target-secret")
    );
}
#[test]
fn incompatible_jump_credentials_are_rejected_before_network_access() {
    let result = prepare_route::<ApplicationError>(
        vec![
            profile("jump", AuthPreference::PrivateKey),
            profile("target", AuthPreference::Manual),
        ],
        AuthRequest::SshAgent,
        |_| Ok(AuthRequest::Password(SecretText::new("wrong-kind".into()))),
    );
    assert_eq!(
        result.err().unwrap().code(),
        ApplicationErrorCode::InvalidProfileJump
    );
}
#[test]
fn manual_jump_and_empty_routes_are_rejected() {
    let manual = prepare_route::<ApplicationError>(
        vec![
            profile("jump", AuthPreference::Manual),
            profile("target", AuthPreference::Manual),
        ],
        AuthRequest::SshAgent,
        |_| panic!("manual jump must not resolve"),
    );
    assert_eq!(
        manual.err().unwrap().code(),
        ApplicationErrorCode::InvalidProfileJump
    );
    let empty = prepare_route::<ApplicationError>(vec![], AuthRequest::SshAgent, |_| {
        panic!("empty route must not resolve")
    });
    assert_eq!(
        empty.err().unwrap().code(),
        ApplicationErrorCode::InvalidSessionTarget
    );
}
