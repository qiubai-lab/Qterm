use crate::domain::web_tabs::WebTabCache;

pub trait WebTabRepository: Send + Sync {
    fn load(&self) -> Result<WebTabCache, String>;
    fn save(&self, cache: &WebTabCache) -> Result<(), String>;
}
