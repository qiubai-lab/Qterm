use super::*;

pub(super) fn initialize_submodule(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_initialize_submodule(&current, path)?;
    executor
        .network_mutate(
            repository,
            [
                OsStr::new("--literal-pathspecs"),
                OsStr::new("submodule"),
                OsStr::new("update"),
                OsStr::new("--init"),
                OsStr::new("--checkout"),
                OsStr::new("--"),
                OsStr::new(path),
            ],
        )
        .map_err(sanitize_submodule_operation_error)
}

pub(super) fn checkout_submodule(
    executor: &SystemGitExecutor,
    repository: &Path,
    path: &str,
) -> Result<GitSnapshot, GitError> {
    let current = executor.snapshot(repository)?;
    validate_checkout_submodule(&current, path)?;
    executor
        .network_mutate(
            repository,
            [
                OsStr::new("--literal-pathspecs"),
                OsStr::new("submodule"),
                OsStr::new("update"),
                OsStr::new("--checkout"),
                OsStr::new("--"),
                OsStr::new(path),
            ],
        )
        .map_err(sanitize_submodule_operation_error)
}
