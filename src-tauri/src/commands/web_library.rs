use crate::{
    application::web_library_service::WebLibraryService,
    domain::web_library::{WebLibrary, WebLibraryAction},
    infrastructure::persistence::json_web_library::JsonWebLibrary,
};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

pub struct WebLibraryState {
    service: Arc<WebLibraryService<JsonWebLibrary>>,
}
impl WebLibraryState {
    pub fn new(repository: JsonWebLibrary) -> Self {
        Self {
            service: Arc::new(WebLibraryService::new(repository)),
        }
    }
}

/// Runs on the command worker pool; the existing main-only handler protects this API.
#[tauri::command]
pub async fn web_library(
    state: State<'_, WebLibraryState>,
    profile_id: String,
    mut action: Option<WebLibraryAction>,
) -> Result<WebLibrary, String> {
    if let Some(url) = action.as_mut().and_then(WebLibraryAction::url_mut) {
        if !crate::domain::web::allowed_web_url(url) {
            return Err("网页地址无效".into());
        }
        let canonical = tauri::Url::parse(url).map_err(|_| "网页地址无效")?;
        if !crate::domain::web::allowed_web_url(canonical.as_str()) {
            return Err("网页地址无效".into());
        }
        *url = canonical.to_string();
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效")?
        .as_millis() as u64;
    let service = state.service.clone();
    tauri::async_runtime::spawn_blocking(move || service.execute(&profile_id, action, now))
        .await
        .map_err(|_| "浏览记录操作失败".to_owned())?
}
