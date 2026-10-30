//! Native navigation notifications. Callbacks never perform synchronous Tauri getters.
use super::navigation_state::{NavigationState, PageState};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
#[derive(Clone)]
pub(super) struct Navigation {
    app: tauri::AppHandle,
    state: Arc<Mutex<State>>,
}
struct State {
    model: NavigationState,
    generation: u64,
    url: String,
    failed: bool,
    title: String,
}
impl Navigation {
    pub fn new(app: &tauri::AppHandle, label: &str) -> Self {
        Self {
            app: app.clone(),
            state: Arc::new(Mutex::new(State {
                model: NavigationState::new(label.into()),
                generation: 0,
                url: String::new(),
                failed: false,
                title: String::new(),
            })),
        }
    }
    fn emit(&self, event: PageState) {
        if crate::domain::web::allowed_web_url(&event.url) {
            let _ = self.app.emit_to("main", "web-page-state", event);
        }
    }
    pub fn start(&self, url: String) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.generation += 1;
        state.url = url.clone();
        state.failed = false;
        state.title.clear();
        let generation = state.generation;
        self.emit(state.model.start(generation, url));
    }
    pub fn source(&self, url: String, new_document: bool) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.url = url.clone();
        self.emit(state.model.source(url, new_document));
    }
    pub fn failed(&self, url: &str) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.url == url {
            state.failed = true;
            let generation = state.generation;
            if let Some(event) = state.model.complete(generation, url.to_owned(), false) {
                self.emit(event);
            }
        }
    }
    pub fn complete(&self, url: String) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.url != url {
            return;
        }
        let (generation, success) = (state.generation, !state.failed);
        if let Some(event) = state.model.complete(generation, url.clone(), success) {
            self.emit(event);
            let title = state.title.clone();
            if let Some(event) = state.model.title(url, title) {
                self.emit(event);
            }
        }
    }
    pub fn title(&self, title: String) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.title = title.clone();
        let url = state.url.clone();
        if let Some(event) = state.model.title(url, title) {
            self.emit(event);
        }
    }
    pub fn stop(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (generation, url) = (state.generation, state.url.clone());
        if let Some(event) = state.model.cancel(generation, url) {
            self.emit(event);
        }
    }
}
