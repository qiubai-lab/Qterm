use crate::{AuthPreference, Catalog, MAX_CATALOG_BYTES, MAX_ITEMS};
use std::collections::HashSet;

fn text(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.trim() == value
        && value.chars().count() <= max
        && !value.chars().any(char::is_control)
}
fn id(value: &str) -> bool {
    text(value, 128) && value.len() <= 128 && !value.chars().any(char::is_whitespace)
}

impl Catalog {
    pub fn validate(&self) -> Result<(), &'static str> {
        if serde_json::to_vec(self).map_err(|_| "连接编码失败")?.len() > MAX_CATALOG_BYTES {
            return Err("连接目录超过同步容量限制（1 MiB）");
        }
        if self.profiles.len() > MAX_ITEMS || self.groups.len() > MAX_ITEMS {
            return Err("连接或分组数量超出限制");
        }
        let mut names = HashSet::new();
        for (key, group) in &self.groups {
            if !id(key) || !text(&group.name, 80) || !names.insert(group.name.to_ascii_lowercase())
            {
                return Err("分组名称重复或格式无效，请先在连接管理中调整");
            }
        }
        for (key, profile) in &self.profiles {
            if !id(key)
                || !text(&profile.name, 80)
                || !text(&profile.host, 253)
                || !text(&profile.username, 128)
                || profile.port == 0
                || profile.host.chars().any(char::is_whitespace)
                || profile.username.chars().any(char::is_whitespace)
            {
                return Err("连接字段格式无效");
            }
            if profile
                .group_id
                .as_ref()
                .is_some_and(|group| !self.groups.contains_key(group))
            {
                return Err("连接引用的分组不存在");
            }
            if profile.jump_profile_ids.len() > 4 {
                return Err("跳板机最多为四个");
            }
            let mut seen = HashSet::new();
            for jump in &profile.jump_profile_ids {
                if jump == key || !seen.insert(jump) {
                    return Err("跳板机引用重复或指向自身");
                }
                let Some(target) = self.profiles.get(jump) else {
                    return Err("跳板机不存在");
                };
                // Routes are explicit, ordered lists; nested routes are not expanded by Qterm.
                if target.auth_preference == AuthPreference::Manual {
                    return Err("跳板机需要明确认证方式");
                }
            }
        }
        Ok(())
    }
}
