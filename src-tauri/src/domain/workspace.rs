use std::collections::HashSet;

const MAX_NAME_CHARS: usize = 80;
const MAX_TREE_DEPTH: usize = 16;
const MAX_BLOCKS: usize = 64;
const MAX_RECENT_PROFILE_IDS: usize = 6;
const MAX_RESTORE_DIRECTORY_BYTES: usize = 4 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceDocument {
    pub active_workspace_id: String,
    pub recent_profile_ids: Vec<String>,
    pub workspaces: Vec<Workspace>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub active_block_id: String,
    pub layout: LayoutNode,
}

#[derive(Clone, Debug, PartialEq)]
pub enum LayoutNode {
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
        target: GitTarget,
    },
    Split {
        id: String,
        direction: SplitDirection,
        ratio: f64,
        first: Box<LayoutNode>,
        second: Box<LayoutNode>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitTarget {
    Unbound,
    Local { path: String },
    Remote { profile_id: String, path: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SplitDirection {
    Horizontal,
    Vertical,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkspaceValidationError {
    Document,
    Id,
    Name,
    Layout,
}

impl WorkspaceDocument {
    pub fn validate(&self) -> Result<(), WorkspaceValidationError> {
        if self.workspaces.is_empty() || self.recent_profile_ids.len() > MAX_RECENT_PROFILE_IDS {
            return Err(WorkspaceValidationError::Document);
        }
        let mut recent_profile_ids = HashSet::new();
        for profile_id in &self.recent_profile_ids {
            validate_id(profile_id)?;
            if !recent_profile_ids.insert(profile_id.as_str()) {
                return Err(WorkspaceValidationError::Document);
            }
        }
        let mut workspace_ids = HashSet::new();
        let mut block_ids = HashSet::new();
        for workspace in &self.workspaces {
            validate_id(&workspace.id)?;
            validate_name(&workspace.name)?;
            if !workspace_ids.insert(workspace.id.as_str()) {
                return Err(WorkspaceValidationError::Document);
            }
            let mut workspace_blocks = Vec::new();
            validate_layout(&workspace.layout, 0, &mut workspace_blocks)?;
            if !contains_terminal(&workspace.layout)
                || !workspace_blocks
                    .iter()
                    .any(|id| *id == workspace.active_block_id)
                || workspace_blocks.iter().any(|id| !block_ids.insert(*id))
            {
                return Err(WorkspaceValidationError::Document);
            }
        }
        if !workspace_ids.contains(self.active_workspace_id.as_str()) {
            return Err(WorkspaceValidationError::Document);
        }
        Ok(())
    }
}

fn contains_terminal(node: &LayoutNode) -> bool {
    match node {
        LayoutNode::Terminal { .. } => true,
        LayoutNode::Files { .. } | LayoutNode::Network { .. } | LayoutNode::Git { .. } => false,
        LayoutNode::Split { first, second, .. } => {
            contains_terminal(first) || contains_terminal(second)
        }
    }
}

fn validate_layout<'a>(
    node: &'a LayoutNode,
    depth: usize,
    blocks: &mut Vec<&'a str>,
) -> Result<(), WorkspaceValidationError> {
    if depth > MAX_TREE_DEPTH || blocks.len() >= MAX_BLOCKS {
        return Err(WorkspaceValidationError::Layout);
    }
    match node {
        LayoutNode::Terminal {
            block_id,
            profile_id,
            restore_directory,
        } => {
            validate_id(block_id)?;
            if let Some(profile_id) = profile_id {
                validate_id(profile_id)?;
            }
            if restore_directory.as_ref().is_some_and(|directory| {
                directory.is_empty()
                    || directory.len() > MAX_RESTORE_DIRECTORY_BYTES
                    || directory.contains('\0')
            }) {
                return Err(WorkspaceValidationError::Layout);
            }
            if blocks.contains(&block_id.as_str()) {
                return Err(WorkspaceValidationError::Layout);
            }
            blocks.push(block_id);
        }
        LayoutNode::Files {
            block_id,
            profile_id,
            path,
        } => {
            validate_id(block_id)?;
            if let Some(profile_id) = profile_id {
                validate_id(profile_id)?;
            }
            if path.is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
                return Err(WorkspaceValidationError::Layout);
            }
            if blocks.contains(&block_id.as_str()) {
                return Err(WorkspaceValidationError::Layout);
            }
            blocks.push(block_id);
        }
        LayoutNode::Network {
            block_id,
            profile_id,
        } => {
            validate_id(block_id)?;
            if let Some(profile_id) = profile_id {
                validate_id(profile_id)?;
            }
            if blocks.contains(&block_id.as_str()) {
                return Err(WorkspaceValidationError::Layout);
            }
            blocks.push(block_id);
        }
        LayoutNode::Git { block_id, target } => {
            validate_id(block_id)?;
            match target {
                GitTarget::Unbound => {}
                GitTarget::Local { path } => validate_local_git_path(path)?,
                GitTarget::Remote { profile_id, path } => {
                    validate_id(profile_id)?;
                    validate_remote_git_path(path)?;
                }
            }
            if blocks.contains(&block_id.as_str()) {
                return Err(WorkspaceValidationError::Layout);
            }
            blocks.push(block_id);
        }
        LayoutNode::Split {
            id,
            ratio,
            first,
            second,
            ..
        } => {
            validate_id(id)?;
            if !ratio.is_finite() || !(0.15..=0.85).contains(ratio) {
                return Err(WorkspaceValidationError::Layout);
            }
            validate_layout(first, depth + 1, blocks)?;
            validate_layout(second, depth + 1, blocks)?;
        }
    }
    Ok(())
}

fn validate_local_git_path(path: &str) -> Result<(), WorkspaceValidationError> {
    if path.is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
        Err(WorkspaceValidationError::Layout)
    } else {
        Ok(())
    }
}

fn validate_remote_git_path(path: &str) -> Result<(), WorkspaceValidationError> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') {
        Err(WorkspaceValidationError::Layout)
    } else {
        Ok(())
    }
}

