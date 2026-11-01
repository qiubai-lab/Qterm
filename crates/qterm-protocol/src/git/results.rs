use qterm_core::domain::{
    files::{DirectoryListing, FileEntry},
    git::*,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIpcError {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotDto {
    pub repository_path: String,
    pub repository_name: String,
    pub head: GitHeadDto,
    pub changes: Vec<GitChangeDto>,
    pub submodules: Vec<GitSubmoduleDto>,
    pub branches: Vec<GitBranchDto>,
    pub remotes: Vec<String>,
    pub commits: Vec<GitCommitDto>,
    pub merge_in_progress: bool,
    pub merge_head_oid: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHeadDto {
    pub name: Option<String>,
    pub oid: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeDto {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub staged: bool,
    pub conflict: bool,
    pub conflict_kind: Option<GitConflictKindDto>,
    pub submodule: Option<GitSubmoduleChangeDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSubmoduleChangeDto {
    pub commit_changed: bool,
    pub tracked_modified: bool,
    pub untracked_content: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSubmoduleDto {
    pub name: String,
    pub path: String,
    pub recorded_oid: Option<String>,
    pub current_oid: Option<String>,
    pub initialized: bool,
    pub commit_changed: bool,
    pub tracked_modified: bool,
    pub untracked_content: bool,
    pub conflict: bool,
    pub issue: Option<GitSubmoduleIssueDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitSubmoduleIssueDto {
    MissingConfiguration,
    MissingGitlink,
    DuplicatePath,
    InvalidPath,
    Unreadable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitConflictKindDto {
    BothModified,
    BothAdded,
    CurrentDeleted,
    IncomingDeleted,
    BothDeleted,
    Other,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitConflictContentKindDto {
    Missing,
    Text,
    Binary,
    Unsupported,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictVersionDto {
    pub kind: GitConflictContentKindDto,
    pub content: Option<String>,
    pub size: u64,
    pub mode: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictResultDto {
    pub kind: GitConflictContentKindDto,
    pub content: Option<String>,
    pub revision: String,
    pub size: u64,
    pub mode: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictDetailDto {
    pub path: String,
    pub kind: GitConflictKindDto,
    pub base: GitConflictVersionDto,
    pub current: GitConflictVersionDto,
    pub incoming: GitConflictVersionDto,
    pub result: GitConflictResultDto,
    pub editable: bool,
    pub unsupported_reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitDiffScopeDto {
    Staged,
    Unstaged,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitDiffSourceDto {
    Head,
    Index,
    Worktree,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeDiffDto {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub scope: GitDiffScopeDto,
    pub before_source: GitDiffSourceDto,
    pub after_source: GitDiffSourceDto,
    pub before: GitConflictVersionDto,
    pub after: GitConflictVersionDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFileDiffDto {
    pub commit_oid: String,
    pub parent_oid: Option<String>,
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub before: GitConflictVersionDto,
    pub after: GitConflictVersionDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchDto {
    pub ref_name: String,
    pub name: String,
    pub kind: GitBranchKindDto,
    pub oid: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub upstream_ref: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitBranchKindDto {
    Local,
    Remote,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDto {
    pub oid: String,
    pub parents: Vec<String>,
    pub decorations: Vec<String>,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFileDto {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDirectoryListingDto {
    pub path: String,
    pub entries: Vec<GitDirectoryEntryDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDirectoryEntryDto {
    pub name: String,
    pub path: String,
    pub is_symlink: bool,
    pub modified_at: Option<u64>,
    pub permission_mode: Option<u32>,
}

impl From<DirectoryListing> for GitDirectoryListingDto {
    fn from(value: DirectoryListing) -> Self {
        Self {
            path: value.path,
            entries: value
                .entries
                .into_iter()
                .filter(|entry| entry.is_directory)
                .map(GitDirectoryEntryDto::from)
                .collect(),
        }
    }
}

impl From<FileEntry> for GitDirectoryEntryDto {
    fn from(value: FileEntry) -> Self {
        Self {
            name: value.name,
            path: value.path,
            is_symlink: value.is_symlink,
            modified_at: value.modified_at,
            permission_mode: value.permission_mode,
        }
    }
}

impl From<GitError> for GitIpcError {
    fn from(error: GitError) -> Self {
        let (code, message, retryable) = match error {
            GitError::Missing => (
                "gitMissing",
                "目标环境中未找到 Git，请安装 Git 后重试".into(),
                false,
            ),
            GitError::InvalidPath => ("invalidGitPath", "请选择有效的 Git 工作目录".into(), false),
            GitError::NotRepository => (
                "notGitRepository",
                "所选目录尚未初始化为 Git 仓库".into(),
                false,
            ),
            GitError::InvalidInput => ("invalidGitInput", "Git 操作输入无效".into(), false),
            GitError::Conflict(detail) => (
                "gitConflict",
                if detail.is_empty() {
                    "Git 拒绝了会覆盖现有更改的操作".into()
                } else {
                    detail
                },
                false,
            ),
            GitError::Timeout => ("gitTimeout", "Git 操作超时，已终止进程".into(), true),
            GitError::OutputTooLarge => (
                "gitOutputTooLarge",
                "仓库状态输出过大，请缩小操作范围后重试".into(),
                true,
            ),
            GitError::CommandFailed(detail) => (
                "gitCommandFailed",
                if detail.is_empty() {
                    "Git 操作失败".into()
                } else {
                    detail
                },
                true,
            ),
            GitError::PermissionDenied => (
                "gitPermissionDenied",
                "远程路径或 Git 仓库权限不足".into(),
                false,
            ),
            GitError::UnsupportedRemote => (
                "gitUnsupportedRemote",
                "远程主机需要 POSIX shell 和 Git 2.25 或更高版本".into(),
                false,
            ),
            GitError::SessionUnavailable => (
                "gitSessionUnavailable",
                "远程 Git 连接不可用，请重新连接".into(),
                true,
            ),
            GitError::Io => ("gitUnavailable", "暂时无法执行 Git 操作".into(), true),
        };
        Self {
            code,
            message,
            retryable,
        }
    }
}

impl From<GitSnapshot> for GitSnapshotDto {
    fn from(value: GitSnapshot) -> Self {
        Self {
            repository_path: value.repository_path,
            repository_name: value.repository_name,
            head: value.head.into(),
            changes: value.changes.into_iter().map(Into::into).collect(),
            submodules: value.submodules.into_iter().map(Into::into).collect(),
            branches: value.branches.into_iter().map(Into::into).collect(),
            remotes: value.remotes,
            commits: value.commits.into_iter().map(Into::into).collect(),
            merge_in_progress: value.merge_in_progress,
            merge_head_oid: value.merge_head_oid,
        }
    }
}

impl From<GitHead> for GitHeadDto {
    fn from(value: GitHead) -> Self {
        Self {
            name: value.name,
            oid: value.oid,
            detached: value.detached,
            unborn: value.unborn,
            upstream: value.upstream,
            ahead: value.ahead,
            behind: value.behind,
        }
    }
}

impl From<GitChange> for GitChangeDto {
    fn from(value: GitChange) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            staged: value.staged,
            conflict: value.conflict,
            conflict_kind: value.conflict_kind.map(Into::into),
            submodule: value.submodule.map(Into::into),
        }
    }
}

impl From<GitSubmoduleChange> for GitSubmoduleChangeDto {
    fn from(value: GitSubmoduleChange) -> Self {
        Self {
            commit_changed: value.commit_changed,
            tracked_modified: value.tracked_modified,
            untracked_content: value.untracked_content,
        }
    }
}

impl From<GitSubmodule> for GitSubmoduleDto {
    fn from(value: GitSubmodule) -> Self {
        Self {
            name: value.name,
            path: value.path,
            recorded_oid: value.recorded_oid,
            current_oid: value.current_oid,
            initialized: value.initialized,
            commit_changed: value.commit_changed,
            tracked_modified: value.tracked_modified,
            untracked_content: value.untracked_content,
            conflict: value.conflict,
            issue: value.issue.map(Into::into),
        }
    }
}

impl From<GitSubmoduleIssue> for GitSubmoduleIssueDto {
    fn from(value: GitSubmoduleIssue) -> Self {
        match value {
            GitSubmoduleIssue::MissingConfiguration => Self::MissingConfiguration,
            GitSubmoduleIssue::MissingGitlink => Self::MissingGitlink,
            GitSubmoduleIssue::DuplicatePath => Self::DuplicatePath,
            GitSubmoduleIssue::InvalidPath => Self::InvalidPath,
            GitSubmoduleIssue::Unreadable => Self::Unreadable,
        }
    }
}

impl From<GitConflictKind> for GitConflictKindDto {
    fn from(value: GitConflictKind) -> Self {
        match value {
            GitConflictKind::BothModified => Self::BothModified,
            GitConflictKind::BothAdded => Self::BothAdded,
            GitConflictKind::CurrentDeleted => Self::CurrentDeleted,
            GitConflictKind::IncomingDeleted => Self::IncomingDeleted,
            GitConflictKind::BothDeleted => Self::BothDeleted,
            GitConflictKind::Other => Self::Other,
        }
    }
}

impl From<GitConflictContentKind> for GitConflictContentKindDto {
    fn from(value: GitConflictContentKind) -> Self {
        match value {
            GitConflictContentKind::Missing => Self::Missing,
            GitConflictContentKind::Text => Self::Text,
            GitConflictContentKind::Binary => Self::Binary,
            GitConflictContentKind::Unsupported => Self::Unsupported,
        }
    }
}

impl From<GitConflictVersion> for GitConflictVersionDto {
    fn from(value: GitConflictVersion) -> Self {
        Self {
            kind: value.kind.into(),
            content: value.content,
            size: value.size,
            mode: value.mode,
        }
    }
}

impl From<GitConflictResult> for GitConflictResultDto {
    fn from(value: GitConflictResult) -> Self {
        Self {
            kind: value.kind.into(),
            content: value.content,
            revision: value.revision,
            size: value.size,
            mode: value.mode,
        }
    }
}

impl From<GitConflictDetail> for GitConflictDetailDto {
    fn from(value: GitConflictDetail) -> Self {
        Self {
            path: value.path,
            kind: value.kind.into(),
            base: value.base.into(),
            current: value.current.into(),
            incoming: value.incoming.into(),
            result: value.result.into(),
            editable: value.editable,
            unsupported_reason: value.unsupported_reason,
        }
    }
}

impl From<GitDiffScope> for GitDiffScopeDto {
    fn from(value: GitDiffScope) -> Self {
        match value {
            GitDiffScope::Staged => Self::Staged,
            GitDiffScope::Unstaged => Self::Unstaged,
        }
    }
}

impl From<GitDiffSource> for GitDiffSourceDto {
    fn from(value: GitDiffSource) -> Self {
        match value {
            GitDiffSource::Head => Self::Head,
            GitDiffSource::Index => Self::Index,
            GitDiffSource::Worktree => Self::Worktree,
        }
    }
}

impl From<GitChangeDiff> for GitChangeDiffDto {
    fn from(value: GitChangeDiff) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            scope: value.scope.into(),
            before_source: value.before_source.into(),
            after_source: value.after_source.into(),
            before: value.before.into(),
            after: value.after.into(),
        }
    }
}

impl From<GitCommitFileDiff> for GitCommitFileDiffDto {
    fn from(value: GitCommitFileDiff) -> Self {
        Self {
            commit_oid: value.commit_oid,
            parent_oid: value.parent_oid,
            path: value.path,
            original_path: value.original_path,
            status: value.status,
            before: value.before.into(),
            after: value.after.into(),
        }
    }
}

impl From<GitBranch> for GitBranchDto {
    fn from(value: GitBranch) -> Self {
        Self {
            ref_name: value.ref_name,
            name: value.name,
            kind: value.kind.into(),
            oid: value.oid,
            current: value.current,
            upstream: value.upstream,
            upstream_ref: value.upstream_ref,
        }
    }
}

impl From<GitBranchKind> for GitBranchKindDto {
    fn from(value: GitBranchKind) -> Self {
        match value {
            GitBranchKind::Local => Self::Local,
            GitBranchKind::Remote => Self::Remote,
        }
    }
}

impl From<GitCommit> for GitCommitDto {
    fn from(value: GitCommit) -> Self {
        Self {
            oid: value.oid,
            parents: value.parents,
            decorations: value.decorations,
            subject: value.subject,
            body: value.body,
            author: value.author,
            timestamp: value.timestamp,
        }
    }
}

impl From<GitCommitFile> for GitCommitFileDto {
    fn from(value: GitCommitFile) -> Self {
        Self {
            path: value.path,
            original_path: value.original_path,
            status: value.status,
        }
    }
}
