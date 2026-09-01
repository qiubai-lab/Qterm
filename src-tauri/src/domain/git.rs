use std::path::{Component, Path};

pub const MAX_GIT_PATH_BYTES: usize = 4096;
pub const MAX_COMMIT_MESSAGE_CHARS: usize = 10_000;
pub const MAX_CONFLICT_TEXT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_GIT_DIFF_TEXT_BYTES: usize = MAX_CONFLICT_TEXT_BYTES;

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
    CreateBranchFromCommit {
        repository: String,
        name: String,
        oid: String,
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
    MergeBranch {
        repository: String,
        source_ref: String,
    },
    ContinueMerge {
        repository: String,
    },
    AbortMerge {
        repository: String,
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
    pub conflict_kind: Option<GitConflictKind>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitDiffScope {
    Staged,
    Unstaged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitDiffSource {
    Head,
    Index,
    Worktree,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitChangeDiff {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub scope: GitDiffScope,
    pub before_source: GitDiffSource,
    pub after_source: GitDiffSource,
    pub before: GitConflictVersion,
    pub after: GitConflictVersion,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitCommitFileDiff {
    pub commit_oid: String,
    pub parent_oid: Option<String>,
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub before: GitConflictVersion,
    pub after: GitConflictVersion,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitConflictKind {
    BothModified,
    BothAdded,
    CurrentDeleted,
    IncomingDeleted,
    BothDeleted,
    Other,
}

impl GitConflictKind {
    pub fn from_xy(xy: &str) -> Self {
        match xy {
            "UU" => Self::BothModified,
            "AA" => Self::BothAdded,
            "DU" => Self::CurrentDeleted,
            "UD" => Self::IncomingDeleted,
            "DD" => Self::BothDeleted,
            _ => Self::Other,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitConflictContentKind {
    Missing,
    Text,
    Binary,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitConflictVersion {
    pub kind: GitConflictContentKind,
    pub content: Option<String>,
    pub size: u64,
    pub mode: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitConflictResult {
    pub kind: GitConflictContentKind,
    pub content: Option<String>,
    pub revision: String,
    pub size: u64,
    pub mode: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitConflictDetail {
    pub path: String,
    pub kind: GitConflictKind,
    pub base: GitConflictVersion,
    pub current: GitConflictVersion,
    pub incoming: GitConflictVersion,
    pub result: GitConflictResult,
    pub editable: bool,
    pub unsupported_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitConflictResolution {
    SaveText {
        content: String,
        expected_revision: String,
    },
    UseCurrent,
    UseIncoming,
    Delete,
    MarkResolved,
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
    pub merge_in_progress: bool,
    pub merge_head_oid: Option<String>,
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
                validate_posix_paths(paths)
            }
            Self::StageAll { repository }
            | Self::UnstageAll { repository }
            | Self::ContinueMerge { repository }
            | Self::AbortMerge { repository } => validate_remote_repository_path(repository),
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
            Self::CreateBranchFromCommit {
                repository,
                name,
                oid,
            } => {
                validate_remote_repository_path(repository)?;
                validate_branch_name(name)?;
                validate_commit_oid(oid)
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
            Self::MergeBranch {
                repository,
                source_ref,
            } => {
                validate_remote_repository_path(repository)?;
                validate_branch_source_ref(source_ref)
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

pub fn validate_merge_preconditions(
    snapshot: &GitSnapshot,
    source_ref: &str,
) -> Result<(), GitError> {
    validate_branch_source_ref(source_ref)?;
    if snapshot.head.detached || snapshot.head.unborn {
        return Err(GitError::Conflict(
            "当前 HEAD 未指向可合并的本地分支".into(),
        ));
    }
    if snapshot.merge_in_progress {
        return Err(GitError::Conflict("当前仓库已有未完成的合并".into()));
    }
    if !snapshot.changes.is_empty() {
        return Err(GitError::Conflict(
            "开始合并前请先提交或清理工作区更改".into(),
        ));
    }
    let current = snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.current)
        .ok_or_else(|| GitError::Conflict("当前 HEAD 未指向可合并的本地分支".into()))?;
    if current.ref_name == source_ref {
        return Err(GitError::Conflict("不能将当前分支合并到自身".into()));
    }
    if !snapshot
        .branches
        .iter()
        .any(|branch| branch.ref_name == source_ref)
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

pub fn validate_continue_merge(snapshot: &GitSnapshot) -> Result<(), GitError> {
    if !snapshot.merge_in_progress {
        return Err(GitError::Conflict("当前仓库没有未完成的合并".into()));
    }
    if snapshot.changes.iter().any(|change| change.conflict) {
        return Err(GitError::Conflict(
            "仍有未解决的冲突，解决并暂存后才能继续合并".into(),
        ));
    }
    Ok(())
}

pub fn validate_stage_all(snapshot: &GitSnapshot) -> Result<(), GitError> {
    if snapshot.merge_in_progress && snapshot.changes.iter().any(|change| change.conflict) {
        Err(GitError::Conflict(
            "合并冲突必须逐项确认，不能使用暂存全部批量标记".into(),
        ))
    } else {
        Ok(())
    }
}

pub fn validate_abort_merge(snapshot: &GitSnapshot) -> Result<(), GitError> {
    if snapshot.merge_in_progress {
        Ok(())
    } else {
        Err(GitError::Conflict("当前仓库没有未完成的合并".into()))
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

pub fn validate_conflict_resolution(resolution: &GitConflictResolution) -> Result<(), GitError> {
    if let GitConflictResolution::SaveText {
        content,
        expected_revision,
    } = resolution
        && (content.len() > MAX_CONFLICT_TEXT_BYTES
            || content.contains('\0')
            || expected_revision.is_empty()
            || expected_revision.len() > 128
            || expected_revision.chars().any(char::is_control))
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

fn validate_path_list(paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty()
        || paths.len() > 10_000
        || paths
            .iter()
            .any(|path| path.is_empty() || path.len() > MAX_GIT_PATH_BYTES || path.contains('\0'))
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

pub fn validate_local_paths(paths: &[String]) -> Result<(), GitError> {
    validate_path_list(paths)?;
    if paths.iter().any(|path| {
        Path::new(path).components().any(|component| {
            matches!(
                component,
                Component::Prefix(_) | Component::RootDir | Component::ParentDir
            )
        })
    }) {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

pub fn validate_posix_paths(paths: &[String]) -> Result<(), GitError> {
    validate_path_list(paths)?;
    if paths
        .iter()
        .any(|path| path.starts_with('/') || path.split('/').any(|segment| segment == ".."))
    {
        return Err(GitError::InvalidInput);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        GitBranch, GitBranchKind, GitConflictKind, GitConflictResolution, GitHead, GitSnapshot,
        RemoteGitAction, validate_branch_name, validate_branch_source_ref, validate_commit_message,
        validate_commit_oid, validate_conflict_resolution, validate_local_branch_ref,
        validate_local_paths, validate_merge_preconditions, validate_posix_paths,
        validate_remote_branch_ref, validate_remote_name, validate_stage_all,
    };
    use std::path::Path;

    #[test]
    fn rejects_branch_values_that_can_change_git_argument_meaning() {
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
    }

    #[test]
    fn local_git_paths_follow_host_repository_relative_semantics() {
        let absolute = env!("CARGO_MANIFEST_DIR").to_owned();
        assert!(Path::new(&absolute).is_absolute(), "{absolute}");
        assert!(validate_local_paths(&[absolute]).is_err());
        assert!(validate_local_paths(&["../outside.txt".into()]).is_err());
        assert!(validate_local_paths(&["dir/../outside.txt".into()]).is_err());
        assert!(
            validate_local_paths(&[
                "-leading.txt".into(),
                "dir/空 格.txt".into(),
                "[ab].txt".into(),
            ])
            .is_ok()
        );

        #[cfg(not(windows))]
        assert!(validate_local_paths(&["C:/absolute.txt".into()]).is_ok());

        #[cfg(windows)]
        for path in [
            "C:/absolute.txt",
            r"C:\absolute.txt",
            r"C:drive-relative.txt",
            r"\rooted.txt",
            r"\\server\share\file.txt",
        ] {
            assert!(validate_local_paths(&[path.into()]).is_err(), "{path}");
        }
    }

    #[test]
    fn remote_git_paths_use_stable_posix_repository_relative_semantics() {
        assert!(
            validate_posix_paths(&[
                "C:/absolute.txt".into(),
                "-leading.txt".into(),
                "dir/空 格.txt".into(),
            ])
            .is_ok()
        );
        for path in ["/absolute.txt", "../outside.txt", "dir/../outside.txt"] {
            assert!(validate_posix_paths(&[path.into()]).is_err(), "{path}");
            assert!(
                RemoteGitAction::Stage {
                    repository: "/srv/repo".into(),
                    paths: vec![path.into()],
                }
                .validate()
                .is_err(),
                "{path}"
            );
        }
        assert!(
            RemoteGitAction::Stage {
                repository: "/srv/repo".into(),
                paths: vec!["C:/absolute.txt".into()],
            }
            .validate()
            .is_ok()
        );
    }

    #[test]
    fn git_path_lists_preserve_bounded_payload_rules() {
        for validate in [
            validate_local_paths as fn(&[String]) -> Result<(), super::GitError>,
            validate_posix_paths,
        ] {
            assert!(validate(&[]).is_err());
            assert!(validate(&["bad\0path".into()]).is_err());
            assert!(validate(&["x".repeat(super::MAX_GIT_PATH_BYTES + 1)]).is_err());
            assert!(validate(&vec!["path".into(); 10_001]).is_err());
        }
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
    fn conflict_kinds_and_text_resolutions_are_closed_and_bounded() {
        for (xy, expected) in [
            ("UU", GitConflictKind::BothModified),
            ("AA", GitConflictKind::BothAdded),
            ("DU", GitConflictKind::CurrentDeleted),
            ("UD", GitConflictKind::IncomingDeleted),
            ("DD", GitConflictKind::BothDeleted),
            ("AU", GitConflictKind::Other),
        ] {
            assert_eq!(GitConflictKind::from_xy(xy), expected, "{xy}");
        }

        assert!(
            validate_conflict_resolution(&GitConflictResolution::SaveText {
                content: "resolved\n".into(),
                expected_revision: "sha256:fixture".into(),
            })
            .is_ok()
        );
        for resolution in [
            GitConflictResolution::SaveText {
                content: "x".repeat(super::MAX_CONFLICT_TEXT_BYTES + 1),
                expected_revision: "revision".into(),
            },
            GitConflictResolution::SaveText {
                content: "bad\0content".into(),
                expected_revision: "revision".into(),
            },
            GitConflictResolution::SaveText {
                content: "resolved".into(),
                expected_revision: String::new(),
            },
        ] {
            assert!(validate_conflict_resolution(&resolution).is_err());
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
            RemoteGitAction::CreateBranchFromCommit {
                repository: "/srv/repo".into(),
                name: "feature/history".into(),
                oid: "0123456789abcdef0123456789abcdef01234567".into(),
            }
            .validate()
            .is_ok()
        );
        for oid in ["abcdef0", "HEAD", "--orphan", "0123456789abcdef^{commit}"] {
            assert!(
                RemoteGitAction::CreateBranchFromCommit {
                    repository: "/srv/repo".into(),
                    name: "feature/history".into(),
                    oid: oid.into(),
                }
                .validate()
                .is_err(),
                "{oid}"
            );
        }
        assert!(
            RemoteGitAction::Push {
                repository: "/srv/repo".into(),
                remote: Some("https://user:secret@example.com/repo".into()),
            }
            .validate()
            .is_err()
        );
        assert!(
            RemoteGitAction::MergeBranch {
                repository: "/srv/repo".into(),
                source_ref: "refs/remotes/origin/feature/test".into(),
            }
            .validate()
            .is_ok()
        );
        assert!(
            RemoteGitAction::MergeBranch {
                repository: "/srv/repo".into(),
                source_ref: "--strategy=ours".into(),
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn merge_preconditions_require_a_clean_current_branch_and_distinct_existing_source() {
        let snapshot = merge_snapshot();
        assert!(validate_merge_preconditions(&snapshot, "refs/heads/feature/test").is_ok());
        assert!(
            validate_merge_preconditions(&snapshot, "refs/remotes/origin/feature/test").is_ok()
        );
        for source in ["refs/heads/main", "refs/heads/missing", "refs/tags/v1"] {
            assert!(
                validate_merge_preconditions(&snapshot, source).is_err(),
                "{source}"
            );
        }

        let mut dirty = snapshot.clone();
        dirty.changes.push(super::GitChange {
            path: "dirty.txt".into(),
            original_path: None,
            status: "U".into(),
            staged: false,
            conflict: false,
            conflict_kind: None,
        });
        assert!(validate_merge_preconditions(&dirty, "refs/heads/feature/test").is_err());

        let mut merging = snapshot.clone();
        merging.merge_in_progress = true;
        assert!(validate_merge_preconditions(&merging, "refs/heads/feature/test").is_err());

        let mut conflicted = merging.clone();
        conflicted.changes.push(super::GitChange {
            path: "conflict.txt".into(),
            original_path: None,
            status: "U".into(),
            staged: false,
            conflict: true,
            conflict_kind: Some(GitConflictKind::BothModified),
        });
        assert!(validate_stage_all(&conflicted).is_err());
        conflicted.changes[0].conflict = false;
        assert!(validate_stage_all(&conflicted).is_ok());

        let mut detached = snapshot;
        detached.head.detached = true;
        assert!(validate_merge_preconditions(&detached, "refs/heads/feature/test").is_err());

        let mut unborn = merge_snapshot();
        unborn.head.unborn = true;
        unborn.head.oid = None;
        assert!(validate_merge_preconditions(&unborn, "refs/heads/feature/test").is_err());
    }

    fn merge_snapshot() -> GitSnapshot {
        let branch = |ref_name: &str, name: &str, kind, current| GitBranch {
            ref_name: ref_name.into(),
            name: name.into(),
            kind,
            oid: "0123456789abcdef0123456789abcdef01234567".into(),
            current,
            upstream: None,
            upstream_ref: None,
        };
        GitSnapshot {
            repository_path: "/srv/repo".into(),
            repository_name: "repo".into(),
            head: GitHead {
                name: Some("main".into()),
                oid: Some("0123456789abcdef0123456789abcdef01234567".into()),
                detached: false,
                unborn: false,
                upstream: None,
                ahead: 0,
                behind: 0,
            },
            changes: Vec::new(),
            branches: vec![
                branch("refs/heads/main", "main", GitBranchKind::Local, true),
                branch(
                    "refs/heads/feature/test",
                    "feature/test",
                    GitBranchKind::Local,
                    false,
                ),
                branch(
                    "refs/remotes/origin/feature/test",
                    "origin/feature/test",
                    GitBranchKind::Remote,
                    false,
                ),
            ],
            remotes: vec!["origin".into()],
            commits: Vec::new(),
            merge_in_progress: false,
            merge_head_oid: None,
        }
    }
}
