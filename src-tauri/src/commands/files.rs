use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::{Deserialize, Serialize};
use tauri::{
    State,
    ipc::{Channel, Response},
};

use crate::{
    application::{
        error::{ApplicationError, ApplicationErrorCode},
        file_service::{self, FileServiceError},
    },
    commands::{
        credential::CredentialState,
        error::IpcError,
        session::{SessionConnectDto, SessionEventDto, SessionState, build_connect_request},
    },
    domain::{
        files::{
            DirectoryListing, FileDocument, FileEntry, MAX_IMAGE_FILE_BYTES, MAX_TEXT_FILE_BYTES,
        },
        transfer::RemotePath,
    },
    infrastructure::ssh::client::{SessionControlError, SessionPurpose},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RemoteDirectoryDto {
    session_id: String,
    path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListingDto {
    path: String,
    entries: Vec<FileEntryDto>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRootDto {
    name: String,
    path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntryDto {
    name: String,
    path: String,
    is_directory: bool,
    is_symlink: bool,
    size: u64,
    modified_at: Option<u64>,
    permission_mode: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FileReadDto {
    session_id: Option<String>,
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FileWriteDto {
    session_id: Option<String>,
    path: String,
    content: String,
    expected_revision: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FileMutationDto {
    session_id: Option<String>,
    path: String,
    target_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FileCreateDto {
    session_id: Option<String>,
    directory: String,
    name: String,
    is_directory: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDocumentDto {
    content: String,
    revision: String,
    modified_at: Option<u64>,
    size: u64,
}

#[tauri::command]
pub fn files_session_connect(
    input: SessionConnectDto,
    on_event: Channel<SessionEventDto>,
    session_state: State<'_, SessionState>,
    credential_state: State<'_, CredentialState>,
) -> Result<String, IpcError> {
    let request = build_connect_request(
        input,
        &credential_state,
        SessionPurpose::Files,
        Arc::new(|_| {}),
    )?;
    let events = Arc::new(move |event| {
        let _ = on_event.send(SessionEventDto::from(event));
    });
    Ok(session_state.manager().connect(request, events))
}

#[tauri::command]
pub async fn files_list_local(path: String) -> Result<DirectoryListingDto, IpcError> {
    if path.trim().is_empty() || path.len() > 4096 || path.contains('\0') {
        return Err(invalid_path());
    }
    let requested = expand_home_path(&path, dirs::home_dir().as_deref())?;
    let canonical = tokio::fs::canonicalize(requested)
        .await
        .map_err(|_| unavailable())?;
    let canonical = dunce::simplified(&canonical).to_path_buf();
    let mut directory = tokio::fs::read_dir(&canonical)
        .await
        .map_err(|_| unavailable())?;
    let mut entries = Vec::new();
    while let Some(entry) = directory.next_entry().await.map_err(|_| unavailable())? {
        let metadata = entry.metadata().await.map_err(|_| unavailable())?;
        let file_type = entry.file_type().await.map_err(|_| unavailable())?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs());
        #[cfg(unix)]
        let permission_mode = {
            use std::os::unix::fs::PermissionsExt;
            Some(metadata.permissions().mode() & 0o7777)
        };
        #[cfg(not(unix))]
        let permission_mode = None;
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: dunce::simplified(&entry.path())
                .to_string_lossy()
                .into_owned(),
            is_directory: metadata.is_dir(),
            is_symlink: file_type.is_symlink(),
            size: metadata.len(),
            modified_at,
            permission_mode,
        });
    }
    Ok(DirectoryListingDto::from(DirectoryListing::new(
        canonical.to_string_lossy().into_owned(),
        entries,
    )))
}

#[tauri::command]
pub fn files_list_local_roots() -> Result<Vec<LocalRootDto>, IpcError> {
    local_root_paths().map(|roots| {
        roots
            .into_iter()
            .map(|path| {
                let value = path.to_string_lossy().into_owned();
                let trimmed = value.trim_end_matches(['\\', '/']);
                LocalRootDto {
                    name: if trimmed.is_empty() {
                        value.clone()
                    } else {
                        trimmed.to_owned()
                    },
                    path: value,
                }
            })
            .collect()
    })
}

fn expand_home_path(path: &str, home: Option<&Path>) -> Result<PathBuf, IpcError> {
    if path == "~" {
        home.map(Path::to_path_buf).ok_or_else(unavailable)
    } else {
        Ok(PathBuf::from(path))
    }
}

#[cfg(windows)]
fn local_root_paths() -> Result<Vec<PathBuf>, IpcError> {
    use windows::Win32::Storage::FileSystem::GetLogicalDrives;

    // SAFETY: GetLogicalDrives has no parameters and only returns a process-local bitmask.
    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err(unavailable());
    }
    Ok((0_u8..26)
        .filter(|index| mask & (1_u32 << index) != 0)
        .map(|index| PathBuf::from(format!("{}:\\", char::from(b'A' + index))))
        .collect())
}

#[cfg(not(windows))]
fn local_root_paths() -> Result<Vec<PathBuf>, IpcError> {
    Ok(vec![PathBuf::from("/")])
}

#[tauri::command]
pub async fn files_read_text(
    input: FileReadDto,
    state: State<'_, SessionState>,
) -> Result<FileDocumentDto, IpcError> {
    let path = validate_file_path(&input.path)?;
    let document = match input.session_id {
        Some(session_id) => state
            .manager()
            .read_file(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
                MAX_TEXT_FILE_BYTES,
            )
            .await
            .map_err(remote_error)?,
        None => file_service::read_local_text(&path)
            .await
            .map_err(file_error)?,
    };
    let content = String::from_utf8(document.bytes.clone())
        .map_err(|_| file_error(FileServiceError::NotUtf8))?;
    Ok(FileDocumentDto {
        size: document.bytes.len() as u64,
        content,
        revision: document.revision,
        modified_at: document.modified_at,
    })
}

#[tauri::command]
pub async fn files_read_binary(
    input: FileReadDto,
    state: State<'_, SessionState>,
) -> Result<Response, IpcError> {
    let path = validate_file_path(&input.path)?;
    let document = match input.session_id {
        Some(session_id) => state
            .manager()
            .read_file(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
                MAX_IMAGE_FILE_BYTES,
            )
            .await
            .map_err(remote_error)?,
        None => file_service::read_local_binary(&path)
            .await
            .map_err(file_error)?,
    };
    Ok(Response::new(document.bytes))
}

#[tauri::command]
pub async fn files_write_text(
    input: FileWriteDto,
    state: State<'_, SessionState>,
) -> Result<FileDocumentDto, IpcError> {
    let path = validate_file_path(&input.path)?;
    let document = match input.session_id {
        Some(session_id) => state
            .manager()
            .write_text_file(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
                input.content,
                input.expected_revision,
            )
            .await
            .map_err(remote_error)?,
        None => file_service::write_local_text(&path, input.content, &input.expected_revision)
            .await
            .map_err(file_error)?,
    };
    document_dto(document)
}

#[tauri::command]
pub async fn files_copy_entry(
    input: FileMutationDto,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    file_service::validate_entry_name(&input.target_name).map_err(mutation_error)?;
    let path = validate_file_path(&input.path)?;
    match input.session_id {
        Some(session_id) => state
            .manager()
            .copy_file(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
                input.target_name,
            )
            .await
            .map_err(remote_mutation_error),
        None => file_service::copy_local_file(&path, &input.target_name)
            .await
            .map_err(mutation_error),
    }
}

#[tauri::command]
pub async fn files_create_entry(
    input: FileCreateDto,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    file_service::validate_entry_name(&input.name).map_err(mutation_error)?;
    let directory = validate_file_path(&input.directory)?;
    match input.session_id {
        Some(session_id) => state
            .manager()
            .create_entry(
                &session_id,
                RemotePath::new(input.directory).map_err(|_| invalid_path())?,
                input.name,
                input.is_directory,
            )
            .await
            .map_err(remote_mutation_error),
        None => file_service::create_local_entry(&directory, &input.name, input.is_directory)
            .await
            .map_err(mutation_error),
    }
}

#[tauri::command]
pub async fn files_rename_entry(
    input: FileMutationDto,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    file_service::validate_entry_name(&input.target_name).map_err(mutation_error)?;
    let path = validate_file_path(&input.path)?;
    match input.session_id {
        Some(session_id) => state
            .manager()
            .rename_entry(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
                input.target_name,
            )
            .await
            .map_err(remote_mutation_error),
        None => file_service::rename_local_entry(&path, &input.target_name)
            .await
            .map_err(mutation_error),
    }
}

#[tauri::command]
pub async fn files_delete_entry(
    input: FileReadDto,
    state: State<'_, SessionState>,
) -> Result<(), IpcError> {
    let path = validate_file_path(&input.path)?;
    match input.session_id {
        Some(session_id) => state
            .manager()
            .delete_entry(
                &session_id,
                RemotePath::new(input.path).map_err(|_| invalid_path())?,
            )
            .await
            .map_err(remote_mutation_error),
        None => file_service::delete_local_entry(&path)
            .await
            .map_err(mutation_error),
    }
}

fn document_dto(document: FileDocument) -> Result<FileDocumentDto, IpcError> {
    let size = document.bytes.len() as u64;
    let content =
        String::from_utf8(document.bytes).map_err(|_| file_error(FileServiceError::NotUtf8))?;
    Ok(FileDocumentDto {
        content,
        revision: document.revision,
        modified_at: document.modified_at,
        size,
    })
}

fn validate_file_path(path: &str) -> Result<PathBuf, IpcError> {
    if path.trim().is_empty() || path.len() > 4096 || path.contains('\0') {
        Err(invalid_path())
    } else {
        Ok(PathBuf::from(path))
    }
}

fn file_error(error: FileServiceError) -> IpcError {
    let application = match error {
        FileServiceError::InvalidPath => {
            ApplicationError::new(ApplicationErrorCode::InvalidFilePath, "文件路径无效", false)
        }
        FileServiceError::Unavailable => ApplicationError::new(
            ApplicationErrorCode::FileUnavailable,
            "无法读取或写入文件",
            true,
        ),
        FileServiceError::TooLarge => ApplicationError::new(
            ApplicationErrorCode::FileTooLarge,
            "文件超过预览或编辑大小限制",
            false,
        ),
        FileServiceError::NotUtf8 => ApplicationError::new(
            ApplicationErrorCode::FileNotUtf8,
            "文件不是支持的 UTF-8 文本",
            false,
        ),
        FileServiceError::Conflict => ApplicationError::new(
            ApplicationErrorCode::FileConflict,
            "文件已在外部发生变化，请重新加载",
            true,
        ),
    };
    IpcError::from(application)
}

fn mutation_error(error: FileServiceError) -> IpcError {
    if error == FileServiceError::Conflict {
        IpcError::from(ApplicationError::new(
            ApplicationErrorCode::FileConflict,
            "目标名称已经存在",
            false,
        ))
    } else {
        file_error(error)
    }
}

fn remote_mutation_error(error: SessionControlError) -> IpcError {
    if error == SessionControlError::FileConflict {
        mutation_error(FileServiceError::Conflict)
    } else {
        remote_error(error)
    }
}

#[tauri::command]
pub async fn files_list_remote(
    input: RemoteDirectoryDto,
    state: State<'_, SessionState>,
) -> Result<DirectoryListingDto, IpcError> {
    let path = RemotePath::new(input.path).map_err(|_| invalid_path())?;
    state
        .manager()
        .list_directory(&input.session_id, path)
        .await
        .map(DirectoryListingDto::from)
        .map_err(remote_error)
}

fn invalid_path() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::InvalidFilePath,
        "文件夹路径无效",
        false,
    ))
}

fn unavailable() -> IpcError {
    IpcError::from(ApplicationError::new(
        ApplicationErrorCode::DirectoryUnavailable,
        "无法读取文件夹内容",
        true,
    ))
}

fn remote_error(error: SessionControlError) -> IpcError {
    match error {
        SessionControlError::SessionNotFound => IpcError::from(ApplicationError::new(
            ApplicationErrorCode::SessionNotFound,
            "SSH 会话不存在",
            false,
        )),
        SessionControlError::SessionNotConnected => IpcError::from(ApplicationError::new(
            ApplicationErrorCode::SessionNotConnected,
            "SSH 会话尚未连接",
            true,
        )),
        SessionControlError::FileTooLarge => file_error(FileServiceError::TooLarge),
        SessionControlError::FileConflict => file_error(FileServiceError::Conflict),
        SessionControlError::FileUnavailable => file_error(FileServiceError::Unavailable),
        _ => unavailable(),
    }
}

impl From<DirectoryListing> for DirectoryListingDto {
    fn from(listing: DirectoryListing) -> Self {
        Self {
            path: listing.path,
            entries: listing
                .entries
                .into_iter()
                .map(FileEntryDto::from)
                .collect(),
        }
    }
}

impl From<FileEntry> for FileEntryDto {
    fn from(entry: FileEntry) -> Self {
        Self {
            name: entry.name,
            path: entry.path,
            is_directory: entry.is_directory,
            is_symlink: entry.is_symlink,
            size: entry.size,
            modified_at: entry.modified_at,
            permission_mode: entry.permission_mode,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use tempfile::tempdir;

    use super::{expand_home_path, files_list_local, files_list_local_roots};

    #[test]
    fn expands_only_the_explicit_home_location() {
        let home = Path::new(r"C:\Users\Test");
        assert_eq!(
            expand_home_path("~", Some(home)).expect("home"),
            home.to_path_buf()
        );
        assert_eq!(
            expand_home_path(".\\~", Some(home)).expect("literal folder"),
            Path::new(r".\~")
        );
    }

    #[test]
    fn lists_local_roots_with_stable_names() {
        let roots = files_list_local_roots().expect("local roots");
        assert!(!roots.is_empty());
        #[cfg(windows)]
        assert!(roots.iter().all(|root| {
            root.name.len() == 2
                && root.name.ends_with(':')
                && root.path.len() == 3
                && root.path.ends_with("\\")
        }));
        #[cfg(not(windows))]
        assert_eq!((roots[0].name.as_str(), roots[0].path.as_str()), ("/", "/"));
    }

    #[tokio::test]
    async fn lists_local_directories_with_directories_first() {
        let directory = tempdir().expect("temporary directory");
        tokio::fs::write(directory.path().join("z.txt"), b"content")
            .await
            .expect("file");
        tokio::fs::create_dir(directory.path().join("a-folder"))
            .await
            .expect("folder");
        let listing = files_list_local(directory.path().to_string_lossy().into_owned())
            .await
            .expect("listing");
        assert_eq!(listing.entries[0].name, "a-folder");
        assert!(listing.entries[0].is_directory);
        #[cfg(windows)]
        assert!(!listing.path.starts_with(r"\\?\"));
        #[cfg(not(unix))]
        assert!(
            listing
                .entries
                .iter()
                .all(|entry| entry.permission_mode.is_none())
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn lists_local_unix_permission_modes() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempdir().expect("temporary directory");
        let file = directory.path().join("script.sh");
        tokio::fs::write(&file, b"content").await.expect("file");
        tokio::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o754))
            .await
            .expect("permissions");
        let listing = files_list_local(directory.path().to_string_lossy().into_owned())
            .await
            .expect("listing");
        assert_eq!(listing.entries[0].permission_mode, Some(0o754));
    }
}
