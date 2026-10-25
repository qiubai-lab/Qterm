use crate::{domain::web_tabs::WebTabCache, ports::web_tab_repository::WebTabRepository};
use std::sync::Mutex;

/// Serializes complete snapshots; the trusted workspace save owner orders layout and tabs.
pub struct WebTabService<R> {
    repository: Mutex<R>,
}

impl<R: WebTabRepository> WebTabService<R> {
    pub fn new(repository: R) -> Self {
        Self {
            repository: Mutex::new(repository),
        }
    }

    pub fn execute(&self, cache: Option<WebTabCache>) -> Result<WebTabCache, String> {
        let repository = self.repository.lock().map_err(|_| "标签记录暂不可用")?;
        if let Some(cache) = cache {
            if !cache.valid() {
                return Err("标签记录无效".into());
            }
            repository.save(&cache)?;
            Ok(cache)
        } else {
            repository.load()
        }
    }
}
