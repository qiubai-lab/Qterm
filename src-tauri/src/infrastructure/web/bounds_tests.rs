use super::WebBounds;

#[test]
fn covered_surface_requires_native_input_isolation_and_defaults_are_compatible() {
    let mut bounds: WebBounds =
        serde_json::from_str(r#"{"x":0,"y":0,"width":400,"height":300,"visible":true}"#).unwrap();
    assert!(bounds.valid());
    assert!(!bounds.covered && !bounds.input_blocked);
    bounds.covered = true;
    assert!(!bounds.valid());
    bounds.input_blocked = true;
    assert!(bounds.valid());
}
