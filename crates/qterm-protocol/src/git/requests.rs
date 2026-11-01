use qterm_core::domain::git::{GitConflictResolution, RemoteGitAction};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDirectoryInput {
    pub initial_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPathInput {
    pub path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitRepositoryInput {
    pub repository: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPathsInput {
    pub repository: String,
    pub paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitSubmoduleInput {
    pub repository: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitCommitInput {
    pub repository: String,
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCommitFilesInput {
    pub repository: String,
    pub oid: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitCommitFileDiffInput {
    pub repository: String,
    pub oid: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitBranchInput {
    pub repository: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCreateBranchFromInput {
    pub repository: String,
    pub name: String,
    pub source_ref: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCreateBranchFromCommitInput {
    pub repository: String,
    pub name: String,
    pub oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRenameBranchInput {
    pub repository: String,
    pub ref_name: String,
    pub new_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDeleteBranchInput {
    pub repository: String,
    pub ref_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitPushInput {
    pub repository: String,
    pub remote: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRemoteBranchInput {
    pub repository: String,
    pub ref_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitMergeBranchInput {
    pub repository: String,
    pub source_ref: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitConflictDetailInput {
    pub repository: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitChangeDiffInput {
    pub repository: String,
    pub path: String,
    pub staged: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitResolveConflictInput {
    pub repository: String,
    pub path: String,
    pub resolution: GitConflictResolutionDto,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitConflictResolutionDto {
    SaveText {
        content: String,
        expected_revision: String,
    },
    UseCurrent {},
    UseIncoming {},
    Delete {},
    MarkResolved {},
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitInput {
    pub session_id: String,
    pub profile_id: String,
    pub action: RemoteGitActionDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitCommitFilesInput {
    pub session_id: String,
    pub profile_id: String,
    pub repository: String,
    pub oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitCommitFileDiffInput {
    pub session_id: String,
    pub profile_id: String,
    pub repository: String,
    pub oid: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitConflictDetailInput {
    pub session_id: String,
    pub profile_id: String,
    pub repository: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitChangeDiffInput {
    pub session_id: String,
    pub profile_id: String,
    pub repository: String,
    pub path: String,
    pub staged: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitResolveConflictInput {
    pub session_id: String,
    pub profile_id: String,
    pub repository: String,
    pub path: String,
    pub resolution: GitConflictResolutionDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteGitDirectoryInput {
    pub session_id: String,
    pub profile_id: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RemoteGitActionDto {
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
    Discard {
        repository: String,
        paths: Vec<String>,
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
    InitializeSubmodule {
        repository: String,
        path: String,
    },
    CheckoutSubmodule {
        repository: String,
        path: String,
    },
}

impl From<RemoteGitActionDto> for RemoteGitAction {
    fn from(value: RemoteGitActionDto) -> Self {
        match value {
            RemoteGitActionDto::Snapshot { path } => Self::Snapshot { path },
            RemoteGitActionDto::Initialize { path } => Self::Initialize { path },
            RemoteGitActionDto::Stage { repository, paths } => Self::Stage { repository, paths },
            RemoteGitActionDto::StageAll { repository } => Self::StageAll { repository },
            RemoteGitActionDto::Unstage { repository, paths } => {
                Self::Unstage { repository, paths }
            }
            RemoteGitActionDto::UnstageAll { repository } => Self::UnstageAll { repository },
            RemoteGitActionDto::Discard { repository, paths } => {
                Self::Discard { repository, paths }
            }
            RemoteGitActionDto::Commit {
                repository,
                message,
            } => Self::Commit {
                repository,
                message,
            },
            RemoteGitActionDto::CreateBranch { repository, name } => {
                Self::CreateBranch { repository, name }
            }
            RemoteGitActionDto::CreateBranchFrom {
                repository,
                name,
                source_ref,
            } => Self::CreateBranchFrom {
                repository,
                name,
                source_ref,
            },
            RemoteGitActionDto::CreateBranchFromCommit {
                repository,
                name,
                oid,
            } => Self::CreateBranchFromCommit {
                repository,
                name,
                oid,
            },
            RemoteGitActionDto::RenameBranch {
                repository,
                ref_name,
                new_name,
            } => Self::RenameBranch {
                repository,
                ref_name,
                new_name,
            },
            RemoteGitActionDto::DeleteBranch {
                repository,
                ref_name,
            } => Self::DeleteBranch {
                repository,
                ref_name,
            },
            RemoteGitActionDto::SwitchBranch { repository, name } => {
                Self::SwitchBranch { repository, name }
            }
            RemoteGitActionDto::Fetch { repository } => Self::Fetch { repository },
            RemoteGitActionDto::Pull { repository } => Self::Pull { repository },
            RemoteGitActionDto::Push { repository, remote } => Self::Push { repository, remote },
            RemoteGitActionDto::TrackRemoteBranch {
                repository,
                ref_name,
            } => Self::TrackRemoteBranch {
                repository,
                ref_name,
            },
            RemoteGitActionDto::MergeBranch {
                repository,
                source_ref,
            } => Self::MergeBranch {
                repository,
                source_ref,
            },
            RemoteGitActionDto::ContinueMerge { repository } => Self::ContinueMerge { repository },
            RemoteGitActionDto::AbortMerge { repository } => Self::AbortMerge { repository },
            RemoteGitActionDto::InitializeSubmodule { repository, path } => {
                Self::InitializeSubmodule { repository, path }
            }
            RemoteGitActionDto::CheckoutSubmodule { repository, path } => {
                Self::CheckoutSubmodule { repository, path }
            }
        }
    }
}

impl From<GitConflictResolutionDto> for GitConflictResolution {
    fn from(value: GitConflictResolutionDto) -> Self {
        match value {
            GitConflictResolutionDto::SaveText {
                content,
                expected_revision,
            } => Self::SaveText {
                content,
                expected_revision,
            },
            GitConflictResolutionDto::UseCurrent {} => Self::UseCurrent,
            GitConflictResolutionDto::UseIncoming {} => Self::UseIncoming,
            GitConflictResolutionDto::Delete {} => Self::Delete,
            GitConflictResolutionDto::MarkResolved {} => Self::MarkResolved,
        }
    }
}
