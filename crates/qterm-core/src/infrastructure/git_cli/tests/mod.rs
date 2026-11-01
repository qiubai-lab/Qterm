use super::{
    OUTPUT_LIMIT, SystemGitExecutor, classify_failure, parse_branches, parse_commit_files,
    parse_commits, parse_status, parse_submodules, read_bounded, run_process,
    sanitize_submodule_operation_error,
};
use crate::domain::git::{
    GitBranchKind, GitConflictContentKind, GitConflictKind, GitConflictResolution, GitDiffSource,
    GitError, GitSubmoduleIssue, MAX_CONFLICT_TEXT_BYTES, find_tracking_local_branch,
};
use crate::ports::git_executor::GitExecutor;
use std::{fs, io::Cursor, process::Command};
use tempfile::tempdir;

mod conflict;
mod diff;
mod lifecycle;
mod parsers;
mod process;
mod submodule;
mod sync;

fn which_git() -> std::path::PathBuf {
    let output = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("git")
        .output()
        .expect("find git");
    std::path::PathBuf::from(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .expect("git path"),
    )
}

fn run_git_test<I, S>(git: &std::path::Path, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let output = Command::new(git)
        .args(args)
        .output()
        .expect("run Git fixture");
    assert!(
        output.status.success(),
        "Git fixture failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn configure_identity(git: &std::path::Path, repository: &std::path::Path) {
    run_git_test(
        git,
        ["-C", path(repository), "config", "core.autocrlf", "false"],
    );
    run_git_test(
        git,
        ["-C", path(repository), "config", "user.name", "Qterm Test"],
    );
    run_git_test(
        git,
        [
            "-C",
            path(repository),
            "config",
            "user.email",
            "qterm@example.invalid",
        ],
    );
}

fn rev_parse(git: &std::path::Path, repository: &std::path::Path, reference: &str) -> String {
    let output = Command::new(git)
        .args(["-C", path(repository), "rev-parse", reference])
        .output()
        .expect("rev-parse");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

fn path(value: &std::path::Path) -> &str {
    value.to_str().expect("UTF-8 fixture path")
}
