use super::{Event, Kind, Source, model::now, storage::Storage};
use std::fs;

#[test]
fn expired_segments_and_capacity_overflow_are_pruned_before_loading() {
    let dir = tempfile::tempdir().unwrap();
    let expired = dir.path().join(format!(
        "access-{:020}-expired.jsonl",
        now() - super::storage::RETENTION - 1
    ));
    let large = dir
        .path()
        .join(format!("access-{:020}-oversize.jsonl", now() - 1000));
    fs::write(&expired, b"expired").unwrap();
    fs::File::create(&large)
        .unwrap()
        .set_len(51 * 1024 * 1024)
        .unwrap();
    fs::write(dir.path().join("unrelated.jsonl"), b"keep").unwrap();
    let mut store = Storage::new(dir.path().to_path_buf());
    let (events, damaged) = store.load().unwrap();
    assert!(events.is_empty());
    assert_eq!(damaged, 0);
    assert!(!expired.exists() && !large.exists());
    assert!(dir.path().join("unrelated.jsonl").exists());
}

#[test]
fn segments_rotate_at_size_and_day_boundaries_with_private_permissions() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Storage::new(dir.path().to_path_buf());
    store.load().unwrap();
    // Oversized synthetic metadata exercises rotation without thousands of disk flushes.
    let mut event = Event::new(
        Kind::Login,
        true,
        "admitted",
        Source {
            browser: Some("a".repeat(3 * 1024 * 1024)),
            ..Default::default()
        },
    );
    event.timestamp -= 86_400_000;
    store.append(&event).unwrap();
    event.id = "second-record".into();
    store.append(&event).unwrap();
    event.id = "third-record".into();
    event.timestamp = now();
    event.source.browser = None;
    store.append(&event).unwrap();
    drop(store);
    let files: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(files.len(), 3);
    assert!(
        files
            .iter()
            .all(|file| file.metadata().unwrap().len() <= 5 * 1024 * 1024)
    );
    let (events, damaged) = Storage::new(dir.path().to_path_buf()).load().unwrap();
    assert_eq!(events.len(), 3);
    assert_eq!(events[1].id, "second-record");
    assert_eq!(events[2].id, "third-record");
    assert_eq!(damaged, 0);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(dir.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert!(
            files
                .iter()
                .all(|file| file.metadata().unwrap().permissions().mode() & 0o777 == 0o600)
        );
    }
}
