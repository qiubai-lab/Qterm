//! Recover a process whose browser disappeared before its new block was saved.
use crate::state::ServerState;
use qterm_core::domain::workspace::{LayoutNode, Workspace};
use qterm_protocol::workspaces::WorkspaceDocumentDto;
use std::collections::HashSet;

fn collect(node: &LayoutNode, keys: &mut HashSet<String>) {
    match node {
        LayoutNode::Split { first, second, .. } => {
            collect(first, keys);
            collect(second, keys);
        }
        LayoutNode::Terminal { block_id, .. }
        | LayoutNode::Files { block_id, .. }
        | LayoutNode::Web { block_id, .. }
        | LayoutNode::Network { block_id, .. }
        | LayoutNode::Git { block_id, .. } => {
            keys.insert(block_id.clone());
        }
    }
}
pub fn keys(document: &WorkspaceDocumentDto) -> HashSet<String> {
    let mut keys = HashSet::new();
    for workspace in document.clone().into_domain().workspaces {
        collect(&workspace.layout, &mut keys);
    }
    keys
}
pub fn recover(state: &ServerState, document: &mut WorkspaceDocumentDto) -> bool {
    let mut keys = keys(document);
    let sessions: Vec<_> = state.retained.lock().unwrap().values().cloned().collect();
    let mut domain = document.clone().into_domain();
    let mut changed = false;
    for session in sessions {
        let Some(key) = session.runtime_key.as_ref() else {
            continue;
        };
        if keys.len() >= 64 || !keys.insert(key.clone()) {
            continue;
        }
        let metadata = session.metadata();
        let cwd = metadata["cwd"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 4096 && !s.chars().any(char::is_control))
            .map(str::to_owned);
        let layout = if session.kind == "files" {
            LayoutNode::Files {
                block_id: key.clone(),
                profile_id: session.profile_id.clone(),
                path: cwd.unwrap_or_else(|| ".".into()),
            }
        } else {
            LayoutNode::Terminal {
                block_id: key.clone(),
                profile_id: session.profile_id.clone(),
                restore_directory: cwd,
            }
        };
        domain.workspaces.push(Workspace {
            id: uuid::Uuid::new_v4().to_string(),
            name: "恢复的会话".into(),
            active_block_id: key.clone(),
            layout,
        });
        changed = true;
    }
    if changed {
        *document = WorkspaceDocumentDto::from_domain(&domain);
    }
    changed
}
