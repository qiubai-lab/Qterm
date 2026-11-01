//! Connection-scoped browser library rules; native sessions never enter persistence.
use serde::{Deserialize, Serialize};

/// Reserved device scope cannot collide with a remote profile UUID.
pub const LOCAL_SCOPE: &str = "local";
pub fn valid_scope(scope: &str) -> bool {
    scope == LOCAL_SCOPE || uuid::Uuid::parse_str(scope).is_ok()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebEntry {
    pub profile_id: String,
    pub url: String,
    pub title: String,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WebLibrary {
    pub history: Vec<WebEntry>,
    pub bookmarks: Vec<WebEntry>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum WebLibraryAction {
    Visit {
        url: String,
        #[serde(default)]
        title: String,
    },
    Title {
        url: String,
        title: String,
    },
    Bookmark {
        url: String,
        title: String,
    },
    Unbookmark {
        url: String,
    },
    RemoveVisit {
        url: String,
    },
    ClearHistory,
}

impl WebLibraryAction {
    pub fn url_mut(&mut self) -> Option<&mut String> {
        match self {
            Self::Visit { url, .. }
            | Self::Title { url, .. }
            | Self::Bookmark { url, .. }
            | Self::Unbookmark { url }
            | Self::RemoveVisit { url } => Some(url),
            Self::ClearHistory => None,
        }
    }
}

impl WebLibrary {
    pub fn valid(&self) -> bool {
        [&self.history, &self.bookmarks].iter().all(|entries| {
            let mut unique = std::collections::HashSet::new();
            entries.len() <= 2000
                && entries.iter().all(|entry| {
                    valid_scope(&entry.profile_id)
                        && super::web::allowed_web_url(&entry.url)
                        && !entry.title.is_empty()
                        && entry.title.len() <= 512
                        && !entry.title.chars().any(char::is_control)
                        && entry.updated_at <= 8_640_000_000_000_000
                        && unique.insert((&entry.profile_id, &entry.url))
                })
        })
    }

    pub fn for_profile(&self, profile: &str) -> Self {
        let select = |items: &[WebEntry]| {
            items
                .iter()
                .filter(|e| e.profile_id == profile)
                .cloned()
                .collect()
        };
        Self {
            history: select(&self.history),
            bookmarks: select(&self.bookmarks),
        }
    }

    pub fn apply(
        &mut self,
        profile: &str,
        action: WebLibraryAction,
        now: u64,
    ) -> Result<(), &'static str> {
        if !valid_scope(profile) {
            return Err("连接标识无效");
        }
        let entry = |url: String, title: String| -> Result<WebEntry, &'static str> {
            if !super::web::allowed_web_url(&url) {
                return Err("仅支持不含用户名或密码的 HTTP/HTTPS 地址");
            }
            let title = title.trim().to_owned();
            if title.is_empty() || title.len() > 512 || title.chars().any(char::is_control) {
                return Err("收藏名称须为 1–512 字节的有效文本");
            }
            Ok(WebEntry {
                profile_id: profile.into(),
                url,
                title,
                updated_at: now,
            })
        };
        match action {
            WebLibraryAction::Visit { url, title } => {
                let title = page_title(&title);
                let has_page_title = !title.is_empty();
                let title = if title.is_empty() {
                    self.history
                        .iter()
                        .find(|e| e.profile_id == profile && e.url == url)
                        .map(|e| e.title.clone())
                        .unwrap_or_else(|| url.chars().take(120).collect())
                } else {
                    title
                };
                let item = entry(url, title)?;
                for bookmark in &mut self.bookmarks {
                    if bookmark.profile_id == profile && bookmark.url == item.url && has_page_title
                    {
                        bookmark.title = item.title.clone();
                    }
                }
                self.history
                    .retain(|e| e.profile_id != profile || e.url != item.url);
                self.history.insert(0, item);
                let mut count = 0;
                self.history.retain(|e| {
                    if e.profile_id != profile {
                        return true;
                    }
                    count += 1;
                    count <= 200
                });
                self.history.truncate(2000);
            }
            WebLibraryAction::Title { url, title } => {
                let title = page_title(&title);
                if !title.is_empty() {
                    // Metadata updates never create visits or reorder records.
                    for item in self.history.iter_mut().chain(self.bookmarks.iter_mut()) {
                        if item.profile_id == profile && item.url == url {
                            item.title = title.clone();
                        }
                    }
                }
            }
            WebLibraryAction::Bookmark { url, title } => {
                let item = entry(url, title)?;
                let existing = self
                    .bookmarks
                    .iter()
                    .position(|e| e.profile_id == profile && e.url == item.url);
                if existing.is_none() && self.bookmarks.len() >= 2000 {
                    return Err("收藏已达上限，请先移除部分收藏");
                }
                if let Some(index) = existing {
                    self.bookmarks.remove(index);
                }
                self.bookmarks.insert(0, item);
            }
            WebLibraryAction::Unbookmark { url } => self
                .bookmarks
                .retain(|e| e.profile_id != profile || e.url != url),
            WebLibraryAction::RemoveVisit { url } => self
                .history
                .retain(|e| e.profile_id != profile || e.url != url),
            WebLibraryAction::ClearHistory => self.history.retain(|e| e.profile_id != profile),
        }
        Ok(())
    }
}

/// Page-provided text is bounded and displayed as text, never markup.
pub fn page_title(value: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut title = String::new();
    for ch in normalized.chars().filter(|ch| !ch.is_control()) {
        if title.len() + ch.len_utf8() > 512 {
            break;
        }
        title.push(ch);
    }
    title
}

#[cfg(test)]
mod tests;
