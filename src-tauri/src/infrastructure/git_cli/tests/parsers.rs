use super::*;

#[test]
fn parses_porcelain_v2_headers_and_dual_staged_worktree_changes() {
    let fixture = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0\x31 MM N... 100644 100644 100644 a b file.txt\0? new.txt\0";
    let (head, changes) = parse_status(fixture).expect("status");
    assert_eq!(head.name.as_deref(), Some("main"));
    assert_eq!((head.ahead, head.behind), (2, 1));
    assert_eq!(changes.len(), 3);
    assert!(
        changes
            .iter()
            .any(|change| change.path == "file.txt" && change.staged)
    );
    assert!(
        changes
            .iter()
            .any(|change| change.path == "file.txt" && !change.staged)
    );
}

#[test]
fn parses_submodule_gitlink_configuration_and_dirty_state() {
    let recorded = "1111111111111111111111111111111111111111";
    let current = "2222222222222222222222222222222222222222";
    let fixture = format!("1 .M SCMU 160000 160000 160000 {recorded} {recorded} modules/child\0");
    let (_, changes) = parse_status(fixture.as_bytes()).expect("submodule status record");
    let index = format!("160000 {recorded} 0\tmodules/child\0");
    let config = b"submodule.child.path\nmodules/child\0";
    let status = format!("+{current} modules/child (heads/main)\n");

    let submodules = parse_submodules(
        index.as_bytes(),
        Some(config),
        Some(status.as_bytes()),
        &changes,
    )
    .expect("submodules");

    assert_eq!(submodules.len(), 1);
    let submodule = &submodules[0];
    assert_eq!(submodule.name, "child");
    assert_eq!(submodule.path, "modules/child");
    assert_eq!(submodule.recorded_oid.as_deref(), Some(recorded));
    assert_eq!(submodule.current_oid.as_deref(), Some(current));
    assert!(submodule.initialized);
    assert!(submodule.commit_changed);
    assert!(submodule.tracked_modified);
    assert!(submodule.untracked_content);
    assert_eq!(submodule.issue, None);
    assert!(changes[0].submodule.as_ref().is_some_and(|change| {
        change.commit_changed && change.tracked_modified && change.untracked_content
    }));
}

#[test]
fn classifies_incomplete_submodule_metadata() {
    let recorded = "1111111111111111111111111111111111111111";
    let index = format!("160000 {recorded} 0\tmodules/missing-config\0");
    let status = format!("-{recorded} modules/missing-config\n");
    let missing_config = parse_submodules(index.as_bytes(), None, Some(status.as_bytes()), &[])
        .expect("missing configuration");
    assert_eq!(
        missing_config[0].issue,
        Some(GitSubmoduleIssue::MissingConfiguration)
    );
    assert!(!missing_config[0].initialized);

    let orphan_config = parse_submodules(
        b"",
        Some(b"submodule.orphan.path\nmodules/orphan\0"),
        Some(b""),
        &[],
    )
    .expect("orphan configuration");
    assert_eq!(
        orphan_config[0].issue,
        Some(GitSubmoduleIssue::MissingGitlink)
    );

    let duplicate_name_index = format!(
        "160000 {recorded} 0\tmodules/one\0\
             160000 {recorded} 0\tmodules/two\0"
    );
    let duplicate_name_config =
        b"submodule.child.path\nmodules/one\0submodule.child.path\nmodules/two\0";
    let duplicate_name_status = format!(" {recorded} modules/one\n {recorded} modules/two\n");
    let duplicate_name = parse_submodules(
        duplicate_name_index.as_bytes(),
        Some(duplicate_name_config),
        Some(duplicate_name_status.as_bytes()),
        &[],
    )
    .expect("duplicate name");
    assert!(
        duplicate_name
            .iter()
            .all(|submodule| { submodule.issue == Some(GitSubmoduleIssue::DuplicatePath) })
    );
}

#[test]
fn parses_git_quoted_unicode_submodule_paths() {
    let recorded = "1111111111111111111111111111111111111111";
    let path = "modules/中文 child";
    let index = format!("160000 {recorded} 0\t{path}\0");
    let config = format!("submodule.child.path\n{path}\0");
    let status =
        format!(" {recorded} \"modules/\\344\\270\\255\\346\\226\\207 child\" (heads/main)\n");

    let submodules = parse_submodules(
        index.as_bytes(),
        Some(config.as_bytes()),
        Some(status.as_bytes()),
        &[],
    )
    .expect("quoted path");
    assert_eq!(submodules.len(), 1);
    assert_eq!(submodules[0].path, path);
    assert!(submodules[0].initialized);
    assert_eq!(submodules[0].issue, None);
}

