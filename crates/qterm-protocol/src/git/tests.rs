use super::{
    GitBranchInput, GitChangeDiffInput, GitCommitFileDiffInput, GitCommitFilesInput,
    GitCommitInput, GitConflictDetailInput, GitCreateBranchFromCommitInput, GitDirectoryListingDto,
    GitIpcError, GitMergeBranchInput, GitPathInput, GitPathsInput, GitRemoteBranchInput,
    GitResolveConflictInput, GitSubmoduleDto, GitSubmoduleInput, RemoteGitChangeDiffInput,
    RemoteGitCommitFileDiffInput, RemoteGitCommitFilesInput, RemoteGitConflictDetailInput,
    RemoteGitDirectoryInput, RemoteGitInput, RemoteGitResolveConflictInput,
};
use qterm_core::domain::{
    files::{DirectoryListing, FileEntry},
    git::{GitError, GitSubmodule},
};

#[test]
fn git_directory_dto_preserves_read_only_file_metadata() {
    let dto = GitDirectoryListingDto::from(DirectoryListing::new(
        "/srv".into(),
        vec![FileEntry {
            name: "project".into(),
            path: "/srv/project".into(),
            is_directory: true,
            is_symlink: false,
            size: 0,
            modified_at: Some(1_725_187_200),
            permission_mode: Some(0o754),
        }],
    ));
    let value = serde_json::to_value(dto).expect("serialize directory DTO");
    assert_eq!(value["entries"][0]["modifiedAt"], 1_725_187_200u64);
    assert_eq!(value["entries"][0]["permissionMode"], 0o754u32);
}

#[test]
fn submodule_dto_exposes_state_without_url_or_mutation_parameters() {
    let value = serde_json::to_value(GitSubmoduleDto::from(GitSubmodule {
        name: "child".into(),
        path: "modules/child".into(),
        recorded_oid: Some("1".repeat(40)),
        current_oid: Some("2".repeat(40)),
        initialized: true,
        commit_changed: true,
        tracked_modified: false,
        untracked_content: false,
        conflict: false,
        issue: None,
    }))
    .expect("serialize submodule DTO");

    assert_eq!(value["path"], "modules/child");
    assert_eq!(value["recordedOid"], "1".repeat(40));
    let object = value.as_object().expect("submodule object");
    for forbidden in ["url", "command", "args", "recursive", "remote", "force"] {
        assert!(!object.contains_key(forbidden), "{forbidden}");
    }
}

