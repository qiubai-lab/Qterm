use super::*;

#[test]
fn real_git_merge_supports_success_conflict_continue_abort_and_safe_preconditions() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("merge fixture");
    let repository = directory.path();
    executor.initialize(repository).expect("init");
    configure_identity(&git, repository);
    fs::write(repository.join("shared.txt"), b"base\n").expect("base file");
    executor.stage_all(repository).expect("stage base");
    let initial = executor
        .commit(repository, "initial")
        .expect("initial commit");
    let main = initial.head.name.clone().expect("main branch");

    executor
        .create_branch(repository, "feature/merge")
        .expect("feature branch");
    fs::write(repository.join("feature.txt"), b"feature\n").expect("feature file");
    executor.stage_all(repository).expect("stage feature");
    executor
        .commit(repository, "feature commit")
        .expect("feature commit");
    executor
        .switch_branch(repository, &main)
        .expect("switch main");
    fs::write(repository.join("main.txt"), b"main\n").expect("main file");
    executor.stage_all(repository).expect("stage main");
    executor
        .commit(repository, "main commit")
        .expect("main commit");

    let merged = executor
        .merge_branch(repository, "refs/heads/feature/merge")
        .expect("merge commit");
    assert!(!merged.merge_in_progress);
    assert_eq!(merged.commits[0].parents.len(), 2);
    run_git_test(
        &git,
        [
            "-C",
            path(repository),
            "update-ref",
            "refs/remotes/origin/feature-merge",
            "refs/heads/feature/merge",
        ],
    );
    executor
        .merge_branch(repository, "refs/remotes/origin/feature-merge")
        .expect("merge remote-tracking ref");
    let up_to_date = executor
        .merge_branch(repository, "refs/heads/feature/merge")
        .expect("already up to date");
    assert_eq!(up_to_date.head.oid, merged.head.oid);

    executor
        .create_branch(repository, "feature/conflict")
        .expect("conflict branch");
    fs::write(repository.join("shared.txt"), b"feature conflict\n").expect("feature conflict");
    executor
        .stage_all(repository)
        .expect("stage conflict branch");
    executor
        .commit(repository, "feature conflict")
        .expect("commit conflict branch");
    executor
        .switch_branch(repository, &main)
        .expect("return main");
    fs::write(repository.join("shared.txt"), b"main conflict\n").expect("main conflict");
    executor.stage_all(repository).expect("stage main conflict");
    let before_conflict = executor
        .commit(repository, "main conflict")
        .expect("commit main conflict");

    let conflicted = executor
        .merge_branch(repository, "refs/heads/feature/conflict")
        .expect("conflict snapshot");
    assert!(conflicted.merge_in_progress);
    assert!(conflicted.merge_head_oid.is_some());
    assert!(conflicted.changes.iter().any(|change| change.conflict));
    let detail = executor
        .conflict_detail(repository, "shared.txt")
        .expect("conflict detail");
    assert_eq!(detail.kind, GitConflictKind::BothModified);
    assert_eq!(detail.base.content.as_deref(), Some("base\n"));
    assert_eq!(detail.current.content.as_deref(), Some("main conflict\n"));
    assert_eq!(
        detail.incoming.content.as_deref(),
        Some("feature conflict\n")
    );
    assert!(detail.editable);
    assert!(matches!(
        executor.stage_all(repository),
        Err(GitError::Conflict(_))
    ));
    assert!(
        executor
            .snapshot(repository)
            .expect("reload conflict")
            .merge_in_progress
    );
    assert!(matches!(
        executor.continue_merge(repository),
        Err(GitError::Conflict(_))
    ));
    let aborted = executor.abort_merge(repository).expect("abort merge");
    assert!(!aborted.merge_in_progress);
    assert_eq!(aborted.head.oid, before_conflict.head.oid);

    fs::write(repository.join("dirty.txt"), b"dirty\n").expect("dirty file");
    assert!(matches!(
        executor.merge_branch(repository, "refs/heads/feature/conflict"),
        Err(GitError::Conflict(_))
    ));
    assert_eq!(
        executor
            .snapshot(repository)
            .expect("snapshot after dirty rejection")
            .head
            .oid,
        before_conflict.head.oid
    );
    fs::remove_file(repository.join("dirty.txt")).expect("clean fixture");

    let conflicted = executor
        .merge_branch(repository, "refs/heads/feature/conflict")
        .expect("second conflict snapshot");
    assert!(conflicted.merge_in_progress);
    let detail = executor
        .conflict_detail(repository, "shared.txt")
        .expect("second conflict detail");
    fs::write(repository.join("shared.txt"), b"external edit\n").expect("external edit");
    assert!(matches!(
        executor.resolve_conflict(
            repository,
            "shared.txt",
            &GitConflictResolution::SaveText {
                content: "stale resolution\n".into(),
                expected_revision: detail.result.revision,
            },
        ),
        Err(GitError::Conflict(_))
    ));
    assert_eq!(
        fs::read_to_string(repository.join("shared.txt")).expect("external result"),
        "external edit\n"
    );
    let detail = executor
        .conflict_detail(repository, "shared.txt")
        .expect("reloaded conflict detail");
    let resolved = executor
        .resolve_conflict(
            repository,
            "shared.txt",
            &GitConflictResolution::SaveText {
                content: "resolved\n".into(),
                expected_revision: detail.result.revision,
            },
        )
        .expect("save and stage resolution");
    assert!(!resolved.changes.iter().any(|change| change.conflict));
    assert_eq!(
        fs::read_to_string(repository.join("shared.txt")).expect("resolved file"),
        "resolved\n"
    );
    let continued = executor.continue_merge(repository).expect("continue merge");
    assert!(!continued.merge_in_progress);
    assert_eq!(continued.commits[0].parents.len(), 2);

    executor
        .create_branch(repository, "feature/fast-forward")
        .expect("fast-forward branch");
    fs::write(repository.join("fast.txt"), b"fast\n").expect("fast file");
    executor.stage_all(repository).expect("stage fast");
    let fast_commit = executor
        .commit(repository, "fast commit")
        .expect("commit fast");
    executor
        .switch_branch(repository, &main)
        .expect("return for fast-forward");
    let fast_forwarded = executor
        .merge_branch(repository, "refs/heads/feature/fast-forward")
        .expect("fast-forward");
    assert_eq!(fast_forwarded.head.oid, fast_commit.head.oid);
    assert_eq!(fast_forwarded.commits[0].parents.len(), 1);
}