#[test]
fn submodule_operation_failures_do_not_expose_repository_urls() {
    let error = sanitize_submodule_operation_error(GitError::CommandFailed(
        "clone of 'https://user:secret@example.com/private.git' failed".into(),
    ));
    let GitError::CommandFailed(detail) = error else {
        panic!("expected command failure");
    };
    assert!(!detail.contains("http"));
    assert!(!detail.contains("example.com"));
    assert!(!detail.contains("secret"));
}

#[test]
fn parses_renames_conflicts_branches_and_merge_metadata() {
    let fixture = b"# branch.oid abc\0# branch.head feature/test\0\x32 R. N... 100644 100644 100644 a b R100 renamed.txt\0old.txt\0u UU N... 100644 100644 100644 100644 a b c conflict.txt\0u AA N... 000000 100644 100644 100644 0 b c added.txt\0u DU N... 100644 000000 100644 100644 a 0 c current-deleted.txt\0u UD N... 100644 100644 000000 100644 a b 0 incoming-deleted.txt\0u AU N... 000000 100644 100644 100644 0 b c other.txt\0? -leading \xe4\xb8\xad\xe6\x96\x87.txt\0";
    let (_, changes) = parse_status(fixture).expect("status");
    assert!(changes.iter().any(|change| {
        change.path == "renamed.txt"
            && change.original_path.as_deref() == Some("old.txt")
            && change.staged
    }));
    assert!(changes.iter().any(|change| change.path == "conflict.txt"
        && change.conflict
        && change.conflict_kind == Some(GitConflictKind::BothModified)));
    for (path, kind) in [
        ("added.txt", GitConflictKind::BothAdded),
        ("current-deleted.txt", GitConflictKind::CurrentDeleted),
        ("incoming-deleted.txt", GitConflictKind::IncomingDeleted),
        ("other.txt", GitConflictKind::Other),
    ] {
        assert!(changes.iter().any(|change| {
            change.path == path && change.conflict && change.conflict_kind == Some(kind)
        }));
    }
    assert!(
        changes
            .iter()
            .any(|change| change.path == "-leading 中文.txt")
    );

    let branches = parse_branches(
        b"refs/heads/main\0main\0abc\0*\0origin/main\0refs/remotes/origin/main\0\n\
refs/heads/origin/main\0origin/main\0local\0 \0\0\0\n\
refs/remotes/origin/main\0origin/main\0abc\0 \0\0\0\n\
refs/remotes/origin/HEAD\0origin/HEAD\0abc\0 \0\0\0refs/remotes/origin/main\n",
    );
    assert_eq!(branches.len(), 3);
    assert_eq!(branches[0].ref_name, "refs/heads/main");
    assert_eq!(branches[0].kind, GitBranchKind::Local);
    assert!(branches[0].current);
    assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
    assert_eq!(
        branches[0].upstream_ref.as_deref(),
        Some("refs/remotes/origin/main")
    );
    assert_eq!(branches[1].name, branches[2].name);
    assert_ne!(branches[1].ref_name, branches[2].ref_name);
    assert_eq!(branches[2].kind, GitBranchKind::Remote);
    assert_eq!(
        find_tracking_local_branch(&branches, "refs/remotes/origin/main")
            .map(|branch| branch.ref_name.as_str()),
        Some("refs/heads/main")
    );

    let commits = parse_commits(b"merge\x1fleft right\x1fHEAD -> main, tag: v1\x1fmerge subject\x1fQterm\x1f1700000000\x1fFirst paragraph.\n\n- detail one\n- detail two\n\x1e");
    assert_eq!(commits[0].parents, ["left", "right"]);
    assert_eq!(commits[0].decorations, ["HEAD -> main", "tag: v1"]);
    assert_eq!(
        commits[0].body,
        "First paragraph.\n\n- detail one\n- detail two"
    );
}

#[test]
fn parses_nul_delimited_commit_files_and_preserves_rename_sources() {
    let files = parse_commit_files(b"A\0src/new.ts\0M\0README.md\0R100\0old name.txt\0new name.txt\0C075\0base.txt\0copy.txt\0");
    assert_eq!(files.len(), 4);
    assert_eq!(files[0].status, "A");
    assert_eq!(files[0].path, "src/new.ts");
    assert_eq!(files[2].status, "R100");
    assert_eq!(files[2].original_path.as_deref(), Some("old name.txt"));
    assert_eq!(files[2].path, "new name.txt");
    assert_eq!(files[3].original_path.as_deref(), Some("base.txt"));
    assert_eq!(files[3].path, "copy.txt");
}
