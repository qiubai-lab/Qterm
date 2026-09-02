use super::*;

#[derive(Clone)]
struct GitBlobEntry {
    oid: String,
    mode: u32,
}

pub(super) fn missing_version() -> GitConflictVersion {
    GitConflictVersion {
        kind: GitConflictContentKind::Missing,
        content: None,
        size: 0,
        mode: None,
    }
}

pub(super) fn head_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    if !executor.has_head(repository) {
        return Ok(missing_version());
    }
    tree_version(executor, repository, "HEAD", path)
}

pub(super) fn tree_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    revision: &str,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-tree"),
            OsString::from("-z"),
            OsString::from(revision),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let entry = parse_tree_entry(&output.stdout, path)?;
    entry.map_or_else(
        || Ok(missing_version()),
        |entry| blob_version(executor, repository, entry),
    )
}

pub(super) fn commit_parent_oid(
    executor: &SystemGitExecutor,
    repository: &Path,
    oid: &str,
) -> Result<Option<String>, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("rev-list"),
            OsString::from("--parents"),
            OsString::from("-n"),
            OsString::from("1"),
            OsString::from(oid),
        ],
        READ_TIMEOUT,
    )?;
    let line = String::from_utf8_lossy(&output.stdout);
    let mut fields = line.split_whitespace();
    let commit = fields.next().ok_or(GitError::Io)?;
    if commit != oid {
        return Err(GitError::Io);
    }
    Ok(fields.next().map(str::to_owned))
}

pub(super) fn index_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-files"),
            OsString::from("--stage"),
            OsString::from("-z"),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let entry = parse_index_entry(&output.stdout, path)?;
    entry.map_or_else(
        || Ok(missing_version()),
        |entry| blob_version(executor, repository, entry),
    )
}

fn parse_tree_entry(bytes: &[u8], path: &str) -> Result<Option<GitBlobEntry>, GitError> {
    let Some(record) = bytes
        .split(|byte| *byte == 0)
        .find(|record| !record.is_empty())
    else {
        return Ok(None);
    };
    let mut pieces = record.splitn(2, |byte| *byte == b'\t');
    let metadata = pieces.next().ok_or(GitError::Io)?;
    if pieces.next().ok_or(GitError::Io)? != path.as_bytes() {
        return Ok(None);
    }
    let metadata = String::from_utf8_lossy(metadata);
    let fields = metadata.split_whitespace().collect::<Vec<_>>();
    Ok(Some(GitBlobEntry {
        mode: fields
            .first()
            .and_then(|value| u32::from_str_radix(value, 8).ok())
            .ok_or(GitError::Io)?,
        oid: fields.get(2).ok_or(GitError::Io)?.to_string(),
    }))
}

fn parse_index_entry(bytes: &[u8], path: &str) -> Result<Option<GitBlobEntry>, GitError> {
    for record in bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let mut pieces = record.splitn(2, |byte| *byte == b'\t');
        let metadata = pieces.next().ok_or(GitError::Io)?;
        if pieces.next().ok_or(GitError::Io)? != path.as_bytes() {
            continue;
        }
        let metadata = String::from_utf8_lossy(metadata);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.get(2) != Some(&"0") {
            continue;
        }
        return Ok(Some(GitBlobEntry {
            mode: fields
                .first()
                .and_then(|value| u32::from_str_radix(value, 8).ok())
                .ok_or(GitError::Io)?,
            oid: fields.get(1).ok_or(GitError::Io)?.to_string(),
        }));
    }
    Ok(None)
}

fn blob_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    entry: GitBlobEntry,
) -> Result<GitConflictVersion, GitError> {
    if !is_regular_mode(entry.mode) {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(entry.mode),
        });
    }
    let size_output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("-s"),
            OsString::from(&entry.oid),
        ],
        READ_TIMEOUT,
    )?;
    let size = String::from_utf8_lossy(&size_output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|_| GitError::Io)?;
    if size > MAX_GIT_DIFF_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(entry.mode),
        });
    }
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("blob"),
            OsString::from(&entry.oid),
        ],
        READ_TIMEOUT,
    )?;
    let content = std::str::from_utf8(&output.stdout)
        .ok()
        .filter(|_| !output.stdout.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(entry.mode),
    })
}

pub(super) fn worktree_version(
    repository: &Path,
    path: &str,
) -> Result<GitConflictVersion, GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(missing_version()),
        Err(_) => return Err(GitError::Io),
    };
    if !metadata.file_type().is_file() {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: metadata.len(),
            mode: None,
        });
    }
    let size = metadata.len();
    if size > MAX_GIT_DIFF_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(0o100644),
        });
    }
    let bytes = fs::read(target).map_err(|_| GitError::Io)?;
    let content = std::str::from_utf8(&bytes)
        .ok()
        .filter(|_| !bytes.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(0o100644),
    })
}

#[derive(Clone, Copy)]
struct ConflictStage {
    stage: u8,
    mode: u32,
}

