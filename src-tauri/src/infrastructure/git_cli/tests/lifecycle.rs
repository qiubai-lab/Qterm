use super::*;

#[test]
fn real_git_repository_supports_init_stage_commit_and_branch_snapshot() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git);
    let directory = tempdir().expect("repo");
    let first = executor.initialize(directory.path()).expect("init");
    assert!(first.head.unborn);
    fs::write(directory.path().join("hello world.txt"), b"hello").expect("fixture");
    let staged = executor.stage_all(directory.path()).expect("stage");
    assert!(staged.changes.iter().any(|change| change.staged));
    let unstaged = executor
        .unstage(directory.path(), &["hello world.txt".into()])
        .expect("unstage unborn file");
    assert!(unstaged.changes.iter().all(|change| !change.staged));
    executor
        .stage(directory.path(), &["hello world.txt".into()])
        .expect("stage one path");
    Command::new(executor.executable.as_ref().expect("git"))
        .args([
            "-C",
            directory.path().to_str().expect("path"),
            "config",
            "user.name",
            "Qterm Test",
        ])
        .status()
        .expect("name");
    Command::new(executor.executable.as_ref().expect("git"))
        .args([
            "-C",
            directory.path().to_str().expect("path"),
            "config",
            "user.email",
            "qterm@example.invalid",
        ])
        .status()
        .expect("email");
    let committed = executor
        .commit(directory.path(), "feat: initial")
        .expect("commit");
    assert_eq!(committed.commits.len(), 1);
    let commit_files = executor
        .commit_files(
            directory.path(),
            committed.head.oid.as_deref().expect("commit oid"),
        )
        .expect("commit files");
    assert_eq!(commit_files.len(), 1);
    assert_eq!(commit_files[0].path, "hello world.txt");
    assert_eq!(commit_files[0].status, "A");
    let base_branch = committed.head.name.clone().expect("base branch");
    let branched = executor
        .create_branch(directory.path(), "feature/test")
        .expect("branch");
    assert_eq!(branched.head.name.as_deref(), Some("feature/test"));
    fs::write(directory.path().join("hello world.txt"), b"feature").expect("branch change");
    executor.stage_all(directory.path()).expect("stage branch");
    executor
        .commit(directory.path(), "feat: branch change")
        .expect("branch commit");
    executor
        .switch_branch(directory.path(), &base_branch)
        .expect("switch base");
    fs::write(directory.path().join("hello world.txt"), b"local").expect("local change");
    assert!(matches!(
        executor.switch_branch(directory.path(), "feature/test"),
        Err(GitError::Conflict(_))
    ));
    let unchanged = executor
        .snapshot(directory.path())
        .expect("unchanged branch");
    assert_eq!(unchanged.head.name.as_deref(), Some(base_branch.as_str()));
    assert!(!unchanged.changes.is_empty());

    fs::write(directory.path().join(".git/index.lock"), b"locked").expect("index lock");
    assert!(matches!(
        executor.stage_all(directory.path()),
        Err(GitError::CommandFailed(_))
    ));
    fs::remove_file(directory.path().join(".git/index.lock")).expect("remove lock");
}

#[test]
fn real_git_literal_pathspec_stage_and_unstage_preserve_the_selected_filename() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("literal pathspec repository");
    executor.initialize(directory.path()).expect("init");
    fs::write(directory.path().join("[ab].txt"), b"literal\n").expect("literal fixture");
    fs::write(directory.path().join("a.txt"), b"pattern match\n").expect("pattern fixture");

    let staged = executor
        .stage(directory.path(), &["[ab].txt".into()])
        .expect("stage literal path");
    assert!(
        staged
            .changes
            .iter()
            .any(|change| change.path == "[ab].txt" && change.staged)
    );
    assert!(
        staged
            .changes
            .iter()
            .any(|change| change.path == "a.txt" && !change.staged)
    );

    executor
        .stage_all(directory.path())
        .expect("stage all paths");
    let unstaged = executor
        .unstage(directory.path(), &["[ab].txt".into()])
        .expect("unstage literal path");
    assert!(
        unstaged
            .changes
            .iter()
            .any(|change| change.path == "[ab].txt" && !change.staged)
    );
    assert!(
        unstaged
            .changes
            .iter()
            .any(|change| change.path == "a.txt" && change.staged)
    );

    configure_identity(&git, directory.path());
    executor
        .stage_all(directory.path())
        .expect("restage all paths");
    executor
        .commit(directory.path(), "test: literal pathspec")
        .expect("commit fixture");
    fs::write(directory.path().join("[ab].txt"), b"literal changed\n")
        .expect("modify literal fixture");
    fs::write(directory.path().join("a.txt"), b"pattern changed\n")
        .expect("modify pattern fixture");
    executor
        .stage_all(directory.path())
        .expect("stage changed paths");

    let reset = executor
        .unstage(directory.path(), &["[ab].txt".into()])
        .expect("reset literal path with HEAD");
    assert!(
        reset
            .changes
            .iter()
            .any(|change| change.path == "[ab].txt" && !change.staged)
    );
    assert!(
        reset
            .changes
            .iter()
            .any(|change| change.path == "a.txt" && change.staged)
    );
}

