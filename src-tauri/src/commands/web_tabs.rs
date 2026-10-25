use crate::{
    application::web_tab_service::WebTabService, domain::web_tabs::WebTabCache,
    infrastructure::persistence::json_web_tabs::JsonWebTabs,
};
use std::sync::Arc;
use tauri::State;

pub struct WebTabState {
    service: Arc<WebTabService<JsonWebTabs>>,
}
impl WebTabState {
    pub fn new(repository: JsonWebTabs) -> Self {
        Self {
            service: Arc::new(WebTabService::new(repository)),
        }
    }
}

/// Main-only handler; guest documents never receive filesystem or recovery IPC.
#[tauri::command]
pub async fn web_tab_cache(
    state: State<'_, WebTabState>,
    cache: Option<WebTabCache>,
) -> Result<WebTabCache, String> {
    let service = state.service.clone();
    tauri::async_runtime::spawn_blocking(move || service.execute(cache))
        .await
        .map_err(|_| "标签记录操作失败".to_owned())?
}
