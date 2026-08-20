use crate::{
    application::error::{ApplicationError, ApplicationErrorCode},
    domain::workspace::WorkspaceDocument,
    ports::workspace_repository::{WorkspaceRepository, WorkspaceRepositoryError},
};

pub struct WorkspaceService<R> {
    repository: R,
}

impl<R: WorkspaceRepository> WorkspaceService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub fn load(&self) -> Result<Option<WorkspaceDocument>, ApplicationError> {
        self.repository.load().map_err(map_repository_error)
    }

    pub fn save(&self, document: WorkspaceDocument) -> Result<(), ApplicationError> {
        document.validate().map_err(|_| {
            ApplicationError::new(
                ApplicationErrorCode::InvalidWorkspaceDocument,
                "工作区布局无效",
                false,
            )
        })?;
        self.repository
            .save(&document)
            .map_err(map_repository_error)
    }
}

fn map_repository_error(error: WorkspaceRepositoryError) -> ApplicationError {
    match error {
        WorkspaceRepositoryError::CorruptData => ApplicationError::new(
            ApplicationErrorCode::WorkspaceStorageCorrupt,
            "工作区文件已损坏",
            false,
        ),
        WorkspaceRepositoryError::UnsupportedSchemaVersion(_) => ApplicationError::new(
            ApplicationErrorCode::WorkspaceStorageVersionUnsupported,
            "工作区文件版本不受支持",
            false,
        ),
        WorkspaceRepositoryError::SensitiveField => ApplicationError::new(
            ApplicationErrorCode::WorkspaceStorageContainsSensitiveData,
            "工作区文件包含禁止保存的敏感字段",
            false,
        ),
        WorkspaceRepositoryError::Io => ApplicationError::new(
            ApplicationErrorCode::WorkspaceStorageUnavailable,
            "暂时无法访问工作区文件",
            true,
        ),
    }
}
