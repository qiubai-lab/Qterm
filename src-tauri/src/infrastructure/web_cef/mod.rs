//! Connection-owned CEF browser environments. Guest content has no application authority.
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
use tauri_runtime_cef::cef::RequestContext;
use tokio::sync::Mutex;

mod bounds;
pub use bounds::WebBounds;
#[path = "../web/bounds_tests.rs"]
#[cfg(test)]
mod bounds_tests;
#[path = "../web/frame_raster.rs"]
mod frame_raster;
#[path = "../web/surface_raster.rs"]
mod surface_raster;
#[path = "../web/target.rs"]
mod target;
pub use target::WebTarget;
mod actions;
mod contexts;
mod data;
mod gateway;
mod guest_view;
mod lifecycle;
#[path = "../web/local_storage.rs"]
mod local_storage;
mod native;
mod navigation;
#[path = "../web/navigation_state.rs"]
mod navigation_state;
mod page;
mod popup_events;
mod popups;
#[path = "../web/profile_storage.rs"]
mod profile_storage;
mod protocol;
#[path = "../web/scrollbars.rs"]
mod scrollbars;
mod startup;
mod storage;
mod surface;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
#[path = "../web/windows_frame.rs"]
mod windows_frame;
pub(crate) use startup::{initialize_main, on_event};
#[cfg(feature = "cef-integration-test")]
pub(crate) mod test_control;
#[cfg(feature = "cef-integration-test")]
mod test_popups;
#[cfg(feature = "cef-integration-test")]
mod test_session;
#[cfg(all(windows, feature = "cef-integration-test"))]
mod test_windows;
pub use actions::{WebMetrics, WebSnapshot};
pub use popups::reject_popup;

pub struct WebHost {
    state: Mutex<HostState>,
    root: PathBuf,
}
#[derive(Default)]
struct HostState {
    pending_popups: HashMap<String, popup_events::Pending>,
    guests: HashMap<String, Guest>,
    environments: HashMap<String, Environment>,
}
struct Guest {
    popup: Option<tauri_runtime_cef::cef::Browser>,
    target: WebTarget,
    environment: String,
    visible: bool,
    protocol: protocol::Protocol,
    navigation: navigation::Navigation,
    closing: Option<Vec<tauri_runtime_cef::cef::Browser>>,
}
struct Environment {
    directory: PathBuf,
    gateway: Option<gateway::Gateway>,
    context: Option<RequestContext>,
    owners: HashSet<String>,
    retiring: bool,
}
impl WebHost {
    pub fn new(root: PathBuf) -> Self {
        Self {
            state: Mutex::default(),
            root,
        }
    }
}
pub fn supported() -> bool {
    cfg!(any(target_os = "macos", windows))
}
pub fn remote_supported() -> bool {
    supported()
}
pub fn label(id: &str) -> Result<String, String> {
    uuid::Uuid::parse_str(id)
        .map(|id| format!("web-{id}"))
        .map_err(|_| "网页标识无效".into())
}
pub fn trusted_handler(
    handler: impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static,
) -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    move |invoke| {
        if !crate::domain::web::trusted_ui_label(invoke.message.webview_ref().label()) {
            invoke
                .resolver
                .reject("Guest webpages cannot invoke application commands");
            true
        } else {
            handler(invoke)
        }
    }
}