#[test]
fn real_git_conflicts_support_add_delete_and_binary_file_level_resolutions() {
    let git = which_git();
    let executor = SystemGitExecutor::with_executable(git.clone());
    let directory = tempdir().expect("conflict fixture");
    let repository = directory.path();
    executor.initialize(repository).expect("init");
    configure_identity(&git, repository);
    fs::write(repository.join("current-deleted.txt"), b"base current\n").expect("base");
    fs::write(repository.join("incoming-deleted.txt"), b"base incoming\n").expect("base");
    fs::write(repository.join("binary.bin"), b"base\0binary").expect("base binary");
    fs::write(repository.join("oversize.txt"), b"base oversize\n").expect("base oversize");
    executor.stage_all(repository).expect("stage base");
    let initial = executor.commit(repository, "initial").expect("initial");
    let main = initial.head.name.expect("main branch");

    executor
        .create_branch(repository, "feature/conflict-kinds")
        .expect("feature branch");
    fs::write(repository.join("both-added.txt"), b"incoming added\n").expect("incoming add");
    fs::write(
        repository.join("current-deleted.txt"),
        b"incoming modified\n",
    )
    .expect("incoming modify");
    fs::remove_file(repository.join("incoming-deleted.txt")).expect("incoming delete");
    fs::write(repository.join("binary.bin"), b"incoming\0binary").expect("incoming binary");
    fs::write(
        repository.join("oversize.txt"),
        vec![b'i'; MAX_CONFLICT_TEXT_BYTES + 1],
    )
    .expect("incoming oversize");
    executor.stage_all(repository).expect("stage incoming");
    executor
        .commit(repository, "incoming changes")
        .expect("incoming commit");

    executor
        .switch_branch(repository, &main)
        .expect("switch main");
    fs::write(repository.join("both-added.txt"), b"current added\n").expect("current add");
    fs::remove_file(repository.join("current-deleted.txt")).expect("current delete");
    fs::write(
        repository.join("incoming-deleted.txt"),
        b"current modified\n",
    )
    .expect("current modify");
    fs::write(repository.join("binary.bin"), b"current\0binary").expect("current binary");
    fs::write(
        repository.join("oversize.txt"),
        vec![b'c'; MAX_CONFLICT_TEXT_BYTES + 1],
    )
    .expect("current oversize");
    executor.stage_all(repository).expect("stage current");
    executor
        .commit(repository, "current changes")
        .expect("current commit");

    let conflicted = executor
        .merge_branch(repository, "refs/heads/feature/conflict-kinds")
        .expect("merge conflicts");
    for (path, kind) in [
        ("both-added.txt", GitConflictKind::BothAdded),
        ("current-deleted.txt", GitConflictKind::CurrentDeleted),
        ("incoming-deleted.txt", GitConflictKind::IncomingDeleted),
        ("binary.bin", GitConflictKind::BothModified),
        ("oversize.txt", GitConflictKind::BothModified),
    ] {
        assert!(
            conflicted
                .changes
                .iter()
                .any(|change| { change.path == path && change.conflict_kind == Some(kind) })
        );
    }

    let add_detail = executor
        .conflict_detail(repository, "both-added.txt")
        .expect("AA detail");
    assert_eq!(add_detail.base.kind, GitConflictContentKind::Missing);
    assert!(matches!(
        executor.conflict_detail(repository, "not-conflicted.txt"),
        Err(GitError::Conflict(_))
    ));
    executor
        .resolve_conflict(
            repository,
            "both-added.txt",
            &GitConflictResolution::UseIncoming,
        )
        .expect("choose incoming add");
    assert_eq!(
        fs::read(repository.join("both-added.txt")).expect("chosen add"),
        b"incoming added\n"
    );

    let delete_detail = executor
        .conflict_detail(repository, "current-deleted.txt")
        .expect("DU detail");
    assert_eq!(delete_detail.current.kind, GitConflictContentKind::Missing);
    assert!(matches!(
        executor.resolve_conflict(
            repository,
            "current-deleted.txt",
            &GitConflictResolution::UseCurrent,
        ),
        Err(GitError::Conflict(_))
    ));
    executor
        .resolve_conflict(
            repository,
            "current-deleted.txt",
            &GitConflictResolution::UseIncoming,
        )
        .expect("keep incoming side");
    assert_eq!(
        fs::read(repository.join("current-deleted.txt")).expect("incoming side"),
        b"incoming modified\n"
    );

    executor
        .resolve_conflict(
            repository,
            "incoming-deleted.txt",
            &GitConflictResolution::Delete,
        )
        .expect("accept incoming deletion");
    assert!(!repository.join("incoming-deleted.txt").exists());

    let binary_detail = executor
        .conflict_detail(repository, "binary.bin")
        .expect("binary detail");
    assert!(!binary_detail.editable);
    assert_eq!(binary_detail.current.kind, GitConflictContentKind::Binary);
    assert_eq!(binary_detail.incoming.kind, GitConflictContentKind::Binary);
    executor
        .resolve_conflict(repository, "binary.bin", &GitConflictResolution::UseCurrent)
        .expect("choose current binary");
    assert_eq!(
        fs::read(repository.join("binary.bin")).expect("current binary"),
        b"current\0binary"
    );

    let oversize_detail = executor
        .conflict_detail(repository, "oversize.txt")
        .expect("oversize detail");
    assert!(!oversize_detail.editable);
    assert_eq!(
        oversize_detail.current.kind,
        GitConflictContentKind::Unsupported
    );
    assert_eq!(
        oversize_detail.incoming.kind,
        GitConflictContentKind::Unsupported
    );
    assert!(matches!(
        executor.resolve_conflict(
            repository,
            "oversize.txt",
            &GitConflictResolution::UseIncoming,
        ),
        Err(GitError::Conflict(_))
    ));
    let resolved = executor
        .resolve_conflict(
            repository,
            "oversize.txt",
            &GitConflictResolution::MarkResolved,
        )
        .expect("stage external oversize result");
    assert!(!resolved.changes.iter().any(|change| change.conflict));
    executor.continue_merge(repository).expect("continue merge");
}
