use super::*;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct DocumentRecord {
    schema_version: u64,
    active_workspace_id: String,
    recent_profile_ids: Vec<String>,
    recent_git_repositories: Vec<RecentGitRepositoryRecord>,
    workspaces: Vec<WorkspaceRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum RecentGitRepositoryRecord {
    Local { path: String },
    Remote { profile_id: String, path: String },
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WorkspaceRecord {
    id: String,
    name: String,
    active_block_id: String,
    layout: LayoutRecord,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum LayoutRecord {
    Terminal {
        block_id: String,
        profile_id: Option<String>,
        restore_directory: Option<String>,
    },
    Files {
        block_id: String,
        profile_id: Option<String>,
        path: String,
    },
    Web {
        block_id: String,
        profile_id: Option<String>,
    },
    Network {
        block_id: String,
        profile_id: Option<String>,
    },
    Git {
        block_id: String,
        target: GitTargetRecord,
    },
    Split {
        id: String,
        direction: DirectionRecord,
        ratio: f64,
        first: Box<LayoutRecord>,
        second: Box<LayoutRecord>,
    },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum GitTargetRecord {
    Unbound,
    Local { path: String },
    Remote { profile_id: String, path: String },
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum DirectionRecord {
    Horizontal,
    Vertical,
}

impl DocumentRecord {
    pub(super) fn from_domain(document: &WorkspaceDocument) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            active_workspace_id: document.active_workspace_id.clone(),
            recent_profile_ids: document.recent_profile_ids.clone(),
            recent_git_repositories: document
                .recent_git_repositories
                .iter()
                .map(RecentGitRepositoryRecord::from_domain)
                .collect(),
            workspaces: document
                .workspaces
                .iter()
                .map(WorkspaceRecord::from_domain)
                .collect(),
        }
    }

    pub(super) fn into_domain(self) -> WorkspaceDocument {
        WorkspaceDocument {
            active_workspace_id: self.active_workspace_id,
            recent_profile_ids: self.recent_profile_ids,
            recent_git_repositories: self
                .recent_git_repositories
                .into_iter()
                .map(RecentGitRepositoryRecord::into_domain)
                .collect(),
            workspaces: self
                .workspaces
                .into_iter()
                .map(WorkspaceRecord::into_domain)
                .collect(),
        }
    }
}

impl RecentGitRepositoryRecord {
    fn from_domain(repository: &RecentGitRepository) -> Self {
        match repository {
            RecentGitRepository::Local { path } => Self::Local { path: path.clone() },
            RecentGitRepository::Remote { profile_id, path } => Self::Remote {
                profile_id: profile_id.clone(),
                path: path.clone(),
            },
        }
    }

    fn into_domain(self) -> RecentGitRepository {
        match self {
            Self::Local { path } => RecentGitRepository::Local { path },
            Self::Remote { profile_id, path } => RecentGitRepository::Remote { profile_id, path },
        }
    }
}

impl WorkspaceRecord {
    fn from_domain(workspace: &Workspace) -> Self {
        Self {
            id: workspace.id.clone(),
            name: workspace.name.clone(),
            active_block_id: workspace.active_block_id.clone(),
            layout: LayoutRecord::from_domain(&workspace.layout),
        }
    }

    fn into_domain(self) -> Workspace {
        Workspace {
            id: self.id,
            name: self.name,
            active_block_id: self.active_block_id,
            layout: self.layout.into_domain(),
        }
    }
}

impl LayoutRecord {
    fn from_domain(node: &LayoutNode) -> Self {
        match node {
            LayoutNode::Terminal {
                block_id,
                profile_id,
                restore_directory,
            } => Self::Terminal {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
                restore_directory: restore_directory.clone(),
            },
            LayoutNode::Files {
                block_id,
                profile_id,
                path,
            } => Self::Files {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
                path: path.clone(),
            },
            LayoutNode::Web {
                block_id,
                profile_id,
            } => Self::Web {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
            },
            LayoutNode::Network {
                block_id,
                profile_id,
            } => Self::Network {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
            },
            LayoutNode::Git { block_id, target } => Self::Git {
                block_id: block_id.clone(),
                target: GitTargetRecord::from_domain(target),
            },
            LayoutNode::Split {
                id,
                direction,
                ratio,
                first,
                second,
            } => Self::Split {
                id: id.clone(),
                direction: (*direction).into(),
                ratio: *ratio,
                first: Box::new(Self::from_domain(first)),
                second: Box::new(Self::from_domain(second)),
            },
        }
    }

    fn into_domain(self) -> LayoutNode {
        match self {
            Self::Terminal {
                block_id,
                profile_id,
                restore_directory,
            } => LayoutNode::Terminal {
                block_id,
                profile_id,
                restore_directory,
            },
            Self::Files {
                block_id,
                profile_id,
                path,
            } => LayoutNode::Files {
                block_id,
                profile_id,
                path,
            },
            Self::Web {
                block_id,
                profile_id,
            } => LayoutNode::Web {
                block_id,
                profile_id,
            },
            Self::Network {
                block_id,
                profile_id,
            } => LayoutNode::Network {
                block_id,
                profile_id,
            },
            Self::Git { block_id, target } => LayoutNode::Git {
                block_id,
                target: target.into_domain(),
            },
            Self::Split {
                id,
                direction,
                ratio,
                first,
                second,
            } => LayoutNode::Split {
                id,
                direction: direction.into(),
                ratio,
                first: Box::new(first.into_domain()),
                second: Box::new(second.into_domain()),
            },
        }
    }
}

impl GitTargetRecord {
    fn from_domain(target: &GitTarget) -> Self {
        match target {
            GitTarget::Unbound => Self::Unbound,
            GitTarget::Local { path } => Self::Local { path: path.clone() },
            GitTarget::Remote { profile_id, path } => Self::Remote {
                profile_id: profile_id.clone(),
                path: path.clone(),
            },
        }
    }

    fn into_domain(self) -> GitTarget {
        match self {
            Self::Unbound => GitTarget::Unbound,
            Self::Local { path } => GitTarget::Local { path },
            Self::Remote { profile_id, path } => GitTarget::Remote { profile_id, path },
        }
    }
}

impl From<SplitDirection> for DirectionRecord {
    fn from(value: SplitDirection) -> Self {
        match value {
            SplitDirection::Horizontal => Self::Horizontal,
            SplitDirection::Vertical => Self::Vertical,
        }
    }
}

impl From<DirectionRecord> for SplitDirection {
    fn from(value: DirectionRecord) -> Self {
        match value {
            DirectionRecord::Horizontal => Self::Horizontal,
            DirectionRecord::Vertical => Self::Vertical,
        }
    }
}
