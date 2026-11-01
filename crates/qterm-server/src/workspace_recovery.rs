//! Recover a process whose browser disappeared before its new block was saved.
use crate::state::ServerState;
use qterm_core::domain::workspace::{GitTarget, LayoutNode, SplitDirection, Workspace};
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
        let needs_terminal = matches!(session.kind.as_str(), "files" | "git" | "network");
        if keys.len() + 1 + usize::from(needs_terminal) > 64 || !keys.insert(key.clone()) {
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
        } else if session.kind == "network" {
            LayoutNode::Network {
                block_id: key.clone(),
                profile_id: session.profile_id.clone(),
            }
        } else if session.kind == "git" {
            LayoutNode::Git {
                block_id: key.clone(),
                target: session
                    .profile_id
                    .clone()
                    .map(|profile_id| GitTarget::Remote {
                        profile_id,
                        path: ".".into(),
                    })
                    .unwrap_or(GitTarget::Unbound),
            }
        } else {
            LayoutNode::Terminal {
                block_id: key.clone(),
                profile_id: session.profile_id.clone(),
                restore_directory: cwd,
            }
        };
        // Every workspace must contain a terminal, including recovered tool sessions.
        let layout = if needs_terminal {
            let terminal_id = uuid::Uuid::new_v4().to_string();
            keys.insert(terminal_id.clone());
            LayoutNode::Split {
                id: uuid::Uuid::new_v4().to_string(),
                direction: SplitDirection::Horizontal,
                ratio: 0.35,
                first: Box::new(LayoutNode::Terminal {
                    block_id: terminal_id,
                    profile_id: None,
                    restore_directory: None,
                }),
                second: Box::new(layout),
            }
        } else {
            layout
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{retained_session::RetainedSession, socket_io::SessionControl};
    #[test]
    fn recovers_orphan_tools_into_valid_workspaces_without_changing_session_keys() {
        let (_dir, state, _token) = crate::tests::fixture();
        for kind in ["files", "git", "network"] {
            let session = RetainedSession::new(
                state.screen_worker.clone(),
                SessionControl::Remote(state.sessions.clone()),
                Some(kind.into()),
                kind,
                Some("profile".into()),
                80,
                24,
            )
            .unwrap();
            session.ready(format!("session-{kind}"), None);
            crate::retained_socket::register(&state, session).unwrap();
        }
        let mut document = crate::workspace_runtime::default_document();
        assert!(recover(&state, &mut document));
        document.clone().into_domain().validate().unwrap();
        let found = keys(&document);
        for kind in ["files", "git", "network"] {
            assert!(found.contains(kind));
        }
        assert_eq!(document.clone().into_domain().workspaces.len(), 4);
        assert!(!recover(&state, &mut document));
    }
}
