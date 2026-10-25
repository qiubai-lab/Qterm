use crate::{
    domain::web_library::{WebLibrary, WebLibraryAction},
    ports::web_library_repository::WebLibraryRepository,
};
use std::sync::Mutex;

/// One transaction owner for all blocks, including reads during mutations.
pub struct WebLibraryService<R> {
    repository: Mutex<R>,
}

impl<R: WebLibraryRepository> WebLibraryService<R> {
    pub fn new(repository: R) -> Self {
        Self {
            repository: Mutex::new(repository),
        }
    }

    pub fn execute(
        &self,
        profile: &str,
        action: Option<WebLibraryAction>,
        now: u64,
    ) -> Result<WebLibrary, String> {
        if !crate::domain::web_library::valid_scope(profile) {
            return Err("连接标识无效".into());
        }
        let repository = self.repository.lock().map_err(|_| "浏览记录暂不可用")?;
        let mut library = repository.load()?;
        if let Some(action) = action {
            library.apply(profile, action, now)?;
            repository.save(&library)?;
        }
        Ok(library.for_profile(profile))
    }
}