fn validate_id(value: &str) -> Result<(), WorkspaceValidationError> {
    if value.is_empty()
        || value.len() > 128
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        Err(WorkspaceValidationError::Id)
    } else {
        Ok(())
    }
}

fn validate_name(value: &str) -> Result<(), WorkspaceValidationError> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_NAME_CHARS
        || value.chars().any(char::is_control)
    {
        Err(WorkspaceValidationError::Name)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{LayoutNode, SplitDirection, Workspace, WorkspaceDocument};

    fn document() -> WorkspaceDocument {
        WorkspaceDocument {
            active_workspace_id: "workspace-1".into(),
            recent_profile_ids: vec!["profile-1".into()],
            workspaces: vec![Workspace {
                id: "workspace-1".into(),
                name: "Production".into(),
                active_block_id: "block-1".into(),
                layout: LayoutNode::Split {
                    id: "split-1".into(),
                    direction: SplitDirection::Horizontal,
                    ratio: 0.5,
                    first: Box::new(LayoutNode::Terminal {
                        block_id: "block-1".into(),
                        profile_id: Some("profile-1".into()),
                        restore_directory: Some("/srv/project".into()),
                    }),
                    second: Box::new(LayoutNode::Terminal {
                        block_id: "block-2".into(),
                        profile_id: None,
                        restore_directory: None,
                    }),
                },
            }],
        }
    }

    #[test]
    fn accepts_a_bounded_workspace_tree() {
        assert_eq!(document().validate(), Ok(()));
    }

    #[test]
    fn rejects_invalid_active_references_duplicate_blocks_and_ratios() {
        let mut invalid_active = document();
        invalid_active.active_workspace_id = "missing".into();
        assert!(invalid_active.validate().is_err());

        let mut invalid_ratio = document();
        if let LayoutNode::Split { ratio, .. } = &mut invalid_ratio.workspaces[0].layout {
            *ratio = 0.99;
        }
        assert!(invalid_ratio.validate().is_err());

        let mut duplicate = document();
        if let LayoutNode::Split { second, .. } = &mut duplicate.workspaces[0].layout {
            **second = LayoutNode::Terminal {
                block_id: "block-1".into(),
                profile_id: None,
                restore_directory: None,
            };
        }
        assert!(duplicate.validate().is_err());

        let only_files = WorkspaceDocument {
            active_workspace_id: "workspace-files".into(),
            recent_profile_ids: Vec::new(),
            workspaces: vec![Workspace {
                id: "workspace-files".into(),
                name: "Files".into(),
                active_block_id: "files-1".into(),
                layout: LayoutNode::Files {
                    block_id: "files-1".into(),
                    profile_id: None,
                    path: "/srv".into(),
                },
            }],
        };
        assert!(only_files.validate().is_err());
    }

    #[test]
    fn rejects_duplicate_or_excessive_recent_profiles() {
        let mut duplicate = document();
        duplicate.recent_profile_ids = vec!["profile-1".into(), "profile-1".into()];
        assert!(duplicate.validate().is_err());

        let mut excessive = document();
        excessive.recent_profile_ids = (0..7).map(|index| format!("profile-{index}")).collect();
        assert!(excessive.validate().is_err());

        let mut bounded = document();
        bounded.recent_profile_ids = (0..6).map(|index| format!("profile-{index}")).collect();
        assert!(bounded.validate().is_ok());
    }

    #[test]
    fn rejects_empty_nul_or_unbounded_terminal_restore_directories() {
        for restore_directory in [
            Some(String::new()),
            Some("/srv/has\0nul".into()),
            Some("x".repeat(4097)),
        ] {
            let mut invalid = document();
            if let LayoutNode::Split { first, .. } = &mut invalid.workspaces[0].layout
                && let LayoutNode::Terminal {
                    restore_directory: value,
                    ..
                } = first.as_mut()
            {
                *value = restore_directory;
            }
            assert!(invalid.validate().is_err());
        }
    }
}
