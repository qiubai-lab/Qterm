use crate::domain::credential::CredentialId;

const MAX_NAME_LENGTH: usize = 80;
const MAX_HOST_LENGTH: usize = 253;
const MAX_USERNAME_LENGTH: usize = 128;
const MAX_PROFILE_ID_LENGTH: usize = 128;
const MAX_GROUP_ID_LENGTH: usize = 128;
const MAX_GROUP_NAME_LENGTH: usize = 80;
pub const MAX_JUMP_PROFILES: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthPreference {
    Password,
    PrivateKey,
    SshAgent,
    Manual,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ProfileId(String);

impl ProfileId {
    pub fn parse(value: impl Into<String>) -> Result<Self, ProfileValidationError> {
        let value = value.into();
        if value.is_empty()
            || value.len() > MAX_PROFILE_ID_LENGTH
            || value
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
        {
            return Err(ProfileValidationError::new(
                ProfileField::Id,
                ValidationReason::InvalidFormat,
            ));
        }

        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ProfileGroupId(String);

impl ProfileGroupId {
    pub fn parse(value: impl Into<String>) -> Result<Self, ProfileValidationError> {
        let value = value.into();
        if value.is_empty()
            || value.len() > MAX_GROUP_ID_LENGTH
            || value
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
        {
            return Err(ProfileValidationError::new(
                ProfileField::GroupId,
                ValidationReason::InvalidFormat,
            ));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProfileGroup {
    id: ProfileGroupId,
    name: String,
}

impl ProfileGroup {
    pub fn new(id: ProfileGroupId, name: impl AsRef<str>) -> Result<Self, ProfileValidationError> {
        Ok(Self {
            id,
            name: normalize_required(
                ProfileField::GroupName,
                name.as_ref(),
                MAX_GROUP_NAME_LENGTH,
            )?,
        })
    }

    pub fn id(&self) -> &ProfileGroupId {
        &self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConnectionProfile {
    id: ProfileId,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_preference: AuthPreference,
    credential_id: Option<CredentialId>,
    group_id: Option<ProfileGroupId>,
    jump_profile_ids: Vec<ProfileId>,
}

impl ConnectionProfile {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: ProfileId,
        name: impl AsRef<str>,
        host: impl AsRef<str>,
        port: u32,
        username: impl AsRef<str>,
        auth_preference: AuthPreference,
        credential_id: Option<CredentialId>,
    ) -> Result<Self, ProfileValidationError> {
        let name = normalize_required(ProfileField::Name, name.as_ref(), MAX_NAME_LENGTH)?;
        let host = normalize_required(ProfileField::Host, host.as_ref(), MAX_HOST_LENGTH)?;
        let username = normalize_required(
            ProfileField::Username,
            username.as_ref(),
            MAX_USERNAME_LENGTH,
        )?;

        let port = u16::try_from(port).map_err(|_| {
            ProfileValidationError::new(ProfileField::Port, ValidationReason::OutOfRange)
        })?;
        if port == 0 {
            return Err(ProfileValidationError::new(
                ProfileField::Port,
                ValidationReason::OutOfRange,
            ));
        }
        if host.chars().any(char::is_whitespace) {
            return Err(ProfileValidationError::new(
                ProfileField::Host,
                ValidationReason::InvalidFormat,
            ));
        }
        if username.chars().any(char::is_whitespace) {
            return Err(ProfileValidationError::new(
                ProfileField::Username,
                ValidationReason::InvalidFormat,
            ));
        }
        let credential_id = match auth_preference {
            AuthPreference::Password | AuthPreference::PrivateKey => credential_id,
            AuthPreference::SshAgent | AuthPreference::Manual => None,
        };
        Ok(Self {
            id,
            name,
            host,
            port,
            username,
            auth_preference,
            credential_id,
            group_id: None,
            jump_profile_ids: Vec::new(),
        })
    }

    pub fn id(&self) -> &ProfileId {
        &self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    pub fn auth_preference(&self) -> AuthPreference {
        self.auth_preference
    }

    pub fn credential_id(&self) -> Option<&CredentialId> {
        self.credential_id.as_ref()
    }

    pub fn group_id(&self) -> Option<&ProfileGroupId> {
        self.group_id.as_ref()
    }

    pub fn jump_profile_ids(&self) -> &[ProfileId] {
        &self.jump_profile_ids
    }

    pub fn with_group_id(mut self, group_id: Option<ProfileGroupId>) -> Self {
        self.group_id = group_id;
        self
    }

    pub fn with_credential_id(mut self, credential_id: Option<CredentialId>) -> Self {
        self.credential_id = match self.auth_preference {
            AuthPreference::Password | AuthPreference::PrivateKey => credential_id,
            AuthPreference::SshAgent | AuthPreference::Manual => None,
        };
        self
    }

    pub fn with_jump_profile_ids(mut self, jump_profile_ids: Vec<ProfileId>) -> Self {
        self.jump_profile_ids = jump_profile_ids;
        self
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProfileField {
    Id,
    GroupId,
    GroupName,
    Name,
    Host,
    Port,
    Username,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JumpRouteError {
    SelfReference,
    TooDeep,
    MissingProfile,
    ManualAuthentication,
    MissingCredential,
    DuplicateProfile,
}

pub fn validate_jump_routes(profiles: &[ConnectionProfile]) -> Result<(), JumpRouteError> {
    for profile in profiles {
        resolve_profile_route(profiles, profile.id())?;
    }
    Ok(())
}

pub fn resolve_profile_route(
    profiles: &[ConnectionProfile],
    target_id: &ProfileId,
) -> Result<Vec<ConnectionProfile>, JumpRouteError> {
    let target = find_profile(profiles, target_id).ok_or(JumpRouteError::MissingProfile)?;
    if target.jump_profile_ids().len() > MAX_JUMP_PROFILES {
        return Err(JumpRouteError::TooDeep);
    }
    let mut route = Vec::with_capacity(target.jump_profile_ids().len() + 1);
    let mut visited = std::collections::HashSet::new();
    for jump_id in target.jump_profile_ids() {
        if jump_id == target.id() {
            return Err(JumpRouteError::SelfReference);
        }
        if !visited.insert(jump_id.as_str().to_owned()) {
            return Err(JumpRouteError::DuplicateProfile);
        }
        let jump = find_profile(profiles, jump_id).ok_or(JumpRouteError::MissingProfile)?;
        ensure_jump_eligible(jump)?;
        route.push(jump.clone());
    }
    route.push(target.clone());
    Ok(route)
}

pub fn evaluate_jump_candidate(
    profiles: &[ConnectionProfile],
    current_id: Option<&ProfileId>,
    selected_ids: &[ProfileId],
    candidate_id: &ProfileId,
) -> Result<Vec<ConnectionProfile>, JumpRouteError> {
    if current_id == Some(candidate_id) {
        return Err(JumpRouteError::SelfReference);
    }
    if selected_ids.iter().any(|id| id == candidate_id) {
        return Err(JumpRouteError::DuplicateProfile);
    }
    let candidate = find_profile(profiles, candidate_id).ok_or(JumpRouteError::MissingProfile)?;
    ensure_jump_eligible(candidate)?;
    Ok(vec![candidate.clone()])
}

fn find_profile<'a>(
    profiles: &'a [ConnectionProfile],
    id: &ProfileId,
) -> Option<&'a ConnectionProfile> {
    profiles.iter().find(|profile| profile.id() == id)
}

fn ensure_jump_eligible(profile: &ConnectionProfile) -> Result<(), JumpRouteError> {
    match profile.auth_preference() {
        AuthPreference::Manual => Err(JumpRouteError::ManualAuthentication),
        AuthPreference::Password | AuthPreference::PrivateKey
            if profile.credential_id().is_none() =>
        {
            Err(JumpRouteError::MissingCredential)
        }
        _ => Ok(()),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ValidationReason {
    Required,
    TooLong,
    InvalidFormat,
    OutOfRange,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProfileValidationError {
    field: ProfileField,
    reason: ValidationReason,
}

impl ProfileValidationError {
    fn new(field: ProfileField, reason: ValidationReason) -> Self {
        Self { field, reason }
    }

    pub fn field(self) -> ProfileField {
        self.field
    }

    pub fn reason(self) -> ValidationReason {
        self.reason
    }
}

fn normalize_required(
    field: ProfileField,
    value: &str,
    max_length: usize,
) -> Result<String, ProfileValidationError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ProfileValidationError::new(
            field,
            ValidationReason::Required,
        ));
    }
    if value.chars().count() > max_length {
        return Err(ProfileValidationError::new(
            field,
            ValidationReason::TooLong,
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(ProfileValidationError::new(
            field,
            ValidationReason::InvalidFormat,
        ));
    }

    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        AuthPreference, ConnectionProfile, JumpRouteError, ProfileField, ProfileGroup,
        ProfileGroupId, ProfileId, evaluate_jump_candidate, resolve_profile_route,
    };
    use crate::domain::credential::CredentialId;

    fn valid_profile() -> ConnectionProfile {
        ConnectionProfile::new(
            ProfileId::parse("profile-1").expect("fixture id must be valid"),
            " Production ",
            " example.com ",
            22,
            " deploy ",
            AuthPreference::PrivateKey,
            Some(CredentialId::parse("credential-1").expect("credential")),
        )
        .expect("fixture profile must be valid")
    }

    fn route_profile(
        id: &str,
        preference: AuthPreference,
        credential: bool,
        jumps: &[&str],
    ) -> ConnectionProfile {
        ConnectionProfile::new(
            ProfileId::parse(id).expect("id"),
            id,
            format!("{id}.example.com"),
            22,
            "deploy",
            preference,
            credential
                .then(|| CredentialId::parse(format!("credential-{id}")).expect("credential")),
        )
        .expect("profile")
        .with_jump_profile_ids(
            jumps
                .iter()
                .map(|value| ProfileId::parse(*value).expect("jump profile id"))
                .collect(),
        )
    }

    #[test]
    fn resolves_jump_profiles_from_outermost_node_to_target() {
        let profiles = vec![
            route_profile(
                "target",
                AuthPreference::Manual,
                false,
                &["jump-1", "jump-2"],
            ),
            route_profile("jump-2", AuthPreference::SshAgent, false, &[]),
            route_profile("jump-1", AuthPreference::PrivateKey, true, &[]),
        ];

        let route =
            resolve_profile_route(&profiles, &ProfileId::parse("target").expect("target id"))
                .expect("valid route");

        assert_eq!(
            route
                .iter()
                .map(|profile| profile.id().as_str())
                .collect::<Vec<_>>(),
            vec!["jump-1", "jump-2", "target"]
        );
    }

    #[test]
    fn rejects_duplicates_excess_depth_and_ineligible_jump_candidates() {
        let duplicate = vec![
            route_profile("a", AuthPreference::SshAgent, false, &["b", "b"]),
            route_profile("b", AuthPreference::SshAgent, false, &[]),
        ];
        assert_eq!(
            resolve_profile_route(&duplicate, &ProfileId::parse("a").expect("id")),
            Err(JumpRouteError::DuplicateProfile)
        );

        let mut deep = vec![route_profile(
            "target",
            AuthPreference::Manual,
            false,
            &["node-1", "node-2", "node-3", "node-4", "node-5"],
        )];
        deep.extend((1..=5).map(|index| {
            route_profile(
                &format!("node-{index}"),
                AuthPreference::SshAgent,
                false,
                &[],
            )
        }));
        assert_eq!(
            resolve_profile_route(&deep, &ProfileId::parse("target").expect("id")),
            Err(JumpRouteError::TooDeep)
        );

        let manual = vec![route_profile("manual", AuthPreference::Manual, false, &[])];
        assert_eq!(
            evaluate_jump_candidate(&manual, None, &[], &ProfileId::parse("manual").expect("id"),),
            Err(JumpRouteError::ManualAuthentication)
        );
        let missing = vec![route_profile(
            "password",
            AuthPreference::Password,
            false,
            &[],
        )];
        assert_eq!(
            evaluate_jump_candidate(
                &missing,
                None,
                &[],
                &ProfileId::parse("password").expect("id"),
            ),
            Err(JumpRouteError::MissingCredential)
        );
    }

    #[test]
    fn normalizes_user_entered_text_without_changing_the_credential_reference() {
        let profile = valid_profile();

        assert_eq!(profile.name(), "Production");
        assert_eq!(profile.host(), "example.com");
        assert_eq!(profile.username(), "deploy");
        assert_eq!(
            profile.credential_id().map(CredentialId::as_str),
            Some("credential-1")
        );
    }

    #[test]
    fn secret_free_preferences_never_keep_a_credential_reference() {
        for preference in [AuthPreference::Manual, AuthPreference::SshAgent] {
            let profile = ConnectionProfile::new(
                ProfileId::parse("profile-1").expect("id"),
                "Production",
                "example.com",
                22,
                "deploy",
                preference,
                Some(CredentialId::parse("credential-1").expect("credential")),
            )
            .expect("profile");
            assert_eq!(profile.credential_id(), None);
        }
    }

    #[test]
    fn rejects_blank_required_fields() {
        for (name, host, username, expected_field) in [
            ("", "example.com", "deploy", ProfileField::Name),
            ("Production", "   ", "deploy", ProfileField::Host),
            ("Production", "example.com", "\t", ProfileField::Username),
        ] {
            let error = ConnectionProfile::new(
                ProfileId::parse("profile-1").expect("fixture id must be valid"),
                name,
                host,
                22,
                username,
                AuthPreference::Password,
                None,
            )
            .expect_err("blank field must be rejected");

            assert_eq!(error.field(), expected_field);
        }
    }

    #[test]
    fn rejects_invalid_port_and_ambiguous_host_input() {
        let invalid_port = ConnectionProfile::new(
            ProfileId::parse("profile-1").expect("fixture id must be valid"),
            "Production",
            "example.com",
            0,
            "deploy",
            AuthPreference::Password,
            None,
        )
        .expect_err("port zero must be rejected");
        assert_eq!(invalid_port.field(), ProfileField::Port);

        let port_too_large = ConnectionProfile::new(
            ProfileId::parse("profile-1").expect("fixture id must be valid"),
            "Production",
            "example.com",
            65_536,
            "deploy",
            AuthPreference::Password,
            None,
        )
        .expect_err("ports above u16 range must be rejected");
        assert_eq!(port_too_large.field(), ProfileField::Port);

        let host_with_port = ConnectionProfile::new(
            ProfileId::parse("profile-1").expect("fixture id must be valid"),
            "Production",
            "example.com 22",
            22,
            "deploy",
            AuthPreference::Password,
            None,
        )
        .expect_err("host whitespace must be rejected");
        assert_eq!(host_with_port.field(), ProfileField::Host);
    }

    #[test]
    fn profile_id_rejects_empty_or_control_characters() {
        assert!(ProfileId::parse("").is_err());
        assert!(ProfileId::parse("profile\n1").is_err());
        assert_eq!(
            ProfileId::parse("profile-1").expect("valid id").as_str(),
            "profile-1"
        );
    }

    #[test]
    fn group_normalizes_its_name_and_profiles_belong_to_at_most_one_group() {
        let group_id = ProfileGroupId::parse("group-1").expect("valid group id");
        let group = ProfileGroup::new(group_id.clone(), " Production ").expect("valid group");
        let profile = valid_profile().with_group_id(Some(group_id));

        assert_eq!(group.name(), "Production");
        assert_eq!(profile.group_id(), Some(group.id()));
    }

    #[test]
    fn group_rejects_blank_or_overlong_names() {
        let group_id = ProfileGroupId::parse("group-1").expect("valid group id");
        assert!(ProfileGroup::new(group_id.clone(), "   ").is_err());
        assert!(ProfileGroup::new(group_id, "x".repeat(81)).is_err());
    }
}