#[test]
fn git_inputs_reject_arbitrary_process_fields() {
    assert!(
        serde_json::from_value::<GitPathInput>(serde_json::json!({
            "path": "D:/work/project",
            "executable": "powershell.exe"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "snapshot",
                "path": "/srv/project",
                "executable": "sh"
            }
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "terminal-session",
            "profileId": "profile-1",
            "action": { "type": "snapshot", "path": "/srv/project" },
            "cwd": "/tmp"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitPathsInput>(serde_json::json!({
            "repository": "D:/work/project",
            "paths": ["file.txt"],
            "args": ["reset", "--hard"]
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitSubmoduleInput>(serde_json::json!({
            "repository": "D:/work/project",
            "path": "modules/child",
            "recursive": true
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "initializeSubmodule",
                "repository": "/srv/project",
                "path": "modules/child",
                "url": "https://example.invalid/private.git"
            }
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "checkoutSubmodule",
                "repository": "/srv/project",
                "path": "modules/child",
                "force": true
            }
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitCommitInput>(serde_json::json!({
            "repository": "D:/work/project",
            "message": "feat: safe",
            "cwd": "D:/other"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitChangeDiffInput>(serde_json::json!({
            "repository": "D:/work/project",
            "path": "src/main.ts",
            "staged": false,
            "revision": "HEAD"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitChangeDiffInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "path": "src/main.ts",
            "staged": true,
            "command": "show"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitCommitFileDiffInput>(serde_json::json!({
            "repository": "D:/work/project",
            "oid": "0123456789abcdef0123456789abcdef01234567",
            "path": "src/main.ts",
            "parent": "HEAD^"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitCommitFileDiffInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "oid": "0123456789abcdef0123456789abcdef01234567",
            "path": "src/main.ts",
            "command": "show"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitBranchInput>(serde_json::json!({
            "repository": "D:/work/project",
            "name": "feature/test",
            "subcommand": "delete"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitCreateBranchFromCommitInput>(serde_json::json!({
            "repository": "D:/work/project",
            "name": "feature/history",
            "oid": "0123456789abcdef0123456789abcdef01234567",
            "revision": "HEAD"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitRemoteBranchInput>(serde_json::json!({
            "repository": "D:/work/project",
            "refName": "refs/remotes/origin/main",
            "args": ["reset", "--hard"]
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitMergeBranchInput>(serde_json::json!({
            "repository": "D:/work/project",
            "sourceRef": "refs/heads/feature/test",
            "strategy": "ours"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "fetch",
                "repository": "/srv/project",
                "remote": "attacker"
            }
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitCommitFilesInput>(serde_json::json!({
            "repository": "D:/work/project",
            "oid": "0123456789abcdef0123456789abcdef01234567",
            "args": ["reset", "--hard"]
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitCommitFilesInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "oid": "0123456789abcdef0123456789abcdef01234567",
            "command": "cat /etc/passwd"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitDirectoryInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "path": "/srv/project",
            "readFile": "/etc/passwd"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitConflictDetailInput>(serde_json::json!({
            "repository": "D:/work/project",
            "path": "conflict.txt",
            "stage": 2
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<RemoteGitConflictDetailInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "path": "conflict.txt",
            "revision": "HEAD"
        }))
        .is_err()
    );
    for payload in [
        serde_json::json!({
            "repository": "D:/work/project",
            "path": "conflict.txt",
            "resolution": { "type": "useCurrent", "args": ["--force"] }
        }),
        serde_json::json!({
            "repository": "D:/work/project",
            "path": "conflict.txt",
            "resolution": { "type": "checkout", "revision": "HEAD" }
        }),
    ] {
        assert!(serde_json::from_value::<GitResolveConflictInput>(payload).is_err());
    }
    assert!(
        serde_json::from_value::<RemoteGitResolveConflictInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "repository": "/srv/project",
            "path": "conflict.txt",
            "resolution": {
                "type": "saveText",
                "content": "resolved",
                "expectedRevision": "revision",
                "command": "git add -A"
            }
        }))
        .is_err()
    );
}

#[test]
fn conflict_resolution_inputs_deserialize_the_closed_contract() {
    let local = serde_json::from_value::<GitResolveConflictInput>(serde_json::json!({
        "repository": "D:/work/project",
        "path": "conflict.txt",
        "resolution": {
            "type": "saveText",
            "content": "resolved\n",
            "expectedRevision": "sha256:fixture"
        }
    }))
    .expect("local conflict resolution");
    assert_eq!(local.path, "conflict.txt");
    assert_eq!(
        qterm_core::domain::git::GitConflictResolution::from(local.resolution),
        qterm_core::domain::git::GitConflictResolution::SaveText {
            content: "resolved\n".into(),
            expected_revision: "sha256:fixture".into(),
        }
    );

    let remote = serde_json::from_value::<RemoteGitResolveConflictInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "repository": "/srv/project",
        "path": "binary.bin",
        "resolution": { "type": "useIncoming" }
    }))
    .expect("remote conflict resolution");
    assert_eq!(remote.path, "binary.bin");
    assert_eq!(
        qterm_core::domain::git::GitConflictResolution::from(remote.resolution),
        qterm_core::domain::git::GitConflictResolution::UseIncoming
    );
}

#[test]
fn remote_fetch_and_tracking_actions_deserialize_only_the_closed_contract() {
    let fetch = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": { "type": "fetch", "repository": "/srv/project" }
    }))
    .expect("fetch input");
    assert_eq!(
        qterm_core::domain::git::RemoteGitAction::from(fetch.action),
        qterm_core::domain::git::RemoteGitAction::Fetch {
            repository: "/srv/project".into()
        }
    );

    let merge = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": {
            "type": "mergeBranch",
            "repository": "/srv/project",
            "sourceRef": "refs/remotes/origin/feature/test"
        }
    }))
    .expect("merge input");
    assert_eq!(
        qterm_core::domain::git::RemoteGitAction::from(merge.action),
        qterm_core::domain::git::RemoteGitAction::MergeBranch {
            repository: "/srv/project".into(),
            source_ref: "refs/remotes/origin/feature/test".into(),
        }
    );

    for (kind, expected) in [
        (
            "continueMerge",
            qterm_core::domain::git::RemoteGitAction::ContinueMerge {
                repository: "/srv/project".into(),
            },
        ),
        (
            "abortMerge",
            qterm_core::domain::git::RemoteGitAction::AbortMerge {
                repository: "/srv/project".into(),
            },
        ),
    ] {
        let input = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": { "type": kind, "repository": "/srv/project" }
        }))
        .expect("merge lifecycle input");
        assert_eq!(
            qterm_core::domain::git::RemoteGitAction::from(input.action),
            expected
        );
    }

    let track = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": {
            "type": "trackRemoteBranch",
            "repository": "/srv/project",
            "refName": "refs/remotes/origin/feature/test"
        }
    }))
    .expect("track input");
    assert_eq!(
        qterm_core::domain::git::RemoteGitAction::from(track.action),
        qterm_core::domain::git::RemoteGitAction::TrackRemoteBranch {
            repository: "/srv/project".into(),
            ref_name: "refs/remotes/origin/feature/test".into()
        }
    );

    let create_from_commit = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": {
            "type": "createBranchFromCommit",
            "repository": "/srv/project",
            "name": "feature/history",
            "oid": "0123456789abcdef0123456789abcdef01234567"
        }
    }))
    .expect("create branch from commit input");
    assert_eq!(
        qterm_core::domain::git::RemoteGitAction::from(create_from_commit.action),
        qterm_core::domain::git::RemoteGitAction::CreateBranchFromCommit {
            repository: "/srv/project".into(),
            name: "feature/history".into(),
            oid: "0123456789abcdef0123456789abcdef01234567".into(),
        }
    );
}

#[test]
fn p0_remote_actions_reject_command_url_and_force_fields() {
    let publish = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": {
            "type": "push",
            "repository": "/srv/project",
            "remote": "origin"
        }
    }))
    .expect("closed publish action");
    assert_eq!(
        qterm_core::domain::git::RemoteGitAction::from(publish.action),
        qterm_core::domain::git::RemoteGitAction::Push {
            repository: "/srv/project".into(),
            remote: Some("origin".into()),
        }
    );

    for payload in [
        serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "push",
                "repository": "/srv/project",
                "remote": "origin",
                "force": true
            }
        }),
        serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "pull",
                "repository": "/srv/project",
                "args": ["--rebase"]
            }
        }),
        serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "deleteBranch",
                "repository": "/srv/project",
                "refName": "refs/heads/main",
                "command": "branch -D main"
            }
        }),
        serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "mergeBranch",
                "repository": "/srv/project",
                "sourceRef": "refs/heads/feature/test",
                "strategy": "ours"
            }
        }),
        serde_json::json!({
            "sessionId": "git-session",
            "profileId": "profile-1",
            "action": {
                "type": "abortMerge",
                "repository": "/srv/project",
                "args": ["reset", "--hard"]
            }
        }),
    ] {
        assert!(serde_json::from_value::<RemoteGitInput>(payload).is_err());
    }
    let invalid_remote = serde_json::from_value::<RemoteGitInput>(serde_json::json!({
        "sessionId": "git-session",
        "profileId": "profile-1",
        "action": {
            "type": "push",
            "repository": "/srv/project",
            "remote": "https://user:secret@example.com/repo"
        }
    }))
    .expect("shape remains closed");
    assert!(
        qterm_core::domain::git::RemoteGitAction::from(invalid_remote.action)
            .validate()
            .is_err()
    );
}

#[test]
fn git_failures_have_stable_ipc_codes() {
    let cases = [
        (GitError::Missing, "gitMissing"),
        (GitError::NotRepository, "notGitRepository"),
        (GitError::Conflict(String::new()), "gitConflict"),
        (GitError::Timeout, "gitTimeout"),
        (GitError::OutputTooLarge, "gitOutputTooLarge"),
        (GitError::CommandFailed(String::new()), "gitCommandFailed"),
    ];
    for (error, expected) in cases {
        assert_eq!(GitIpcError::from(error).code, expected);
    }
}
