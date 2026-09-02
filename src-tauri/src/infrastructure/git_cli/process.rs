use super::*;

pub(super) fn candidates() -> Vec<PathBuf> {
    let mut values = Vec::new();
    if let Some(configured) = std::env::var_os("QTERM_GIT_PATH") {
        values.push(PathBuf::from(configured));
    }
    values.push(PathBuf::from(if cfg!(windows) { "git.exe" } else { "git" }));
    if cfg!(windows) {
        for variable in [
            "ProgramW6432",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "LocalAppData",
        ] {
            if let Some(root) = std::env::var_os(variable) {
                let root = PathBuf::from(root);
                values.push(if variable == "LocalAppData" {
                    root.join("Programs/Git/cmd/git.exe")
                } else {
                    root.join("Git/cmd/git.exe")
                });
            }
        }
    } else {
        values.extend(
            [
                "/usr/bin/git",
                "/usr/local/bin/git",
                "/opt/homebrew/bin/git",
            ]
            .map(PathBuf::from),
        );
    }
    values
}

pub(super) fn run_process<I, S>(
    executable: &Path,
    args: I,
    timeout: Duration,
) -> Result<ProcessOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut child = Command::new(executable)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitError::Missing
            } else {
                GitError::Io
            }
        })?;
    let stdout = child.stdout.take().ok_or(GitError::Io)?;
    let stderr = child.stderr.take().ok_or(GitError::Io)?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|_| GitError::Io)? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitError::Timeout);
            }
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    let stdout = stdout_reader.join().map_err(|_| GitError::Io)??;
    let stderr = stderr_reader.join().map_err(|_| GitError::Io)??;
    if !status.success() {
        return Err(classify_failure(&stderr));
    }
    Ok(ProcessOutput { stdout })
}

pub(super) fn read_bounded(mut reader: impl Read) -> Result<Vec<u8>, GitError> {
    let mut result = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut exceeded = false;
    loop {
        let read = reader.read(&mut buffer).map_err(|_| GitError::Io)?;
        if read == 0 {
            break;
        }
        if result.len() + read <= OUTPUT_LIMIT {
            result.extend_from_slice(&buffer[..read]);
        } else {
            exceeded = true;
        }
    }
    if exceeded {
        Err(GitError::OutputTooLarge)
    } else {
        Ok(result)
    }
}

pub(crate) fn classify_failure(stderr: &[u8]) -> GitError {
    let raw = String::from_utf8_lossy(stderr);
    let sanitized = redact_url_userinfo(raw.trim());
    let detail = sanitized.chars().take(1200).collect::<String>();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("not a git repository") {
        GitError::NotRepository
    } else if lower.contains("dubious ownership") || lower.contains("safe.directory") {
        GitError::Conflict("仓库所有权未被 Git 信任，请先在终端配置 safe.directory".into())
    } else if lower.contains("would be overwritten")
        || lower.contains("resolve your current index first")
    {
        GitError::Conflict(detail)
    } else {
        GitError::CommandFailed(detail)
    }
}

pub(crate) fn sanitize_submodule_operation_error(error: GitError) -> GitError {
    match error {
        GitError::CommandFailed(_) | GitError::Conflict(_) => {
            GitError::CommandFailed("子仓库操作失败，请检查执行主机的 Git 配置与凭据".into())
        }
        other => other,
    }
}

pub(crate) fn redact_url_userinfo(value: &str) -> String {
    let mut result = value.to_owned();
    let mut search_from = 0;
    loop {
        let lower = result.to_ascii_lowercase();
        let match_index = ["https://", "http://", "ssh://"]
            .iter()
            .filter_map(|scheme| {
                lower[search_from..]
                    .find(scheme)
                    .map(|index| search_from + index)
            })
            .min();
        let Some(scheme_start) = match_index else {
            break;
        };
        let authority_start = result[scheme_start..]
            .find("://")
            .map(|index| scheme_start + index + 3)
            .unwrap_or(result.len());
        let authority_end = result[authority_start..]
            .find(|character: char| {
                character == '/'
                    || character.is_whitespace()
                    || matches!(character, '\'' | '"' | ')' | ']')
            })
            .map(|index| authority_start + index)
            .unwrap_or(result.len());
        let userinfo_end = result[authority_start..authority_end]
            .rfind('@')
            .map(|index| authority_start + index);
        if let Some(userinfo_end) = userinfo_end {
            result.replace_range(authority_start..=userinfo_end, "***@");
            search_from = authority_start + 4;
        } else {
            search_from = authority_end.max(authority_start + 1);
        }
        if search_from >= result.len() {
            break;
        }
    }
    result
}
