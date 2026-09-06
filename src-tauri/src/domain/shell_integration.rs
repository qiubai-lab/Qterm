pub const MAX_SHELL_PROBE_OUTPUT_BYTES: usize = 4 * 1024;
pub const POSIX_SHELL_PROBE_COMMAND: &str = "printf '__QTERM_SHELL__'; basename \"$SHELL\"";
pub const POWERSHELL_PROBE_COMMAND: &str = "Write-Output ('__QTERM_SHELL__powershell')";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoteShell {
    Bash,
    Zsh,
    Fish,
    PowerShell,
}

impl RemoteShell {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bash => "bash",
            Self::Zsh => "zsh",
            Self::Fish => "fish",
            Self::PowerShell => "powershell",
        }
    }

    pub fn parse_name(value: &str) -> Option<Self> {
        match value {
            "bash" => Some(Self::Bash),
            "zsh" => Some(Self::Zsh),
            "fish" => Some(Self::Fish),
            "powershell" | "pwsh" => Some(Self::PowerShell),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteShellTarget {
    profile_id: String,
    host: String,
    port: u16,
    username: String,
}

impl RemoteShellTarget {
    pub fn new(profile_id: String, host: String, port: u16, username: String) -> Self {
        Self {
            profile_id,
            host,
            port,
            username,
        }
    }

    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }
    pub fn host(&self) -> &str {
        &self.host
    }
    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn username(&self) -> &str {
        &self.username
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoteShellCacheError {
    Corrupt,
    UnsupportedVersion,
    StorageUnavailable,
}

pub fn parse_shell_probe_output(output: &[u8]) -> Option<RemoteShell> {
    if output.len() > MAX_SHELL_PROBE_OUTPUT_BYTES {
        return None;
    }
    let text = std::str::from_utf8(output).ok()?;
    let mut detected = text
        .lines()
        .map(|line| line.trim_end_matches('\r'))
        .filter_map(|line| line.strip_prefix("__QTERM_SHELL__"))
        .filter_map(RemoteShell::parse_name);
    let shell = detected.next()?;
    detected.next().is_none().then_some(shell)
}

#[cfg(test)]
mod tests {
    use super::{MAX_SHELL_PROBE_OUTPUT_BYTES, RemoteShell, parse_shell_probe_output};
    #[test]
    fn parses_only_exact_supported_probe_markers() {
        for (output, expected) in [
            (b"__QTERM_SHELL__bash\n".as_slice(), RemoteShell::Bash),
            (b"__QTERM_SHELL__zsh\r\n".as_slice(), RemoteShell::Zsh),
            (b"__QTERM_SHELL__fish\n".as_slice(), RemoteShell::Fish),
            (
                b"__QTERM_SHELL__powershell\r\n".as_slice(),
                RemoteShell::PowerShell,
            ),
        ] {
            assert_eq!(parse_shell_probe_output(output), Some(expected));
        }
        for output in [
            b"bash\n".as_slice(),
            b"prefix__QTERM_SHELL__bash\n".as_slice(),
            b"__QTERM_SHELL__bash-suffix\n".as_slice(),
            b"__QTERM_SHELL__sh\n".as_slice(),
            b"__QTERM_SHELL__bash\n__QTERM_SHELL__zsh\n".as_slice(),
        ] {
            assert_eq!(parse_shell_probe_output(output), None);
        }
        assert_eq!(
            parse_shell_probe_output(&vec![b'x'; MAX_SHELL_PROBE_OUTPUT_BYTES + 1]),
            None
        );
    }
}
