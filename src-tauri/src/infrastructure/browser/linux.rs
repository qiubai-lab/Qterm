use std::{
    ffi::{OsStr, OsString},
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::Command,
};

use super::{BrowserProxyError, ProxyBrowser};

pub(super) fn browser_installed(browser: ProxyBrowser) -> bool {
    detect_browser(browser).is_some()
}

pub(super) fn launch_browser(
    browser: ProxyBrowser,
    arguments: &[String],
) -> Result<(), BrowserProxyError> {
    let executable = detect_browser(browser).ok_or(BrowserProxyError::BrowserNotInstalled)?;
    let mut command = Command::new(executable);
    command.args(arguments);
    isolate_external_process_from_appimage(&mut command);
    command
        .spawn()
        .map(|_| ())
        .map_err(|_| BrowserProxyError::LaunchFailed)
}

fn isolate_external_process_from_appimage(command: &mut Command) {
    let Some(app_dir) = std::env::var_os("APPDIR").map(PathBuf::from) else {
        return;
    };
    if let Some(library_path) = std::env::var_os("LD_LIBRARY_PATH") {
        match external_library_path(&app_dir, &library_path) {
            Some(value) => {
                command.env("LD_LIBRARY_PATH", value);
            }
            None => {
                command.env_remove("LD_LIBRARY_PATH");
            }
        }
    }
    for variable in ["APPDIR", "APPIMAGE", "ARGV0", "OWD"] {
        command.env_remove(variable);
    }
}

fn external_library_path(app_dir: &Path, library_path: &OsStr) -> Option<OsString> {
    let system_paths: Vec<_> = std::env::split_paths(library_path)
        .filter(|path| !path.starts_with(app_dir))
        .collect();
    std::env::join_paths(system_paths)
        .ok()
        .filter(|value| !value.is_empty())
}

fn detect_browser(browser: ProxyBrowser) -> Option<PathBuf> {
    let candidates = path_candidates(browser)
        .into_iter()
        .chain(standard_candidates(browser));
    resolve_browser_candidate(candidates, trusted_roots(browser))
}

fn path_candidates(browser: ProxyBrowser) -> Vec<PathBuf> {
    let names: &[&str] = match browser {
        ProxyBrowser::Chrome => &["google-chrome", "google-chrome-stable"],
        ProxyBrowser::Edge => &["microsoft-edge", "microsoft-edge-stable"],
    };
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .flat_map(|root| names.iter().map(move |name| root.join(name)))
        .collect()
}

fn standard_candidates(browser: ProxyBrowser) -> Vec<PathBuf> {
    match browser {
        ProxyBrowser::Chrome => vec![
            PathBuf::from("/usr/bin/google-chrome"),
            PathBuf::from("/usr/bin/google-chrome-stable"),
            PathBuf::from("/opt/google/chrome/google-chrome"),
        ],
        ProxyBrowser::Edge => vec![
            PathBuf::from("/usr/bin/microsoft-edge"),
            PathBuf::from("/usr/bin/microsoft-edge-stable"),
            PathBuf::from("/opt/microsoft/msedge/msedge"),
        ],
    }
}

fn trusted_roots(browser: ProxyBrowser) -> &'static [&'static str] {
    match browser {
        ProxyBrowser::Chrome => &["/opt/google/chrome"],
        ProxyBrowser::Edge => &["/opt/microsoft/msedge"],
    }
}

fn resolve_browser_candidate(
    candidates: impl IntoIterator<Item = PathBuf>,
    trusted_roots: &[&str],
) -> Option<PathBuf> {
    candidates.into_iter().find_map(|candidate| {
        let canonical = candidate.canonicalize().ok()?;
        let metadata = canonical.metadata().ok()?;
        let trusted = trusted_roots
            .iter()
            .any(|root| canonical.starts_with(Path::new(root)));
        (trusted && metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
            .then_some(canonical)
    })
}

#[cfg(test)]
mod tests {
    use std::{fs, os::unix::fs::PermissionsExt};

    use tempfile::tempdir;

    use super::{external_library_path, resolve_browser_candidate};

    #[test]
    fn detection_accepts_only_executable_files_below_a_trusted_native_package_root() {
        let root = tempdir().expect("trusted root");
        let executable = root.path().join("browser");
        fs::write(&executable, b"browser").expect("fixture");
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).expect("mode");
        let trusted = root.path().to_string_lossy().into_owned();

        assert_eq!(
            resolve_browser_candidate(vec![executable.clone()], &[trusted.as_str()]),
            executable.canonicalize().ok()
        );
        assert_eq!(
            resolve_browser_candidate(vec![executable], &["/snap", "/var/lib/flatpak"]),
            None
        );
    }

    #[test]
    fn detection_rejects_non_executable_files() {
        let root = tempdir().expect("trusted root");
        let candidate = root.path().join("browser");
        fs::write(&candidate, b"browser").expect("fixture");
        fs::set_permissions(&candidate, fs::Permissions::from_mode(0o644)).expect("mode");
        let trusted = root.path().to_string_lossy().into_owned();

        assert_eq!(
            resolve_browser_candidate(vec![candidate], &[trusted.as_str()]),
            None
        );
    }

    #[test]
    fn appimage_library_entries_do_not_leak_into_the_external_browser() {
        let value = external_library_path(
            std::path::Path::new("/tmp/.mount_qterm"),
            std::ffi::OsStr::new("/tmp/.mount_qterm/usr/lib:/usr/local/lib:/tmp/.mount_qterm/lib"),
        );

        assert_eq!(
            value.as_deref(),
            Some(std::ffi::OsStr::new("/usr/local/lib"))
        );
    }
}
