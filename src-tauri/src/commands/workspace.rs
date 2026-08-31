use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    application::workspace_service::WorkspaceService,
    commands::error::IpcError,
    domain::workspace::{
        GitTarget, LayoutNode, RecentGitRepository, SplitDirection, Workspace, WorkspaceDocument,
    },
    infrastructure::persistence::json_workspace_repository::JsonWorkspaceRepository,
};

pub struct WorkspaceState {
    service: WorkspaceService<JsonWorkspaceRepository>,
}

impl WorkspaceState {
    pub fn new(repository: JsonWorkspaceRepository) -> Self {
        Self {
            service: WorkspaceService::new(repository),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WorkspaceDocumentDto {
    schema_version: u64,
    active_workspace_id: String,
    recent_profile_ids: Vec<String>,
    recent_git_repositories: Vec<RecentGitRepositoryDto>,
    workspaces: Vec<WorkspaceDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum RecentGitRepositoryDto {
    Local { path: String },
    Remote { profile_id: String, path: String },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WorkspaceDto {
    id: String,
    name: String,
    active_block_id: String,
    layout: LayoutDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum LayoutDto {
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
    Network {
        block_id: String,
        profile_id: Option<String>,
    },
    Git {
        block_id: String,
        target: GitTargetDto,
    },
    Split {
        id: String,
        direction: DirectionDto,
        ratio: f64,
        first: Box<LayoutDto>,
        second: Box<LayoutDto>,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum GitTargetDto {
    Unbound,
    Local { path: String },
    Remote { profile_id: String, path: String },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum DirectionDto {
    Horizontal,
    Vertical,
}

#[tauri::command]
pub fn workspace_load(
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceDocumentDto>, IpcError> {
    state
        .service
        .load()
        .map(|document| document.as_ref().map(WorkspaceDocumentDto::from_domain))
        .map_err(IpcError::from)
}

#[tauri::command]
pub fn workspace_save(
    document: WorkspaceDocumentDto,
    state: State<'_, WorkspaceState>,
) -> Result<(), IpcError> {
    if document.schema_version != 10 {
        return Err(IpcError::from(
            crate::application::error::ApplicationError::new(
                crate::application::error::ApplicationErrorCode::InvalidWorkspaceDocument,
                "工作区布局无效",
                false,
            ),
        ));
    }
    state
        .service
        .save(document.into_domain())
        .map_err(IpcError::from)
}

impl WorkspaceDocumentDto {
    fn from_domain(document: &WorkspaceDocument) -> Self {
        Self {
            schema_version: 10,
            active_workspace_id: document.active_workspace_id.clone(),
            recent_profile_ids: document.recent_profile_ids.clone(),
            recent_git_repositories: document
                .recent_git_repositories
                .iter()
                .map(RecentGitRepositoryDto::from_domain)
                .collect(),
            workspaces: document
                .workspaces
                .iter()
                .map(WorkspaceDto::from_domain)
                .collect(),
        }
    }

    fn into_domain(self) -> WorkspaceDocument {
        WorkspaceDocument {
            active_workspace_id: self.active_workspace_id,
            recent_profile_ids: self.recent_profile_ids,
            recent_git_repositories: self
                .recent_git_repositories
                .into_iter()
                .map(RecentGitRepositoryDto::into_domain)
                .collect(),
            workspaces: self
                .workspaces
                .into_iter()
                .map(WorkspaceDto::into_domain)
                .collect(),
        }
    }
}

impl RecentGitRepositoryDto {
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

impl WorkspaceDto {
    fn from_domain(workspace: &Workspace) -> Self {
        Self {
            id: workspace.id.clone(),
            name: workspace.name.clone(),
            active_block_id: workspace.active_block_id.clone(),
            layout: LayoutDto::from_domain(&workspace.layout),
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

impl LayoutDto {
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
            LayoutNode::Network {
                block_id,
                profile_id,
            } => Self::Network {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
            },
            LayoutNode::Git { block_id, target } => Self::Git {
                block_id: block_id.clone(),
                target: GitTargetDto::from_domain(target),
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

impl GitTargetDto {
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

impl From<SplitDirection> for DirectionDto {
    fn from(value: SplitDirection) -> Self {
        match value {
            SplitDirection::Horizontal => Self::Horizontal,
            SplitDirection::Vertical => Self::Vertical,
        }
    }
}

impl From<DirectionDto> for SplitDirection {
    fn from(value: DirectionDto) -> Self {
        match value {
            DirectionDto::Horizontal => Self::Horizontal,
            DirectionDto::Vertical => Self::Vertical,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::WorkspaceDocumentDto;

    fn document() -> serde_json::Value {
        json!({
            "schemaVersion": 10,
            "activeWorkspaceId": "workspace-1",
            "recentProfileIds": ["profile-1"],
            "recentGitRepositories": [
                { "type": "local", "path": "D:/work/project" },
                { "type": "remote", "profileId": "profile-1", "path": "/srv/project" }
            ],
            "workspaces": [{
                "id": "workspace-1",
                "name": "Workspace",
                "activeBlockId": "network-1",
                "layout": {
                    "type": "split",
                    "id": "split-1",
                    "direction": "horizontal",
                    "ratio": 0.5,
                    "first": {
                        "type": "terminal",
                        "blockId": "block-1",
                        "profileId": null,
                        "restoreDirectory": "/srv/project"
                    },
                    "second": {
                        "type": "network",
                        "blockId": "network-1",
                        "profileId": "profile-1"
                    }
                }
            }]
        })
    }

    #[test]
    fn workspace_dto_accepts_v10_history_terminal_restore_and_network_layout_fields() {
        assert!(serde_json::from_value::<WorkspaceDocumentDto>(document()).is_ok());
    }

    #[test]
    fn workspace_dto_accepts_git_layout_fields() {
        let mut value = document();
        value["workspaces"][0]["activeBlockId"] = json!("git-1");
        value["workspaces"][0]["layout"]["second"] = json!({
            "type": "git",
            "blockId": "git-1",
            "target": { "type": "local", "path": "D:/work/project" }
        });
        assert!(serde_json::from_value::<WorkspaceDocumentDto>(value).is_ok());
    }

    #[test]
    fn workspace_dto_rejects_runtime_and_secret_fields() {
        let mut value = document();
        value["workspaces"][0]["layout"]["second"]["sessionId"] = json!("forbidden");
        assert!(serde_json::from_value::<WorkspaceDocumentDto>(value).is_err());

        let mut history_value = document();
        history_value["recentGitRepositories"][0]["sessionId"] = json!("forbidden");
        assert!(serde_json::from_value::<WorkspaceDocumentDto>(history_value).is_err());
    }
}
