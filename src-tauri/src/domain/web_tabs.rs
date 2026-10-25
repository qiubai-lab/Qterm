//! Disposable tab recovery snapshots. Native pages, sessions and form payloads stay transient.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const WEB_TAB_LIMIT: usize = 99;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebTabCache {
    pub blocks: Vec<WebBlockTabs>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebBlockTabs {
    pub block_id: String,
    pub profile_id: Option<String>,
    pub selected_tab_id: String,
    pub tabs: Vec<WebTab>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebTab {
    pub id: String,
    pub address: String,
    pub title: String,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
}

impl WebTabCache {
    pub fn valid(&self) -> bool {
        let mut blocks = HashSet::new();
        self.blocks.len() <= 4096
            && self.blocks.iter().all(|block| {
                let mut tabs = HashSet::new();
                valid_id(&block.block_id)
                    && blocks.insert(&block.block_id)
                    && block
                        .profile_id
                        .as_deref()
                        .is_none_or(|id| uuid::Uuid::parse_str(id).is_ok())
                    && !block.tabs.is_empty()
                    && block.tabs.len() <= WEB_TAB_LIMIT
                    && block.tabs.iter().any(|tab| tab.id == block.selected_tab_id)
                    && block.tabs.iter().all(|tab| {
                        valid_id(&tab.id)
                            && tabs.insert(&tab.id)
                            && (tab.address.is_empty() || super::web::allowed_web_url(&tab.address))
                            && tab.title.len() <= 2048
                            && !tab.title.chars().any(char::is_control)
                    })
            })
    }
}
