use crate::domain::{auth::SecretText, configuration_merge::*};
use std::path::Path;

pub trait ConfigurationMergeStorage {
    fn scan(&mut self, source: &Path) -> MergeResult<MergeScan>;
    fn read_selected(
        &mut self,
        options: MergeOptions,
        password: Option<SecretText>,
    ) -> MergeResult<(MergeCatalog, MergeCatalog)>;
    fn stage(&mut self, plan: &MergePlan) -> MergeResult<String>;
    fn commit(&mut self, token: &str) -> MergeResult<()>;
    fn cancel(&mut self);
}