pub(super) fn conflict_detail_local(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictDetail, GitError> {
    let snapshot = executor.snapshot(repository)?;
    if !snapshot.merge_in_progress {
        return Err(GitError::Conflict("当前仓库没有未完成的合并".into()));
    }
    if snapshot.merge_head_oid.is_none() {
        return Err(GitError::Conflict(
            "多来源合并冲突需要使用终端或外部 Git 工具处理".into(),
        ));
    }
    let change = snapshot
        .changes
        .iter()
        .find(|change| change.conflict && change.path == path)
        .ok_or_else(|| GitError::Conflict("该路径不再是未解决冲突".into()))?;
    let stages = conflict_stages(executor, repository, path)?;
    let base = conflict_stage_version(executor, repository, path, &stages, 1)?;
    let current = conflict_stage_version(executor, repository, path, &stages, 2)?;
    let incoming = conflict_stage_version(executor, repository, path, &stages, 3)?;
    let result = conflict_result(repository, path)?;
    let kind = change.conflict_kind.unwrap_or(GitConflictKind::Other);
    Ok(build_conflict_detail(
        path.to_owned(),
        kind,
        base,
        current,
        incoming,
        result,
    ))
}

pub(crate) fn build_conflict_detail(
    path: String,
    kind: GitConflictKind,
    base: GitConflictVersion,
    current: GitConflictVersion,
    incoming: GitConflictVersion,
    result: GitConflictResult,
) -> GitConflictDetail {
    let supported_kind = !matches!(kind, GitConflictKind::Other | GitConflictKind::BothDeleted);
    let versions_textual = [&base, &current, &incoming].iter().all(|version| {
        matches!(
            version.kind,
            GitConflictContentKind::Missing | GitConflictContentKind::Text
        )
    });
    let editable = supported_kind
        && versions_textual
        && result.kind == GitConflictContentKind::Text
        && result.mode.is_some_and(is_regular_mode);
    let unsupported_reason = if editable
        || [current.kind, incoming.kind].iter().any(|kind| {
            matches!(
                kind,
                GitConflictContentKind::Text | GitConflictContentKind::Binary
            )
        }) {
        None
    } else if matches!(kind, GitConflictKind::Other | GitConflictKind::BothDeleted) {
        Some("该冲突类型需要使用终端或外部 Git 工具处理".into())
    } else {
        Some("该文件类型不支持应用内编辑".into())
    };
    GitConflictDetail {
        path,
        kind,
        base,
        current,
        incoming,
        result,
        editable,
        unsupported_reason,
    }
}

fn conflict_stages(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<Vec<ConflictStage>, GitError> {
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("--literal-pathspecs"),
            OsString::from("ls-files"),
            OsString::from("--unmerged"),
            OsString::from("-z"),
            OsString::from("--"),
            OsString::from(path),
        ],
        READ_TIMEOUT,
    )?;
    let mut stages = Vec::new();
    for record in output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let mut parts = record.splitn(2, |byte| *byte == b'\t');
        let metadata = parts.next().ok_or(GitError::Io)?;
        let record_path = parts.next().ok_or(GitError::Io)?;
        if record_path != path.as_bytes() {
            continue;
        }
        let metadata = String::from_utf8_lossy(metadata);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        let mode = fields
            .first()
            .and_then(|value| u32::from_str_radix(value, 8).ok())
            .ok_or(GitError::Io)?;
        let stage = fields
            .get(2)
            .and_then(|value| value.parse::<u8>().ok())
            .ok_or(GitError::Io)?;
        stages.push(ConflictStage { stage, mode });
    }
    if stages.is_empty() {
        return Err(GitError::Conflict("该路径不再是未解决冲突".into()));
    }
    Ok(stages)
}

fn conflict_stage_version(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
    stages: &[ConflictStage],
    stage: u8,
) -> Result<GitConflictVersion, GitError> {
    let Some(entry) = stages.iter().find(|entry| entry.stage == stage) else {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Missing,
            content: None,
            size: 0,
            mode: None,
        });
    };
    if !is_regular_mode(entry.mode) {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size: 0,
            mode: Some(entry.mode),
        });
    }
    let object = format!(":{stage}:{path}");
    let size_output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("-s"),
            OsString::from(&object),
        ],
        READ_TIMEOUT,
    )?;
    let size = String::from_utf8_lossy(&size_output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|_| GitError::Io)?;
    if size > MAX_CONFLICT_TEXT_BYTES as u64 {
        return Ok(GitConflictVersion {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            size,
            mode: Some(entry.mode),
        });
    }
    let output = executor.git(
        [
            OsString::from("-C"),
            repository.as_os_str().to_owned(),
            OsString::from("cat-file"),
            OsString::from("blob"),
            OsString::from(object),
        ],
        READ_TIMEOUT,
    )?;
    let content = std::str::from_utf8(&output.stdout)
        .ok()
        .filter(|_| !output.stdout.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictVersion {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        size,
        mode: Some(entry.mode),
    })
}

