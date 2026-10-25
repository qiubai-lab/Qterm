//! Fixed presentation script with a numeric-only palette supplied by the trusted UI.
pub(super) const SCRIPT: &str = include_str!("scrollbar_script.mjs");
const GEOMETRY: &str = include_str!("scrollbar_geometry.mjs");
const INTERACTION: &str = include_str!("scrollbar_interaction.mjs");
const OVERLAY: &str = include_str!("scrollbar_overlay.mjs");
const CSS: &str = include_str!("scrollbar_overlay.css");

pub(super) fn script(palette: Option<&[[u8; 4]; 3]>) -> String {
    let argument = palette
        .map(|colors| serde_json::to_string(colors).unwrap())
        .unwrap_or_else(|| "undefined".into());
    let css = serde_json::to_string(CSS).unwrap();
    format!(
        "{SCRIPT}({argument}, (document, window) => ({OVERLAY})(document, window, {GEOMETRY}, {INTERACTION}, {css}));"
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn palette_is_only_numeric_data() {
        let palette = [[1, 2, 3, 255], [4, 5, 6, 128], [7, 8, 9, 0]];
        assert!(
            super::script(Some(&palette))
                .contains("([[1,2,3,255],[4,5,6,128],[7,8,9,0]], (document")
        );
        assert!(super::script(None).contains("(undefined, (document"));
    }
}
