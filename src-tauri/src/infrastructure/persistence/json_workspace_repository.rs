use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    domain::workspace::{LayoutNode, SplitDirection, Workspace, WorkspaceDocument},
    ports::workspace_repository::{WorkspaceRepository, WorkspaceRepositoryError},
};

const SCHEMA_VERSION: u64 = 5;
const MAX_DOCUMENT_BYTES: u64 = 4 * 1024 * 1024;

pub struct JsonWorkspaceRepository {
    path: PathBuf,
    write_lock: Mutex<()>,
}

impl JsonWorkspaceRepository {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            write_lock: Mutex::new(()),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, ()>, WorkspaceRepositoryError> {
        self.write_lock
            .lock()
            .map_err(|_| WorkspaceRepositoryError::Io)
    }

    fn load_unlocked(&self) -> Result<Option<WorkspaceDocument>, WorkspaceRepositoryError> {
        match fs::metadata(&self.path) {
            Ok(metadata) if metadata.len() > MAX_DOCUMENT_BYTES => {
                return Err(WorkspaceRepositoryError::CorruptData);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(WorkspaceRepositoryError::Io),
        }
        let bytes = fs::read(&self.path).map_err(|_| WorkspaceRepositoryError::Io)?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| WorkspaceRepositoryError::CorruptData)?;
        if contains_forbidden_field(&value) {
            return Err(WorkspaceRepositoryError::SensitiveField);
        }
        let version = value
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .ok_or(WorkspaceRepositoryError::CorruptData)?;
        if version != SCHEMA_VERSION {
            return Err(WorkspaceRepositoryError::UnsupportedSchemaVersion(version));
        }
        let document = serde_json::from_value::<DocumentRecord>(value)
            .map_err(|_| WorkspaceRepositoryError::CorruptData)?
            .into_domain();
        document
            .validate()
            .map_err(|_| WorkspaceRepositoryError::CorruptData)?;
        Ok(Some(document))
    }

    fn save_unlocked(&self, document: &WorkspaceDocument) -> Result<(), WorkspaceRepositoryError> {
        document
            .validate()
            .map_err(|_| WorkspaceRepositoryError::CorruptData)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| WorkspaceRepositoryError::Io)?;
        }
        let mut bytes = serde_json::to_vec_pretty(&DocumentRecord::from_domain(document))
            .map_err(|_| WorkspaceRepositoryError::Io)?;
        bytes.push(b'\n');
        let mut file =
            AtomicWriteFile::open(&self.path).map_err(|_| WorkspaceRepositoryError::Io)?;
        file.write_all(&bytes)
            .map_err(|_| WorkspaceRepositoryError::Io)?;
        file.commit().map_err(|_| WorkspaceRepositoryError::Io)
    }
}

impl WorkspaceRepository for JsonWorkspaceRepository {
    fn load(&self) -> Result<Option<WorkspaceDocument>, WorkspaceRepositoryError> {
        let _guard = self.lock()?;
        self.load_unlocked()
    }

