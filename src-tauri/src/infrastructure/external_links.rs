//! Shared opener configuration for the application and native browser tests.
pub(crate) fn plugin<R: tauri::Runtime>() -> impl tauri::plugin::Plugin<R> {
    // Guests use native NewWindowRequested. The plugin's default click listener
    // cancels their anchors and invokes an external-opener command they cannot use.
    // Trusted UI actions explicitly call openUrl through the existing HTTP boundary.
    tauri_plugin_opener::Builder::new()
        .open_js_links_on_click(false)
        .build()
}
