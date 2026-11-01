use super::*;
const PROFILE: &str = "00000000-0000-0000-0000-000000000001";
const URL: &str = "https://host/app";
#[test]
fn visits_and_late_titles_update_history_and_bookmarks_without_reordering_metadata() {
    let mut library = WebLibrary::default();
    library
        .apply(
            PROFILE,
            WebLibraryAction::Bookmark {
                url: URL.into(),
                title: "host".into(),
            },
            1,
        )
        .unwrap();
    library
        .apply(
            PROFILE,
            WebLibraryAction::Visit {
                url: URL.into(),
                title: "  登录\n控制台  ".into(),
            },
            2,
        )
        .unwrap();
    assert_eq!(library.history[0].title, "登录 控制台");
    assert_eq!(library.bookmarks[0].title, "登录 控制台");
    library
        .apply(
            PROFILE,
            WebLibraryAction::Title {
                url: URL.into(),
                title: "控制台 | 首页".into(),
            },
            9,
        )
        .unwrap();
    assert_eq!(library.history[0].title, "控制台 | 首页");
    assert_eq!(library.history[0].updated_at, 2);
    assert_eq!(library.bookmarks[0].updated_at, 1);
    library
        .apply(
            "00000000-0000-0000-0000-000000000002",
            WebLibraryAction::Title {
                url: URL.into(),
                title: "other".into(),
            },
            10,
        )
        .unwrap();
    assert_eq!(library.history[0].title, "控制台 | 首页");
    library
        .apply(
            PROFILE,
            WebLibraryAction::Visit {
                url: URL.into(),
                title: String::new(),
            },
            11,
        )
        .unwrap();
    assert_eq!(library.history[0].title, "控制台 | 首页");
    assert!(library.valid());
}
#[test]
fn metadata_never_creates_a_visit_and_titles_are_bounded_utf8_text() {
    let mut library = WebLibrary::default();
    library
        .apply(
            PROFILE,
            WebLibraryAction::Title {
                url: URL.into(),
                title: "Not visited".into(),
            },
            1,
        )
        .unwrap();
    assert!(library.history.is_empty());
    let title = page_title(&format!("\0{}\n", "中".repeat(400)));
    assert!(title.len() <= 512 && !title.is_empty() && !title.chars().any(char::is_control));
    let old: WebLibraryAction =
        serde_json::from_str(r#"{"kind":"visit","url":"https://host/app"}"#).unwrap();
    library.apply(PROFILE, old, 1).unwrap();
    assert_eq!(library.history[0].title, URL);
}

#[test]
fn local_library_is_isolated_from_remote_and_valid_for_persistence() {
    let remote = uuid::Uuid::new_v4().to_string();
    let mut library = super::WebLibrary::default();
    for scope in [super::LOCAL_SCOPE, remote.as_str()] {
        library
            .apply(
                scope,
                super::WebLibraryAction::Visit {
                    url: "http://localhost:3000/".into(),
                    title: scope.into(),
                },
                1,
            )
            .unwrap();
        library
            .apply(
                scope,
                super::WebLibraryAction::Bookmark {
                    url: "http://localhost:3000/".into(),
                    title: scope.into(),
                },
                1,
            )
            .unwrap();
    }
    assert!(library.valid());
    assert_eq!(library.for_profile(super::LOCAL_SCOPE).history.len(), 1);
    assert_eq!(library.for_profile(&remote).bookmarks.len(), 1);
    library
        .apply(super::LOCAL_SCOPE, super::WebLibraryAction::ClearHistory, 2)
        .unwrap();
    assert!(library.for_profile(super::LOCAL_SCOPE).history.is_empty());
    assert_eq!(library.for_profile(&remote).history.len(), 1);
    assert!(!super::valid_scope("../../local"));
}