pub(super) fn conflict_result(
    repository: &Path,
    path: &str,
) -> Result<GitConflictResult, GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(GitConflictResult {
                kind: GitConflictContentKind::Missing,
                content: None,
                revision: "missing".into(),
                size: 0,
                mode: None,
            });
        }
        Err(_) => return Err(GitError::Io),
    };
    if !metadata.file_type().is_file() {
        return Ok(GitConflictResult {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            revision: "unsupported".into(),
            size: metadata.len(),
            mode: None,
        });
    }
    if metadata.len() > MAX_CONFLICT_TEXT_BYTES as u64 {
        return Ok(GitConflictResult {
            kind: GitConflictContentKind::Unsupported,
            content: None,
            revision: format!("oversize:{}", metadata.len()),
            size: metadata.len(),
            mode: Some(0o100644),
        });
    }
    let bytes = fs::read(target).map_err(|_| GitError::Io)?;
    let content = std::str::from_utf8(&bytes)
        .ok()
        .filter(|_| !bytes.contains(&0))
        .map(str::to_owned);
    Ok(GitConflictResult {
        kind: if content.is_some() {
            GitConflictContentKind::Text
        } else {
            GitConflictContentKind::Binary
        },
        content,
        revision: content_revision(&bytes),
        size: bytes.len() as u64,
        mode: Some(0o100644),
    })
}

fn conflict_worktree_path(repository: &Path, path: &str) -> Result<PathBuf, GitError> {
    let root = repository
        .canonicalize()
        .map_err(|_| GitError::InvalidPath)?;
    let target = root.join(path);
    let parent = target.parent().ok_or(GitError::InvalidPath)?;
    let parent = parent.canonicalize().map_err(|_| GitError::InvalidPath)?;
    if !parent.starts_with(&root) {
        return Err(GitError::InvalidPath);
    }
    if target.exists() {
        let canonical = target.canonicalize().map_err(|_| GitError::InvalidPath)?;
        if !canonical.starts_with(&root) {
            return Err(GitError::InvalidPath);
        }
    }
    Ok(target)
}

pub(super) fn write_conflict_text(
    repository: &Path,
    path: &str,
    bytes: &[u8],
) -> Result<(), GitError> {
    let target = conflict_worktree_path(repository, path)?;
    let mut file = AtomicWriteFile::open(&target).map_err(|_| GitError::Io)?;
    file.write_all(bytes).map_err(|_| GitError::Io)?;
    file.commit().map_err(|_| GitError::Io)
}

pub(super) fn ensure_regular_side(
    version: &GitConflictVersion,
    message: &str,
) -> Result<(), GitError> {
    if version.mode.is_some_and(is_regular_mode)
        && matches!(
            version.kind,
            GitConflictContentKind::Text | GitConflictContentKind::Binary
        )
    {
        Ok(())
    } else {
        Err(GitError::Conflict(message.into()))
    }
}

fn is_regular_mode(mode: u32) -> bool {
    matches!(mode, 0o100644 | 0o100755)
}

pub(super) fn conflict_detail(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitConflictDetail, GitError> {
    let repository = executor.repository_root(repository)?;
    conflict_detail_local(executor, &repository, path)
}

pub(super) fn resolve_conflict(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
    resolution: &GitConflictResolution,
) -> Result<GitSnapshot, GitError> {
    let repository = executor.repository_root(repository)?;
    let detail = conflict_detail_local(executor, &repository, path)?;
    match resolution {
        GitConflictResolution::SaveText {
            content,
            expected_revision,
        } => {
            if !detail.editable || detail.result.revision != *expected_revision {
                return Err(GitError::Conflict(
                    "冲突文件已在外部变化，请重新加载".into(),
                ));
            }
            write_conflict_text(&repository, path, content.as_bytes())?;
            executor.stage(&repository, &[path.to_owned()])
        }
        GitConflictResolution::UseCurrent => {
            ensure_regular_side(&detail.current, "当前版本不存在或不支持直接采用")?;
            executor.checkout_conflict_side(&repository, path, "--ours")?;
            executor.stage(&repository, &[path.to_owned()])
        }
        GitConflictResolution::UseIncoming => {
            ensure_regular_side(&detail.incoming, "传入版本不存在或不支持直接采用")?;
            executor.checkout_conflict_side(&repository, path, "--theirs")?;
            executor.stage(&repository, &[path.to_owned()])
        }
        GitConflictResolution::Delete => {
            if detail.current.kind != GitConflictContentKind::Missing
                && detail.incoming.kind != GitConflictContentKind::Missing
            {
                return Err(GitError::Conflict("该冲突不能直接选择删除结果".into()));
            }
            executor.mutate(
                &repository,
                [
                    OsStr::new("--literal-pathspecs"),
                    OsStr::new("rm"),
                    OsStr::new("-f"),
                    OsStr::new("--"),
                    OsStr::new(path),
                ],
            )
        }
        GitConflictResolution::MarkResolved => {
            if detail.result.kind == GitConflictContentKind::Missing {
                return Err(GitError::Conflict("结果文件不存在，请选择删除结果".into()));
            }
            executor.stage(&repository, &[path.to_owned()])
        }
    }
}
