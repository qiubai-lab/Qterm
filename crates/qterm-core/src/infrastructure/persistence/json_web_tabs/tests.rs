use super::*;
use crate::{
    application::web_tab_service::WebTabService,
    domain::web_tabs::{WebBlockTabs, WebTab},
};

fn snapshot() -> WebTabCache {
    WebTabCache {
        blocks: ["web-a", "web-b"]
            .into_iter()
            .map(|id| WebBlockTabs {
                block_id: id.into(),
                profile_id: None,
                selected_tab_id: "second".into(),
                tabs: vec![
                    WebTab {
                        id: "first".into(),
                        address: format!("https://example.test/{id}"),
                        title: id.into(),
                    },
                    WebTab {
                        id: "second".into(),
                        address: "".into(),
                        title: "".into(),
                    },
                ],
            })
            .collect(),
    }
}

#[test]
fn cache_survives_restart_and_preserves_independent_blocks_order_and_selection() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("web-tabs/sessions.json");
    let service = WebTabService::new(JsonWebTabs::new(path.clone()));
    assert_eq!(service.execute(None).unwrap(), WebTabCache::default());
    service.execute(Some(snapshot())).unwrap();
    drop(service);
    let service = WebTabService::new(JsonWebTabs::new(path.clone()));
    assert_eq!(service.execute(None).unwrap(), snapshot());
    let mut remaining = snapshot();
    remaining.blocks.remove(0);
    service.execute(Some(remaining.clone())).unwrap();
    assert_eq!(JsonWebTabs::new(path).load().unwrap(), remaining);
}

#[test]
fn damaged_future_and_sensitive_cache_files_are_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("tabs.json");
    for bytes in [
        "{broken",
        r#"{"schemaVersion":2,"cache":{"blocks":[]}}"#,
        r#"{"schemaVersion":1,"cache":{"blocks":[],"sessionId":"secret"}}"#,
    ] {
        fs::write(&path, bytes).unwrap();
        let cache = JsonWebTabs::new(path.clone());
        assert!(cache.load().is_err());
        assert!(cache.save(&WebTabCache::default()).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), bytes);
    }
}

#[test]
fn rejects_unsafe_urls_duplicates_and_invalid_selection() {
    let temp = tempfile::tempdir().unwrap();
    let cache = JsonWebTabs::new(temp.path().join("tabs.json"));
    for address in [
        "file:///private",
        "javascript:alert(1)",
        "https://user:password@host/",
        "https://tauri.localhost/",
        "https://[broken/",
    ] {
        let mut bad = snapshot();
        bad.blocks[0].tabs[0].address = address.into();
        assert!(cache.save(&bad).is_err(), "{address}");
    }
    let mut bad = snapshot();
    bad.blocks[0].selected_tab_id = "absent".into();
    assert!(cache.save(&bad).is_err());
    let mut bad = snapshot();
    bad.blocks.push(bad.blocks[0].clone());
    assert!(cache.save(&bad).is_err());
    let mut bad = snapshot();
    let duplicate = bad.blocks[0].tabs[0].clone();
    bad.blocks[0].tabs.push(duplicate);
    assert!(cache.save(&bad).is_err());
    let mut bad = snapshot();
    bad.blocks[0].profile_id = Some("local".into());
    assert!(cache.save(&bad).is_err());
}

#[test]
fn preserves_99_tabs_per_block_after_restart_and_rejects_100_without_overwriting() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("tabs.json");
    let mut saved = snapshot();
    for block in &mut saved.blocks {
        block.tabs = (0..99)
            .map(|index| WebTab {
                id: format!("tab-{index}"),
                address: format!("https://example.test/{}/{index}", block.block_id),
                title: format!("Page {index}"),
            })
            .collect();
        block.selected_tab_id = "tab-98".into();
    }
    WebTabService::new(JsonWebTabs::new(path.clone()))
        .execute(Some(saved.clone()))
        .unwrap();
    let restored = WebTabService::new(JsonWebTabs::new(path.clone()));
    assert_eq!(restored.execute(None).unwrap(), saved);
    let mut excess = saved.clone();
    excess.blocks[0].tabs.push(WebTab {
        id: "tab-99".into(),
        address: String::new(),
        title: String::new(),
    });
    assert!(restored.execute(Some(excess)).is_err());
    assert_eq!(JsonWebTabs::new(path).load().unwrap(), saved);
}
