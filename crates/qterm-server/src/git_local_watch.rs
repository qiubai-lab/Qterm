//! Native worktree + Git metadata notifications, including linked worktrees/submodules.
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::watch;

pub fn metadata_paths(root: &Path) -> Vec<PathBuf> {
    let dotgit = root.join(".git");
    let gitdir = if dotgit.is_dir() {
        Some(dotgit)
    } else {
        std::fs::read_to_string(&dotgit)
            .ok()
            .filter(|v| v.len() <= 4096)
            .and_then(|v| v.trim().strip_prefix("gitdir: ").map(|p| root.join(p)))
    };
    let Some(gitdir) = gitdir.and_then(|p| std::fs::canonicalize(p).ok()) else {
        return vec![];
    };
    let common = std::fs::read_to_string(gitdir.join("commondir"))
        .ok()
        .filter(|v| v.len() <= 4096)
        .and_then(|v| std::fs::canonicalize(gitdir.join(v.trim())).ok());
    let mut result = vec![gitdir];
    if let Some(common) = common
        && !result.contains(&common)
    {
        result.push(common);
    }
    result
}
pub fn start(root: &Path, dirty: watch::Sender<u64>) -> notify::Result<RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let relevant = event.map_or(true, |e| {
            !e.kind.is_access()
                && (e.paths.is_empty()
                    || e.paths
                        .iter()
                        .any(|p| p.file_name().is_none_or(|n| n != "index.lock")))
        });
        if relevant {
            dirty.send_modify(|v| *v += 1);
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    // Directory watches survive the atomic file replacement used by Git and editors.
    for path in metadata_paths(root) {
        if !path.starts_with(root) {
            watcher.watch(&path, RecursiveMode::Recursive)?;
        }
    }
    Ok(watcher)
}
