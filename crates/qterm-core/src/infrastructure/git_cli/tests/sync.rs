use super::*;

#[test]
fn real_git_fetch_lists_tracks_and_prunes_remote_branches_without_changing_the_worktree() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("remote fixture");
    let bare = directory.path().join("origin.git");
    let seed = directory.path().join("seed");
    let local = directory.path().join("local");

    run_git_test(&git, ["init", "--bare", path(&bare)]);
    run_git_test(&git, ["init", path(&seed)]);
    run_git_test(
        &git,
        ["-C", path(&seed), "config", "user.name", "Qterm Test"],
    );
    run_git_test(
        &git,
        [
            "-C",
            path(&seed),
            "config",
            "user.email",
            "qterm@example.invalid",
        ],
    );
    fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
    run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
    run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
    run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
    run_git_test(
        &git,
        ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
    );
    run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
    run_git_test(
        &git,
        ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
    );
    run_git_test(
        &git,
        [
            "-c",
            "core.autocrlf=false",
            "clone",
            path(&bare),
            path(&local),
        ],
    );

    run_git_test(&git, ["-C", path(&seed), "switch", "-c", "feature/remote"]);
    fs::write(seed.join("feature.txt"), b"feature\n").expect("feature file");
    run_git_test(&git, ["-C", path(&seed), "add", "feature.txt"]);
    run_git_test(&git, ["-C", path(&seed), "commit", "-m", "feature"]);
    run_git_test(
        &git,
        ["-C", path(&seed), "push", "-u", "origin", "feature/remote"],
    );
    run_git_test(&git, ["-C", path(&seed), "switch", "main"]);

    let stale = executor.snapshot(&local).expect("snapshot before fetch");
    assert!(
        stale
            .branches
            .iter()
            .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
    );
    let fetched = executor.fetch(&local).expect("fetch new remote branch");
    assert!(fetched.branches.iter().any(|branch| {
        branch.ref_name == "refs/remotes/origin/feature/remote"
            && branch.kind == GitBranchKind::Remote
    }));
    assert!(
        fetched
            .branches
            .iter()
            .all(|branch| branch.name != "origin/HEAD")
    );

    run_git_test(&git, ["-C", path(&local), "branch", "feature/remote"]);
    assert!(matches!(
        executor.track_remote_branch(&local, "refs/remotes/origin/feature/remote"),
        Err(GitError::CommandFailed(_))
    ));
    assert_eq!(
        executor
            .snapshot(&local)
            .expect("snapshot after collision")
            .head
            .name
            .as_deref(),
        Some("main")
    );
    run_git_test(&git, ["-C", path(&local), "branch", "-D", "feature/remote"]);

    run_git_test(
        &git,
        [
            "-C",
            path(&local),
            "branch",
            "--track",
            "review",
            "origin/feature/remote",
        ],
    );
    let reused = executor
        .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
        .expect("reuse tracking branch");
    assert_eq!(reused.head.name.as_deref(), Some("review"));
    executor.switch_branch(&local, "main").expect("switch main");
    run_git_test(&git, ["-C", path(&local), "branch", "-D", "review"]);
    let created = executor
        .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
        .expect("create tracking branch");
    assert_eq!(created.head.name.as_deref(), Some("feature/remote"));
    assert_eq!(
        created.head.upstream.as_deref(),
        Some("origin/feature/remote")
    );
    executor.switch_branch(&local, "main").expect("return main");

    run_git_test(
        &git,
        [
            "-C",
            path(&seed),
            "push",
            "origin",
            "--delete",
            "feature/remote",
        ],
    );
    fs::write(seed.join("main.txt"), b"initial\nremote update\n").expect("remote update");
    run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
    run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
    run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);

    let pruned = executor.fetch(&local).expect("fetch and prune");
    assert!(
        pruned
            .branches
            .iter()
            .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
    );
    assert_eq!(pruned.head.behind, 1);
    assert_eq!(
        fs::read_to_string(local.join("main.txt")).expect("worktree"),
        "initial\n"
    );
}

