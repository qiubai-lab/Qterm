//! Fixed presentation script with a numeric-only palette supplied by the trusted UI.
pub(super) const SCRIPT: &str = include_str!("scrollbar_script.mjs");

pub(super) fn script(palette: Option<&[[u8; 4]; 3]>) -> String {
    let argument = palette
        .map(|colors| serde_json::to_string(colors).unwrap())
        .unwrap_or_default();
    format!("{SCRIPT}({argument});")
}

#[cfg(test)]
mod tests {
    #[test]
    fn palette_is_only_numeric_data() {
        let palette = [[1, 2, 3, 255], [4, 5, 6, 128], [7, 8, 9, 0]];
        assert!(super::script(Some(&palette)).ends_with("([[1,2,3,255],[4,5,6,128],[7,8,9,0]]);"));
        assert!(super::script(None).ends_with("();"));
    }
}
