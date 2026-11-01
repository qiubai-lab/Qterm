use tauri::State;

use crate::{
    application::workspace_service::WorkspaceService, commands::error::IpcError,
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

pub use qterm_protocol::workspaces::WorkspaceDocumentDto;

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