#[test]
fn real_git_p0_lifecycle_publish_push_and_ff_only_pull_are_safe() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("p0 fixture");
    let bare = directory.path().join("origin.git");
    let seed = directory.path().join("seed");
    let local = directory.path().join("local");

    run_git_test(&git, ["init", "--bare", path(&bare)]);
    run_git_test(&git, ["init", path(&seed)]);
    configure_identity(&git, &seed);
    fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
    run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
    run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
    run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
    run_git_test(
        &git,
        ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
    );
    run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
    run_git_test(
        &git,
        ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
    );
    run_git_test(
        &git,
        [
            "-c",
            "core.autocrlf=false",
            "clone",
            path(&bare),
            path(&local),
        ],
    );
    configure_identity(&git, &local);
    run_git_test(
        &git,
        ["-C", path(&local), "config", "push.default", "nothing"],
    );
    run_git_test(&git, ["-C", path(&local), "config", "pull.rebase", "true"]);

    let initial = executor.snapshot(&local).expect("initial snapshot");
    assert_eq!(initial.remotes, ["origin"]);
    let created = executor
        .create_branch_from(&local, "feature/from-remote", "refs/remotes/origin/main")
        .expect("create from remote");
    assert_eq!(created.head.name.as_deref(), Some("feature/from-remote"));
    assert_eq!(created.head.upstream, None);
    executor.switch_branch(&local, "main").expect("switch main");
    let renamed = executor
        .rename_branch(&local, "refs/heads/feature/from-remote", "feature/renamed")
        .expect("rename local branch");
    assert!(
        renamed
            .branches
            .iter()
            .any(|branch| branch.name == "feature/renamed")
    );
    let deleted = executor
        .delete_branch(&local, "refs/heads/feature/renamed")
        .expect("delete merged branch");
    assert!(
        deleted
            .branches
            .iter()
            .all(|branch| branch.name != "feature/renamed")
    );
    assert!(matches!(
        executor.delete_branch(&local, "refs/heads/main"),
        Err(GitError::Conflict(_))
    ));

    executor
        .create_branch(&local, "feature/publish")
        .expect("new branch");
    fs::write(local.join("published.txt"), b"published\n").expect("publish file");
    executor.stage_all(&local).expect("stage publish");
    let published_commit = executor
        .commit(&local, "feat: publish")
        .expect("publish commit");
    let published = executor
        .push(&local, Some("origin"))
        .expect("publish branch");
    assert_eq!(
        published.head.upstream.as_deref(),
        Some("origin/feature/publish")
    );
    assert_eq!(
        rev_parse(&git, &bare, "refs/heads/feature/publish"),
        published_commit.head.oid.expect("published oid")
    );
    let renamed_published = executor
        .rename_branch(
            &local,
            "refs/heads/feature/publish",
            "feature/published-renamed",
        )
        .expect("rename published branch");
    assert_eq!(
        renamed_published.head.name.as_deref(),
        Some("feature/published-renamed")
    );
    assert_eq!(
        renamed_published.head.upstream.as_deref(),
        Some("origin/feature/publish")
    );
    fs::write(local.join("published.txt"), b"published\nsecond\n").expect("second file");
    executor.stage_all(&local).expect("stage second");
    let pushed_commit = executor.commit(&local, "feat: push").expect("push commit");
    executor.push(&local, None).expect("tracked push");
    assert_eq!(
        rev_parse(&git, &bare, "refs/heads/feature/publish"),
        pushed_commit.head.oid.expect("pushed oid")
    );
    assert!(matches!(
        executor.push(&local, Some("missing")),
        Err(GitError::InvalidInput)
    ));

    executor.switch_branch(&local, "main").expect("return main");
    fs::write(seed.join("main.txt"), b"initial\nremote\n").expect("remote update");
    run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
    run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
    run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
    let pulled = executor.pull(&local).expect("ff-only pull");
    assert_eq!(
        pulled.head.oid.as_deref(),
        Some(rev_parse(&git, &bare, "refs/heads/main").as_str())
    );

    fs::write(local.join("local-only.txt"), b"local\n").expect("local divergence");
    executor.stage_all(&local).expect("stage divergence");
    let local_diverged = executor
        .commit(&local, "local divergence")
        .expect("local commit");
    fs::write(seed.join("remote-only.txt"), b"remote\n").expect("remote divergence");
    run_git_test(&git, ["-C", path(&seed), "add", "remote-only.txt"]);
    run_git_test(
        &git,
        ["-C", path(&seed), "commit", "-m", "remote divergence"],
    );
    run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
    assert!(matches!(
        executor.pull(&local),
        Err(GitError::CommandFailed(_) | GitError::Conflict(_))
    ));
    assert_eq!(
        executor
            .snapshot(&local)
            .expect("diverged snapshot")
            .head
            .oid,
        local_diverged.head.oid
    );

    executor
        .create_branch(&local, "feature/unmerged")
        .expect("unmerged branch");
    fs::write(local.join("unmerged.txt"), b"unmerged\n").expect("unmerged file");
    executor.stage_all(&local).expect("stage unmerged");
    executor
        .commit(&local, "unmerged commit")
        .expect("commit unmerged");
    executor
        .switch_branch(&local, "main")
        .expect("leave unmerged");
    assert!(matches!(
        executor.delete_branch(&local, "refs/heads/feature/unmerged"),
        Err(GitError::CommandFailed(_))
    ));
    assert!(
        executor
            .snapshot(&local)
            .expect("safe delete refusal")
            .branches
            .iter()
            .any(|branch| branch.name == "feature/unmerged")
    );
}