    fn save(&self, document: &WorkspaceDocument) -> Result<(), WorkspaceRepositoryError> {
        let _guard = self.lock()?;
        self.save_unlocked(document)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DocumentRecord {
    schema_version: u64,
    active_workspace_id: String,
    workspaces: Vec<WorkspaceRecord>,
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
    Split {
        id: String,
        direction: DirectionRecord,
        ratio: f64,
        first: Box<LayoutRecord>,
        second: Box<LayoutRecord>,
    },
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum DirectionRecord {
    Horizontal,
    Vertical,
}

impl DocumentRecord {
    fn from_domain(document: &WorkspaceDocument) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            active_workspace_id: document.active_workspace_id.clone(),
            workspaces: document
                .workspaces
                .iter()
                .map(WorkspaceRecord::from_domain)
                .collect(),
        }
    }

    fn into_domain(self) -> WorkspaceDocument {
        WorkspaceDocument {
            active_workspace_id: self.active_workspace_id,
            workspaces: self
                .workspaces
                .into_iter()
                .map(WorkspaceRecord::into_domain)
                .collect(),
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
            } => Self::Terminal {
                block_id: block_id.clone(),
                profile_id: profile_id.clone(),
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
            } => LayoutNode::Terminal {
                block_id,
                profile_id,
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

fn contains_forbidden_field(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, nested)| {
            let normalized: String = key
                .chars()
                .filter(char::is_ascii_alphanumeric)
                .flat_map(char::to_lowercase)
                .collect();
            matches!(
                normalized.as_str(),
                "password"
                    | "passphrase"
                    | "privatekeydata"
                    | "sessionid"
                    | "terminaloutput"
                    | "terminalbuffer"
            ) || contains_forbidden_field(nested)
        }),
        Value::Array(values) => values.iter().any(contains_forbidden_field),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::JsonWorkspaceRepository;
    use crate::{
        domain::workspace::{LayoutNode, Workspace, WorkspaceDocument},
        ports::workspace_repository::{WorkspaceRepository, WorkspaceRepositoryError},
    };

    fn document() -> WorkspaceDocument {
        WorkspaceDocument {
            active_workspace_id: "workspace-1".into(),
            workspaces: vec![Workspace {
                id: "workspace-1".into(),
                name: "Workspace".into(),
                active_block_id: "network-1".into(),
                layout: LayoutNode::Split {
                    id: "split-1".into(),
                    direction: crate::domain::workspace::SplitDirection::Horizontal,
                    ratio: 0.5,
                    first: Box::new(LayoutNode::Terminal {
                        block_id: "block-1".into(),
                        profile_id: Some("profile-1".into()),
                    }),
                    second: Box::new(LayoutNode::Network {
                        block_id: "network-1".into(),
                        profile_id: Some("profile-1".into()),
                    }),
                },
            }],
        }
    }

    #[test]
    fn round_trips_v5_network_schema_without_runtime_or_secret_fields() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("workspaces.json");
        let repository = JsonWorkspaceRepository::new(path.clone());
        repository.save(&document()).expect("save workspace");

        assert_eq!(repository.load().expect("load workspace"), Some(document()));
        let json = fs::read_to_string(path).expect("workspace json");
        assert!(json.contains("\"schemaVersion\": 5"));
        assert!(json.contains("\"type\": \"network\""));
        assert!(json.contains("\"blockId\": \"block-1\""));
        assert!(json.contains("\"profileId\": \"profile-1\""));
        assert!(!json.contains("sourceBlockId"));
        assert!(!json.contains("block_id"));
        for forbidden in ["password", "passphrase", "sessionId", "terminalOutput"] {
            assert!(!json.contains(forbidden));
        }
    }

    #[test]
    fn rejects_legacy_workspace_schemas_without_overwriting_source() {
        for version in [1, 2, 3, 4] {
            let directory = tempdir().expect("temporary directory");
            let path = directory.path().join("workspaces.json");
            let fixture = format!(
                r#"{{"schemaVersion":{version},"activeWorkspaceId":"workspace-1","workspaces":[]}}"#
            );
            fs::write(&path, fixture.as_bytes()).expect("legacy fixture");
            let repository = JsonWorkspaceRepository::new(path.clone());
            assert_eq!(
                repository.load(),
                Err(WorkspaceRepositoryError::UnsupportedSchemaVersion(version))
            );
            assert_eq!(fs::read(path).expect("preserved"), fixture.as_bytes());
        }
    }

    #[test]
    fn rejects_sensitive_and_unknown_documents_without_overwriting() {
        let directory = tempdir().expect("temporary directory");
        let path = directory.path().join("workspaces.json");
        let sensitive = br#"{"schemaVersion":3,"password":"forbidden","activeWorkspaceId":"x","workspaces":[]}"#;
        fs::write(&path, sensitive).expect("fixture");
        let repository = JsonWorkspaceRepository::new(path.clone());
        assert_eq!(
            repository.load(),
            Err(WorkspaceRepositoryError::SensitiveField)
        );
        assert_eq!(fs::read(&path).expect("preserved"), sensitive);

        fs::write(
            &path,
            br#"{"schemaVersion":99,"activeWorkspaceId":"x","workspaces":[]}"#,
        )
        .expect("unknown fixture");
        assert_eq!(
            repository.load(),
            Err(WorkspaceRepositoryError::UnsupportedSchemaVersion(99))
        );
    }
}
