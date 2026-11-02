use super::public_origin;

#[test]
fn remote_http_requires_explicit_opt_in() {
    for origin in ["http://192.0.2.10:8080", "http://qterm.internal:8080"] {
        assert!(public_origin(origin, false).is_err());
        assert_eq!(public_origin(origin, true).unwrap().scheme(), "http");
    }
}

#[test]
fn https_and_loopback_remain_available_by_default() {
    for origin in [
        "https://qterm.example.com",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://[::1]:8080",
    ] {
        assert!(public_origin(origin, false).is_ok(), "{origin}");
    }
}

#[test]
fn http_opt_in_preserves_exact_origin_boundaries() {
    for origin in [
        "http://192.0.2.10:8080/",
        "http://user:password@192.0.2.10:8080",
        "http://192.0.2.10:8080/path",
        "http://192.0.2.10:8080?query",
        "http://192.0.2.10:8080#fragment",
        "ws://192.0.2.10:8080",
        "ftp://192.0.2.10",
        "null",
        "*",
    ] {
        assert!(public_origin(origin, true).is_err(), "{origin}");
    }
}
