//! Ordering rules shared by native navigation callbacks; no page scripting or IPC authority.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PageState {
    pub label: String,
    pub url: String,
    pub loading: bool,
    pub visited: bool,
    pub title: String,
    pub metadata: bool,
}

pub(super) struct NavigationState {
    label: String,
    active: Option<u64>,
    source: String,
    title: String,
    loaded: bool,
}

impl NavigationState {
    pub fn new(label: String) -> Self {
        Self {
            label,
            active: None,
            source: String::new(),
            title: String::new(),
            loaded: false,
        }
    }
    fn snapshot(&self, url: String, visited: bool) -> PageState {
        PageState {
            label: self.label.clone(),
            url,
            loading: self.active.is_some(),
            visited,
            title: self.title.clone(),
            metadata: false,
        }
    }
    pub fn start(&mut self, id: u64, url: String) -> PageState {
        self.active = Some(id);
        self.title.clear();
        self.loaded = false;
        self.snapshot(url, false)
    }
    pub fn source(&mut self, url: String, new_document: bool) -> PageState {
        let visited = !new_document && self.active.is_none() && self.source != url;
        self.source = url.clone();
        self.snapshot(url, visited)
    }
    pub fn title(&mut self, url: String, title: String) -> Option<PageState> {
        if self.active.is_some() || !self.loaded || self.source != url {
            return None;
        }
        let title = crate::domain::web_library::page_title(&title);
        if title.is_empty() || title == self.title {
            return None;
        }
        self.title = title;
        let mut snapshot = self.snapshot(url, false);
        snapshot.metadata = true;
        Some(snapshot)
    }
    pub fn complete(&mut self, id: u64, url: String, success: bool) -> Option<PageState> {
        if self.active != Some(id) {
            return None;
        }
        self.active = None;
        self.loaded = success;
        self.source = url.clone();
        Some(self.snapshot(url, success))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn titles_follow_only_the_successful_current_document() {
        let mut state = NavigationState::new("web-test".into());
        state.start(1, "https://host/a".into());
        state.source("https://host/a".into(), true);
        assert!(
            state
                .title("https://host/a".into(), "early".into())
                .is_none()
        );
        state.complete(1, "https://host/a".into(), true).unwrap();
        let title = state.title("https://host/a".into(), "标题".into()).unwrap();
        assert!(title.metadata && !title.visited && !title.loading);
        assert_eq!(title.title, "标题");
        assert!(
            state
                .title("https://host/a".into(), "标题".into())
                .is_none()
        );
        state.source("https://host/b".into(), false);
        assert!(
            state
                .title("https://host/a".into(), "stale".into())
                .is_none()
        );
        assert!(
            state
                .title("https://host/b".into(), "路由标题".into())
                .is_some()
        );
        state.start(2, "https://host/c".into());
        state.complete(2, "https://host/c".into(), false).unwrap();
        assert!(
            state
                .title("https://host/c".into(), "error page".into())
                .is_none()
        );
    }
    #[test]
    fn latest_navigation_owns_loading_and_only_successful_routes_are_visits() {
        let mut state = NavigationState::new("web-test".into());
        assert!(state.start(1, "https://host/start".into()).loading);
        state.start(1, "https://host/redirect".into());
        assert!(!state.source("https://host/redirect".into(), true).visited);
        state.start(2, "https://host/new".into());
        assert!(state.complete(1, "https://host/old".into(), true).is_none());
        let canceled = state
            .complete(2, "https://host/redirect".into(), false)
            .unwrap();
        assert!(!canceled.loading && !canceled.visited);
        state.start(3, "https://host/new".into());
        assert!(
            state
                .complete(3, "https://host/new".into(), true)
                .unwrap()
                .visited
        );
        let route = state.source("https://host/new#section".into(), false);
        assert!(!route.loading && route.visited);
        assert!(!state.source(route.url, false).visited);
        assert!(state.complete(3, "https://host/new".into(), true).is_none());
    }
}
