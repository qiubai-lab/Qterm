//! Connection identity and protection policy, independent of browser/platform APIs.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct BrowserIdentity {
    pub profile: String,
    pub route: Vec<(String, u16, String)>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserProtection {
    Native,
    MasterPassword,
}

impl BrowserProtection {
    /// Future key/unlock and migration logic belongs behind this storage gate.
    pub fn require_available(self) -> Result<(), String> {
        match self {
            Self::Native => Ok(()),
            Self::MasterPassword => Err("此浏览环境需要主密码保护，当前版本尚不支持解锁".into()),
        }
    }
}

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClearBrowserData {
    pub cache: bool,
    pub cookies: bool,
    pub storage: bool,
}

impl ClearBrowserData {
    pub fn validate(self) -> Result<(), String> {
        if self.cache || self.cookies || self.storage {
            Ok(())
        } else {
            Err("请选择需要清理的数据".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protection_is_explicit_and_unsupported_encryption_fails_closed() {
        assert!(BrowserProtection::Native.require_available().is_ok());
        assert!(
            BrowserProtection::MasterPassword
                .require_available()
                .is_err()
        );
        assert!(
            ClearBrowserData {
                cache: false,
                cookies: false,
                storage: false
            }
            .validate()
            .is_err()
        );
    }
}
