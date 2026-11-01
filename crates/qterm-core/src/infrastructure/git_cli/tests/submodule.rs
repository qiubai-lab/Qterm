use super::*;

#[test]
fn real_git_submodule_snapshot_and_safe_lifecycle_preserve_parent_semantics() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let fixture = tempdir().expect("submodule fixture");
    let grandchild = fixture.path().join("grandchild-source");
    let child = fixture.path().join("child-source");
    let parent = fixture.path().join("parent");
    let parent_remote = fixture.path().join("parent-remote.git");
    fs::create_dir(&grandchild).expect("grandchild directory");
    fs::create_dir(&child).expect("child directory");
    fs::create_dir(&parent).expect("parent directory");
    executor
        .initialize(&grandchild)
        .expect("initialize grandchild");
    configure_identity(&git, &grandchild);
    fs::write(grandchild.join("nested.txt"), b"nested\n").expect("grandchild file");
    executor.stage_all(&grandchild).expect("stage grandchild");
    executor
        .commit(&grandchild, "grandchild v1")
        .expect("commit grandchild");
    executor.initialize(&child).expect("initialize child");
    configure_identity(&git, &child);
    fs::write(child.join("child.txt"), b"first\n").expect("child v1");
    run_git_test(
        &git,
        [
            "-c",
            "protocol.file.allow=always",
            "-C",
            path(&child),
            "submodule",
            "add",
            path(&grandchild),
            "deps/grandchild",
        ],
    );
    executor.stage_all(&child).expect("stage child v1");
    let first_oid = executor
        .commit(&child, "child v1")
        .expect("commit child v1")
        .head
        .oid
        .expect("child v1 oid");

    executor.initialize(&parent).expect("initialize parent");
    configure_identity(&git, &parent);
    run_git_test(
        &git,
        [
            "-c",
            "protocol.file.allow=always",
            "-C",
            path(&parent),
            "submodule",
            "add",
            path(&child),
            "modules/child",
        ],
    );
    executor.stage_all(&parent).expect("stage submodule");
    executor
        .commit(&parent, "add child")
        .expect("commit parent");
    run_git_test(&git, ["init", "--bare", path(&parent_remote)]);
    run_git_test(
        &git,
        [
            "-C",
            path(&parent),
            "remote",
            "add",
            "origin",
            path(&parent_remote),
        ],
    );
    run_git_test(&git, ["-C", path(&parent), "push", "-u", "origin", "HEAD"]);

    fs::write(child.join("child.txt"), b"second\n").expect("child v2");
    executor.stage_all(&child).expect("stage child v2");
    let second_oid = executor
        .commit(&child, "child v2")
        .expect("commit child v2")
        .head
        .oid
        .expect("child v2 oid");
    let checked_out_child = parent.join("modules/child");
    run_git_test(&git, ["-C", path(&checked_out_child), "fetch", "origin"]);
    run_git_test(
        &git,
        ["-C", path(&checked_out_child), "checkout", &second_oid],
    );

    let changed = executor
        .snapshot(&parent)
        .expect("changed submodule snapshot");
    assert_eq!(changed.submodules.len(), 1);
    assert_eq!(changed.submodules[0].path, "modules/child");
    assert_eq!(
        changed.submodules[0].recorded_oid.as_deref(),
        Some(first_oid.as_str())
    );
    assert_eq!(
        changed.submodules[0].current_oid.as_deref(),
        Some(second_oid.as_str())
    );
    assert!(changed.submodules[0].commit_changed);
    assert!(changed.changes.iter().any(|change| {
        change.path == "modules/child"
            && !change.staged
            && change
                .submodule
                .as_ref()
                .is_some_and(|state| state.commit_changed)
    }));

    let staged = executor
        .stage(&parent, &["modules/child".into()])
        .expect("stage gitlink");
    assert!(
        staged
            .changes
            .iter()
            .any(|change| change.path == "modules/child" && change.staged)
    );
    let unstaged = executor
        .unstage(&parent, &["modules/child".into()])
        .expect("unstage gitlink");
    assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), second_oid);
    assert!(unstaged.submodules[0].commit_changed);

    executor
        .checkout_submodule(&parent, "modules/child")
        .expect("restore recorded child commit");
    assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), first_oid);

    run_git_test(
        &git,
        ["-C", path(&checked_out_child), "checkout", &second_oid],
    );
    fs::write(checked_out_child.join("child.txt"), b"dirty\n").expect("dirty child");
    let dirty = executor.snapshot(&parent).expect("dirty child snapshot");
    assert!(dirty.submodules[0].tracked_modified);
    assert!(executor.stage(&parent, &["modules/child".into()]).is_ok());
    executor
        .unstage(&parent, &["modules/child".into()])
        .expect("restore parent index after gitlink test");
    assert!(matches!(
        executor.checkout_submodule(&parent, "modules/child"),
        Err(GitError::Conflict(_))
    ));

    run_git_test(
        &git,
        [
            "-C",
            path(&checked_out_child),
            "reset",
            "--hard",
            &first_oid,
        ],
    );
    run_git_test(
        &git,
        [
            "-C",
            path(&parent),
            "submodule",
            "deinit",
            "-f",
            "--",
            "modules/child",
        ],
    );
    let uninitialized = executor.snapshot(&parent).expect("uninitialized snapshot");
    assert!(!uninitialized.submodules[0].initialized);
    let fetched = executor.fetch(&parent).expect("fetch parent repository");
    assert!(!fetched.submodules[0].initialized);
    let pulled = executor.pull(&parent).expect("pull parent repository");
    assert!(!pulled.submodules[0].initialized);
    executor
        .initialize_submodule(&parent, "modules/child")
        .expect("initialize one child");
    assert_eq!(rev_parse(&git, &checked_out_child, "HEAD"), first_oid);
}
