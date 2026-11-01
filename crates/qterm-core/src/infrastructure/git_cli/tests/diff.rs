use super::*;

#[test]
fn change_diff_respects_head_index_worktree_and_literal_paths() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("diff repo");
    let repository = directory.path();
    executor.initialize(repository).expect("init");
    configure_identity(&git, repository);
    fs::write(repository.join("dual.txt"), b"head\n").expect("dual fixture");
    fs::write(repository.join("rename-old.txt"), b"rename base\n").expect("rename fixture");
    fs::write(repository.join("move-old.txt"), b"move base\n").expect("move fixture");
    executor.stage_all(repository).expect("stage base");
    executor.commit(repository, "base").expect("commit base");

    fs::write(repository.join("dual.txt"), b"index\n").expect("index content");
    executor
        .stage(repository, &["dual.txt".into()])
        .expect("stage dual");
    fs::write(repository.join("dual.txt"), b"worktree\n").expect("worktree content");

    let staged = executor
        .change_diff(repository, "dual.txt", true)
        .expect("staged diff");
    assert_eq!(staged.before_source, GitDiffSource::Head);
    assert_eq!(staged.after_source, GitDiffSource::Index);
    assert_eq!(staged.before.content.as_deref(), Some("head\n"));
    assert_eq!(staged.after.content.as_deref(), Some("index\n"));

    let unstaged = executor
        .change_diff(repository, "dual.txt", false)
        .expect("unstaged diff");
    assert_eq!(unstaged.before_source, GitDiffSource::Index);
    assert_eq!(unstaged.after_source, GitDiffSource::Worktree);
    assert_eq!(unstaged.before.content.as_deref(), Some("index\n"));
    assert_eq!(unstaged.after.content.as_deref(), Some("worktree\n"));

    fs::write(repository.join("-奇异.txt"), b"literal\n").expect("literal fixture");
    let untracked = executor
        .change_diff(repository, "-奇异.txt", false)
        .expect("untracked diff");
    assert_eq!(untracked.before.kind, GitConflictContentKind::Missing);
    assert_eq!(untracked.after.content.as_deref(), Some("literal\n"));

    fs::remove_file(repository.join("rename-old.txt")).expect("delete fixture");
    let deleted = executor
        .change_diff(repository, "rename-old.txt", false)
        .expect("delete diff");
    assert_eq!(deleted.before.content.as_deref(), Some("rename base\n"));
    assert_eq!(deleted.after.kind, GitConflictContentKind::Missing);

    run_git_test(
        &git,
        [
            "-C",
            path(repository),
            "mv",
            "--",
            "move-old.txt",
            "move-new.txt",
        ],
    );
    let renamed = executor
        .change_diff(repository, "move-new.txt", true)
        .expect("rename diff");
    assert_eq!(renamed.original_path.as_deref(), Some("move-old.txt"));
    assert_eq!(renamed.before.content.as_deref(), Some("move base\n"));
    assert_eq!(renamed.after.content.as_deref(), Some("move base\n"));
}

#[test]
fn real_git_commit_file_diff_uses_the_first_parent_and_empty_tree_baselines() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("commit diff fixture");
    let repository = directory.path();
    executor.initialize(repository).expect("init");
    configure_identity(&git, repository);
    fs::write(
        repository.join("rename-me.txt"),
        b"rename baseline\nshared content\n",
    )
    .expect("rename fixture");
    fs::write(repository.join("delete-me.txt"), b"deleted baseline\n").expect("delete fixture");
    fs::write(repository.join("modify-me.txt"), b"before modification\n").expect("modify fixture");
    fs::write(repository.join("-literal[ab].bin"), [0_u8, 1, 2]).expect("literal binary fixture");
    executor.stage_all(repository).expect("stage root");
    let root = executor.commit(repository, "root").expect("root commit");
    let root_oid = root.head.oid.expect("root oid");

    let root_diff = executor
        .commit_file_diff(repository, &root_oid, "rename-me.txt")
        .expect("root diff");
    assert_eq!(root_diff.parent_oid, None);
    assert_eq!(root_diff.before.kind, GitConflictContentKind::Missing);
    assert_eq!(
        root_diff.after.content.as_deref(),
        Some("rename baseline\nshared content\n")
    );
    let literal_binary = executor
        .commit_file_diff(repository, &root_oid, "-literal[ab].bin")
        .expect("literal binary root diff");
    assert_eq!(literal_binary.before.kind, GitConflictContentKind::Missing);
    assert_eq!(literal_binary.after.kind, GitConflictContentKind::Binary);

    fs::rename(
        repository.join("rename-me.txt"),
        repository.join("renamed.txt"),
    )
    .expect("rename file");
    fs::remove_file(repository.join("delete-me.txt")).expect("delete file");
    fs::write(repository.join("modify-me.txt"), b"after modification\n").expect("modify file");
    fs::write(repository.join("added.txt"), b"new file\n").expect("add file");
    executor.stage_all(repository).expect("stage second");
    let second = executor
        .commit(repository, "change files")
        .expect("second commit");
    let second_oid = second.head.oid.expect("second oid");

    let renamed = executor
        .commit_file_diff(repository, &second_oid, "renamed.txt")
        .expect("rename diff");
    assert_eq!(renamed.parent_oid.as_deref(), Some(root_oid.as_str()));
    assert_eq!(renamed.original_path.as_deref(), Some("rename-me.txt"));
    assert_eq!(
        renamed.before.content.as_deref(),
        Some("rename baseline\nshared content\n")
    );
    assert_eq!(renamed.after.content, renamed.before.content);

    let deleted = executor
        .commit_file_diff(repository, &second_oid, "delete-me.txt")
        .expect("delete diff");
    assert_eq!(
        deleted.before.content.as_deref(),
        Some("deleted baseline\n")
    );
    assert_eq!(deleted.after.kind, GitConflictContentKind::Missing);

    let added = executor
        .commit_file_diff(repository, &second_oid, "added.txt")
        .expect("add diff");
    assert_eq!(added.before.kind, GitConflictContentKind::Missing);
    assert_eq!(added.after.content.as_deref(), Some("new file\n"));

    let modified = executor
        .commit_file_diff(repository, &second_oid, "modify-me.txt")
        .expect("modify diff");
    assert_eq!(
        modified.before.content.as_deref(),
        Some("before modification\n")
    );
    assert_eq!(
        modified.after.content.as_deref(),
        Some("after modification\n")
    );
}
