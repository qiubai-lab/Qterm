use super::*;

#[test]
fn bounds_process_output_and_classifies_recoverable_failures() {
    assert_eq!(
        read_bounded(Cursor::new(vec![b'x'; OUTPUT_LIMIT + 1])),
        Err(GitError::OutputTooLarge)
    );
    assert!(matches!(
        classify_failure(b"fatal: detected dubious ownership; add safe.directory"),
        GitError::Conflict(_)
    ));
    assert_eq!(
        classify_failure(b"fatal: not a git repository"),
        GitError::NotRepository
    );
    let GitError::CommandFailed(detail) = classify_failure(
        b"fatal: unable to access 'https://alice:p%40ss@example.com/repo.git/': denied",
    ) else {
        panic!("expected command failure");
    };
    assert!(!detail.contains("alice"));
    assert!(!detail.contains("p%40ss"));
    assert!(detail.contains("https://***@example.com/repo.git/"));
}

#[test]
fn timed_out_process_is_terminated() {
    let result = if cfg!(windows) {
        run_process(
            std::path::Path::new("cmd.exe"),
            ["/C", "ping -n 10 127.0.0.1 > nul"],
            std::time::Duration::from_millis(50),
        )
    } else {
        run_process(
            std::path::Path::new("sh"),
            ["-c", "sleep 5"],
            std::time::Duration::from_millis(50),
        )
    };
    assert!(matches!(result, Err(GitError::Timeout)));
}
