use std::path::Path;

pub const MAX_GIT_PATH_BYTES: usize = 4096;
pub const MAX_COMMIT_MESSAGE_CHARS: usize = 10_000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RemoteGitAction {
    Snapshot {
        path: String,
    },
    Initialize {
        path: String,
    },
    Stage {
        repository: String,
        paths: Vec<String>,
    },
    StageAll {
        repository: String,
    },
    Unstage {
        repository: String,
        paths: Vec<String>,
    },
    UnstageAll {
        repository: String,
    },
    Commit {
        repository: String,
        message: String,
    },
    CreateBranch {
        repository: String,
        name: String,
    },
    CreateBranchFrom {
        repository: String,
        name: String,
        source_ref: String,
    },
    RenameBranch {
        repository: String,
        ref_name: String,
        new_name: String,
    },
    DeleteBranch {
        repository: String,
        ref_name: String,
    },
    SwitchBranch {
        repository: String,
        name: String,
    },
    Fetch {
        repository: String,
    },
    Pull {
        repository: String,
    },
    Push {
        repository: String,
        remote: Option<String>,
    },
    TrackRemoteBranch {
        repository: String,
        ref_name: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHead {
    pub name: Option<String>,
    pub oid: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitChange {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub staged: bool,
    pub conflict: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitBranchKind {
    Local,
    Remote,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitBranch {
    pub ref_name: String,
    pub name: String,
    pub kind: GitBranchKind,
    pub oid: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub upstream_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitCommit {
    pub oid: String,
    pub parents: Vec<String>,
    pub decorations: Vec<String>,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitCommitFile {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitSnapshot {
    pub repository_path: String,
    pub repository_name: String,
    pub head: GitHead,
    pub changes: Vec<GitChange>,
    pub branches: Vec<GitBranch>,
    pub remotes: Vec<String>,
    pub commits: Vec<GitCommit>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitError {
    Missing,
    InvalidPath,
    NotRepository,
    InvalidInput,
    Conflict(String),
    Timeout,
    OutputTooLarge,
    CommandFailed(String),
    PermissionDenied,
    UnsupportedRemote,
    SessionUnavailable,
    Io,
}

impl RemoteGitAction {
    pub fn validate(&self) -> Result<(), GitError> {
        match self {
            Self::Snapshot { path } | Self::Initialize { path } => {
                validate_remote_repository_path(path)
            }
            Self::Stage { repository, paths } | Self::Unstage { repository, paths } => {
                validate_remote_repository_path(repository)?;
                validate_paths(paths)
            }
            Self::StageAll { repository } | Self::UnstageAll { repository } => {
                validate_remote_repository_path(repository)
            }
            Self::Fetch { repository } | Self::Pull { repository } => {
                validate_remote_repository_path(repository)
            }
            Self::Push { repository, remote } => {
                validate_remote_repository_path(repository)?;
                if let Some(remote) = remote {
                    validate_remote_name(remote)?;
                }
                Ok(())
            }
            Self::Commit {
                repository,
                message,
            } => {
                validate_remote_repository_path(repository)?;
                validate_commit_message(message)
            }
            Self::CreateBranch { repository, name } | Self::SwitchBranch { repository, name } => {
                validate_remote_repository_path(repository)?;
                validate_branch_name(name)
            }
            Self::CreateBranchFrom {
                repository,
                name,
                source_ref,
            } => {
                validate_remote_repository_path(repository)?;
                validate_branch_name(name)?;
                validate_branch_source_ref(source_ref)
            }
            Self::RenameBranch {
                repository,
                ref_name,
                new_name,
            } => {
                validate_remote_repository_path(repository)?;
                validate_local_branch_ref(ref_name)?;
                validate_branch_name(new_name)
            }
            Self::DeleteBranch {
                repository,
                ref_name,
            } => {
                validate_remote_repository_path(repository)?;
                validate_local_branch_ref(ref_name)
            }
            Self::TrackRemoteBranch {
                repository,
                ref_name,
            } => {
                validate_remote_repository_path(repository)?;
                validate_remote_branch_ref(ref_name)
            }
        }
    }
}

pub fn validate_repository_path(path: &Path) -> Result<(), GitError> {
    let value = path.to_string_lossy();
    if !path.is_absolute()
        || value.is_empty()
        || value.len() > MAX_GIT_PATH_BYTES
        || value.chars().any(char::is_control)
    {
        return Err(GitError::InvalidPath);
    }
    Ok(())
}

pub fn validate_remote_repository_path(path: &str) -> Result<(), GitError> {
    if path.is_empty() || path.len() > MAX_GIT_PATH_BYTES || path.contains('\0') {
        Err(GitError::InvalidPath)
    } else {
        Ok(())
    }
}

pub fn validate_branch_name(name: &str) -> Result<(), GitError> {
    if name.is_empty()
        || name.len() > 255
        || name.starts_with('-')
        || name.ends_with('.')
        || name.contains("..")
        || name.contains("@{")
        || name.chars().any(|character| {
            character.is_control()
                || character.is_whitespace()
                || matches!(character, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
        })
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

pub fn validate_remote_branch_ref(ref_name: &str) -> Result<(), GitError> {
    let Some(name) = ref_name.strip_prefix("refs/remotes/") else {
        return Err(GitError::InvalidInput);
    };
    let Some((remote, branch)) = name.split_once('/') else {
        return Err(GitError::InvalidInput);
    };
    if remote.is_empty() || branch.is_empty() {
        return Err(GitError::InvalidInput);
    }
    validate_branch_name(name)
}

pub fn validate_local_branch_ref(ref_name: &str) -> Result<(), GitError> {
    let Some(name) = ref_name.strip_prefix("refs/heads/") else {
        return Err(GitError::InvalidInput);
    };
    validate_branch_name(name)
}

pub fn validate_branch_source_ref(ref_name: &str) -> Result<(), GitError> {
    if ref_name.starts_with("refs/heads/") {
        validate_local_branch_ref(ref_name)
    } else {
        validate_remote_branch_ref(ref_name)
    }
}

pub fn validate_remote_name(name: &str) -> Result<(), GitError> {
    validate_branch_name(name)
}

pub fn find_tracking_local_branch<'a>(
    branches: &'a [GitBranch],
    remote_ref_name: &str,
) -> Option<&'a GitBranch> {
    branches.iter().find(|branch| {
        branch.kind == GitBranchKind::Local
            && branch.upstream_ref.as_deref() == Some(remote_ref_name)
    })
}

pub fn validate_commit_message(message: &str) -> Result<(), GitError> {
    if message.trim().is_empty()
        || message.chars().count() > MAX_COMMIT_MESSAGE_CHARS
        || message.contains('\0')
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

pub fn validate_commit_oid(oid: &str) -> Result<(), GitError> {
    if matches!(oid.len(), 40 | 64) && oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(GitError::InvalidInput)
    }
}

pub fn validate_paths(paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty()
        || paths.len() > 10_000
        || paths.iter().any(|path| {
            path.is_empty()
                || path.len() > MAX_GIT_PATH_BYTES
                || path.contains('\0')
                || Path::new(path).is_absolute()
        })
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        RemoteGitAction, validate_branch_name, validate_branch_source_ref, validate_commit_message,
        validate_commit_oid, validate_local_branch_ref, validate_paths, validate_remote_branch_ref,
        validate_remote_name,
    };

    #[test]
    fn rejects_branch_and_path_values_that_can_change_git_argument_meaning() {
        for value in [
            "",
            "-force",
            "feature bad",
            "a..b",
            "topic@{1}",
            "bad\\name",
        ] {
            assert!(validate_branch_name(value).is_err(), "{value}");
        }
        assert!(validate_branch_name("feature/中文-path").is_ok());
        assert!(validate_paths(&["-leading.txt".into(), "dir/空 格.txt".into()]).is_ok());
        assert!(validate_paths(&["C:/absolute.txt".into()]).is_err());
    }

    #[test]
    fn commit_message_must_be_non_empty_and_bounded() {
        assert!(validate_commit_message("  ").is_err());
        assert!(validate_commit_message("feat: Git 管理").is_ok());
        assert!(validate_commit_message(&"x".repeat(10_001)).is_err());
    }

    #[test]
    fn commit_oid_must_be_a_full_sha1_or_sha256_identifier() {
        assert!(validate_commit_oid("0123456789abcdef0123456789abcdef01234567").is_ok());
        assert!(validate_commit_oid(&"a".repeat(64)).is_ok());
        for value in [
            "abc123",
            "HEAD",
            "-deadbeef",
            "0123456789abcdef0123456789abcdef0123456g",
        ] {
            assert!(validate_commit_oid(value).is_err(), "{value}");
        }
    }

    #[test]
    fn remote_branch_refs_are_full_validated_tracking_refs() {
        assert!(validate_remote_branch_ref("refs/remotes/origin/feature/test").is_ok());
        for value in [
            "origin/feature/test",
            "refs/heads/feature/test",
            "refs/remotes/origin",
            "refs/remotes//main",
        ] {
            assert!(validate_remote_branch_ref(value).is_err(), "{value}");
        }
    }

    #[test]
    fn lifecycle_refs_and_remote_names_are_closed_business_values() {
        for value in ["refs/heads/main", "refs/remotes/origin/feature/test"] {
            assert!(validate_branch_source_ref(value).is_ok(), "{value}");
        }
        for value in ["main", "HEAD", "refs/tags/v1", "refs/remotes/origin"] {
            assert!(validate_branch_source_ref(value).is_err(), "{value}");
        }
        assert!(validate_local_branch_ref("refs/heads/feature/test").is_ok());
        assert!(validate_local_branch_ref("refs/remotes/origin/main").is_err());
        for value in ["origin", "company-mirror", "team/upstream"] {
            assert!(validate_remote_name(value).is_ok(), "{value}");
        }
        for value in [
            "",
            "-force",
            "origin bad",
            "https://user:secret@example.com/repo",
        ] {
            assert!(validate_remote_name(value).is_err(), "{value}");
        }
    }

    #[test]
    fn remote_actions_allow_posix_paths_but_reject_nul_and_unvalidated_payloads() {
        assert!(
            RemoteGitAction::Snapshot {
                path: "/srv/it's\nrepo".into()
            }
            .validate()
            .is_ok()
        );
        assert!(
            RemoteGitAction::Snapshot {
                path: "/srv/bad\0repo".into()
            }
            .validate()
            .is_err()
        );
        assert!(
            RemoteGitAction::Commit {
                repository: "/srv/repo".into(),
                message: "\0".into()
            }
            .validate()
            .is_err()
        );
        assert!(
            RemoteGitAction::CreateBranch {
                repository: "/srv/repo".into(),
                name: "-delete".into()
            }
            .validate()
            .is_err()
        );
        assert!(
            RemoteGitAction::Fetch {
                repository: "/srv/repo".into()
            }
            .validate()
            .is_ok()
        );
        assert!(
            RemoteGitAction::TrackRemoteBranch {
                repository: "/srv/repo".into(),
                ref_name: "refs/heads/main".into()
            }
            .validate()
            .is_err()
        );
        assert!(
            RemoteGitAction::CreateBranchFrom {
                repository: "/srv/repo".into(),
                name: "feature/new".into(),
                source_ref: "refs/remotes/origin/main".into(),
            }
            .validate()
            .is_ok()
        );
        assert!(
            RemoteGitAction::Push {
                repository: "/srv/repo".into(),
                remote: Some("https://user:secret@example.com/repo".into()),
            }
            .validate()
            .is_err()
        );
    }
}
