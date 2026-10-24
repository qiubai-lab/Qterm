use crate::domain::web_library::WebLibrary;

pub trait WebLibraryRepository: Send + Sync {
    fn load(&self) -> Result<WebLibrary, String>;
    fn save(&self, library: &WebLibrary) -> Result<(), String>;
}
