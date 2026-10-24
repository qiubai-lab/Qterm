use super::*;
use crate::{
    application::web_library_service::WebLibraryService,
    domain::web_library::WebLibraryAction as Action,
};
const A: &str = "00000000-0000-0000-0000-000000000001";
const B: &str = "00000000-0000-0000-0000-000000000002";

#[test]
fn web_library_round_trip_deduplicates_scopes_and_keeps_bookmarks_when_history_cleared() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("library.json");
    let service = WebLibraryService::new(JsonWebLibrary::new(path.clone()));
    let url = "http://localhost:3000/".to_owned();
    for profile in [A, B, A] {
        service
            .execute(
                profile,
                Some(Action::Visit {
                    title: String::new(),
                    url: url.clone(),
                }),
                10,
            )
            .unwrap();
    }
    service
        .execute(
            A,
            Some(Action::Bookmark {
                url: url.clone(),
                title: "Dashboard".into(),
            }),
            11,
        )
        .unwrap();
    service
        .execute(
            A,
            Some(Action::Bookmark {
                url: url.clone(),
                title: "Renamed".into(),
            }),
            12,
        )
        .unwrap();
    let restarted = WebLibraryService::new(JsonWebLibrary::new(path));
    let a = restarted.execute(A, None, 0).unwrap();
    assert_eq!(a.history.len(), 1);
    assert_eq!(a.bookmarks.len(), 1);
    assert_eq!(a.bookmarks[0].title, "Renamed");
    assert!(restarted.execute(B, None, 0).unwrap().bookmarks.is_empty());
    let cleared = restarted.execute(A, Some(Action::ClearHistory), 0).unwrap();
    assert!(cleared.history.is_empty());
    assert_eq!(cleared.bookmarks.len(), 1);
    assert_eq!(restarted.execute(B, None, 0).unwrap().history.len(), 1);
    assert!(
        restarted
            .execute(A, Some(Action::Unbookmark { url }), 0)
            .unwrap()
            .bookmarks
            .is_empty()
    );
}

#[test]
fn web_library_bounds_history_without_dropping_saved_bookmarks_and_rejects_bad_input() {
    let mut library = WebLibrary::default();
    for i in 0..205 {
        library
            .apply(
                A,
                Action::Visit {
                    title: String::new(),
                    url: format!("https://host/{i}"),
                },
                i,
            )
            .unwrap();
    }
    assert_eq!(library.history.len(), 200);
    assert_eq!(library.history[0].url, "https://host/204");
    assert_eq!(library.history.last().unwrap().url, "https://host/5");
    let before = library.clone();
    assert!(
        library
            .apply(
                A,
                Action::Visit {
                    title: String::new(),
                    url: "https://user:secret@host/".into()
                },
                0
            )
            .is_err()
    );
    assert!(
        library
            .apply(
                A,
                Action::Bookmark {
                    url: "https://host/".into(),
                    title: "\n".into()
                },
                0
            )
            .is_err()
    );
    assert_eq!(library, before);
    for i in 0..2000 {
        library
            .apply(
                A,
                Action::Bookmark {
                    url: format!("https://host/{i}"),
                    title: "Saved".into(),
                },
                i,
            )
            .unwrap();
    }
    assert!(
        library
            .apply(
                A,
                Action::Bookmark {
                    url: "https://host/new".into(),
                    title: "Extra".into()
                },
                1
            )
            .is_err()
    );
    library
        .apply(
            A,
            Action::Bookmark {
                url: "https://host/0".into(),
                title: "Existing".into(),
            },
            2,
        )
        .unwrap();
    assert_eq!(library.bookmarks.len(), 2000);
}

#[test]
fn web_library_preserves_corrupt_future_and_unwritable_storage() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("library.json");
    for contents in [
        "broken",
        r#"{"schemaVersion":99,"library":{"history":[],"bookmarks":[]}}"#,
    ] {
        std::fs::write(&path, contents).unwrap();
        let service = WebLibraryService::new(JsonWebLibrary::new(path.clone()));
        assert!(service.execute(A, None, 0).is_err());
        assert!(service.execute(A, Some(Action::ClearHistory), 0).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
    }
    let service = WebLibraryService::new(JsonWebLibrary::new(
        directory.path().join("absent/library.json"),
    ));
    assert!(
        service
            .execute(
                A,
                Some(Action::Visit {
                    title: String::new(),
                    url: "https://host/".into()
                }),
                1
            )
            .is_err()
    );
    assert!(service.execute(A, None, 0).unwrap().history.is_empty());
}

#[test]
fn web_library_concurrent_blocks_do_not_overwrite_other_updates() {
    let directory = tempfile::tempdir().unwrap();
    let service = std::sync::Arc::new(WebLibraryService::new(JsonWebLibrary::new(
        directory.path().join("library.json"),
    )));
    let threads: Vec<_> = (0..20)
        .map(|i| {
            let service = service.clone();
            std::thread::spawn(move || {
                service
                    .execute(
                        A,
                        Some(Action::Visit {
                            title: String::new(),
                            url: format!("https://host/{i}"),
                        }),
                        i,
                    )
                    .unwrap()
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    let data = service.execute(A, None, 0).unwrap();
    assert_eq!(data.history.len(), 20);
    assert!(data.valid());
}
