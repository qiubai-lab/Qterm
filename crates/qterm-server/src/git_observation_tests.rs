use super::*;
use serde_json::json;
use std::{path::Path, process::Command, time::Duration};

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
fn cache_deduplicates_and_prevents_a_slow_read_overwriting_a_mutation() {
    let feed = Feed::new();
    feed.publish(json!({"head": "before"}), Some(0));
    feed.publish(json!({"head": "before"}), Some(1));
    assert_eq!(*feed.changes.borrow(), 1);
    feed.publish(json!({"head": "after"}), None);
    feed.publish(json!({"head": "stale"}), Some(1));
    assert_eq!(feed.snapshot(1).unwrap()["head"], "after");
    feed.fail(ApiError::invalid(), 1);
    assert!(feed.snapshot(2).is_ok());
    feed.fail(ApiError::invalid(), 2);
    assert_eq!(feed.snapshot(3).unwrap_err().code, "invalidRequest");
    feed.publish(json!({"head": "recovered"}), Some(3));
    assert_eq!(feed.snapshot(4).unwrap()["head"], "recovered");
    assert!(feed.snapshot(5).is_err());
}
#[tokio::test]
async fn shares_worker_observes_atomic_writes_and_releases_last_subscription() {
    let (dir, state, owner) = crate::tests::fixture();
    git(dir.path(), &["init", "-q"]);
    let target = Target::Local {
        path: dir.path().to_string_lossy().into_owned(),
    }
    .normalize()
    .unwrap();
    let first = state
        .git_observations
        .subscribe(&state, &owner, target.clone())
        .unwrap();
    let second = state
        .git_observations
        .subscribe(&state, &owner, target.clone())
        .unwrap();
    assert!(Arc::ptr_eq(&first, &second));
    let mut changes = first.changes.subscribe();
    tokio::time::timeout(Duration::from_secs(5), changes.wait_for(|v| *v > 0))
        .await
        .unwrap()
        .unwrap();
    let revision = *changes.borrow_and_update();
    // Git resolves symlinks and uses platform-specific path separators. Compare
    // filesystem identities (not raw strings), including macOS's /var alias.
    let snapshot = first.snapshot(revision).unwrap();
    assert_eq!(
        Path::new(snapshot["repositoryPath"].as_str().unwrap())
            .canonicalize()
            .unwrap(),
        dir.path().canonicalize().unwrap()
    );
    std::fs::write(dir.path().join("pending"), "hello").unwrap();
    std::fs::rename(dir.path().join("pending"), dir.path().join("new.txt")).unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            changes.changed().await.unwrap();
            let value = first.snapshot(*changes.borrow_and_update()).unwrap();
            if value["changes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["path"] == "new.txt")
            {
                break;
            }
        }
    })
    .await
    .unwrap();
    assert!(
        state
            .git_observations
            .snapshot("another-owner", target.clone(), 1)
            .is_err()
    );
    let weak = Arc::downgrade(&first);
    drop(first);
    assert!(weak.upgrade().is_some());
    drop(second);
    assert!(weak.upgrade().is_none());
    assert!(state.git_observations.snapshot(&owner, target, 1).is_err());
}
#[test]
fn linked_worktrees_include_external_gitdir_and_common_refs() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo");
    std::fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        ],
    );
    let linked = dir.path().join("linked");
    git(
        &root,
        &["worktree", "add", "-qb", "linked", linked.to_str().unwrap()],
    );
    let paths = crate::git_local_watch::metadata_paths(&linked);
    assert!(paths.contains(&root.join(".git/worktrees/linked").canonicalize().unwrap()));
    assert!(paths.contains(&root.join(".git").canonicalize().unwrap()));
}
