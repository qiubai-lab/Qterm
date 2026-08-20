const MAX_DIRECTORY_ENTRIES: usize = 5000;
pub const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_IMAGE_FILE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_RECURSIVE_FILE_ENTRIES: usize = 100_000;
pub const MAX_RECURSIVE_FILE_DEPTH: usize = 128;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub permission_mode: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileDocument {
    pub bytes: Vec<u8>,
    pub revision: String,
    pub modified_at: Option<u64>,
}

pub fn content_revision(bytes: &[u8]) -> String {
    use std::hash::{DefaultHasher, Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirectoryListing {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

impl DirectoryListing {
    pub fn new(path: String, mut entries: Vec<FileEntry>) -> Self {
        entries.sort_by(|left, right| {
            right
                .is_directory
                .cmp(&left.is_directory)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        entries.truncate(MAX_DIRECTORY_ENTRIES);
        Self { path, entries }
    }
}

#[cfg(test)]
mod tests {
    use super::{DirectoryListing, FileEntry};

    #[test]
    fn listings_sort_directories_first_and_bound_the_result() {
        let mut entries = vec![FileEntry {
            name: "z.txt".into(),
            path: "/z.txt".into(),
            is_directory: false,
            is_symlink: false,
            size: 1,
            modified_at: None,
            permission_mode: None,
        }];
        entries.extend((0..5001).map(|index| FileEntry {
            name: format!("folder-{index:04}"),
            path: format!("/folder-{index:04}"),
            is_directory: true,
            is_symlink: false,
            size: 0,
            modified_at: None,
            permission_mode: None,
        }));
        let listing = DirectoryListing::new("/".into(), entries);
        assert_eq!(listing.entries.len(), 5000);
        assert!(listing.entries[0].is_directory);
        assert!(!listing.entries.iter().any(|entry| entry.name == "z.txt"));
    }
}