#[test]
fn real_git_discard_restores_the_index_and_removes_only_selected_untracked_files() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("discard repository");
    executor.initialize(directory.path()).expect("init");
    for (key, value) in [
        ("user.name", "Qterm Test"),
        ("user.email", "qterm@example.invalid"),
    ] {
        assert!(
            Command::new(&git)
                .args([
                    "-C",
                    directory.path().to_str().expect("path"),
                    "config",
                    key,
                    value,
                ])
                .status()
                .expect("config")
                .success()
        );
    }
    let tracked = directory.path().join("tracked.txt");
    fs::write(&tracked, b"base\n").expect("base");
    executor.stage_all(directory.path()).expect("stage base");
    executor
        .commit(directory.path(), "base")
        .expect("commit base");
    fs::write(&tracked, b"staged\n").expect("staged content");
    executor
        .stage(directory.path(), &["tracked.txt".into()])
        .expect("stage selected content");
    fs::write(&tracked, b"worktree\n").expect("worktree content");
    let selected_untracked = directory.path().join("selected.tmp");
    let retained_untracked = directory.path().join("retained.tmp");
    fs::write(&selected_untracked, b"delete").expect("selected untracked");
    fs::write(&retained_untracked, b"keep").expect("retained untracked");

    let result = executor
        .discard(
            directory.path(),
            &["tracked.txt".into(), "selected.tmp".into()],
        )
        .expect("discard");
    assert_eq!(
        String::from_utf8_lossy(&fs::read(&tracked).expect("restored tracked")).trim_end(),
        "staged"
    );
    assert!(!selected_untracked.exists());
    assert!(retained_untracked.exists());
    assert!(
        result
            .changes
            .iter()
            .any(|change| change.path == "tracked.txt" && change.staged)
    );
    assert!(
        !result
            .changes
            .iter()
            .any(|change| change.path == "tracked.txt" && !change.staged)
    );
    assert!(
        executor
            .discard(directory.path(), &["missing.txt".into()])
            .is_err()
    );
}

#[test]
fn real_git_creates_and_switches_branch_from_historical_commit() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("historical commit fixture");
    run_git_test(&git, ["init", path(directory.path())]);
    configure_identity(&git, directory.path());

    fs::write(directory.path().join("history.txt"), b"first\n").expect("first file");
    run_git_test(&git, ["-C", path(directory.path()), "add", "history.txt"]);
    run_git_test(
        &git,
        ["-C", path(directory.path()), "commit", "-m", "first"],
    );
    let first_oid = executor
        .snapshot(directory.path())
        .expect("first snapshot")
        .head
        .oid
        .expect("first oid");

    fs::write(directory.path().join("history.txt"), b"second\n").expect("second file");
    run_git_test(&git, ["-C", path(directory.path()), "add", "history.txt"]);
    run_git_test(
        &git,
        ["-C", path(directory.path()), "commit", "-m", "second"],
    );

    let created = executor
        .create_branch_from_commit(directory.path(), "feature/history", &first_oid)
        .expect("create branch from historical commit");
    assert_eq!(created.head.name.as_deref(), Some("feature/history"));
    assert_eq!(created.head.oid.as_deref(), Some(first_oid.as_str()));
    assert_eq!(
        fs::read_to_string(directory.path().join("history.txt")).expect("historical worktree"),
        "first\n"
    );
    assert!(matches!(
        executor.create_branch_from_commit(directory.path(), "feature/invalid", "abcdef0"),
        Err(GitError::InvalidInput)
    ));
}

#[test]
fn failed_commit_does_not_create_history() {
    let executor = SystemGitExecutor::with_executable(which_git());
    let directory = tempdir().expect("repo");
    executor.initialize(directory.path()).expect("init");
    fs::write(directory.path().join("staged.txt"), b"staged").expect("fixture");
    executor.stage_all(directory.path()).expect("stage");
    for key in ["user.name", "user.email"] {
        Command::new(executor.executable.as_ref().expect("git"))
            .args([
                "-C",
                directory.path().to_str().expect("path"),
                "config",
                key,
                "",
            ])
            .status()
            .expect("empty identity");
    }
    assert!(matches!(
        executor.commit(directory.path(), "feat: should fail"),
        Err(GitError::CommandFailed(_))
    ));
    let snapshot = executor.snapshot(directory.path()).expect("snapshot");
    assert!(snapshot.head.unborn);
    assert!(snapshot.changes.iter().any(|change| change.staged));
}
