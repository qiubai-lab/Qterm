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

    pub fn hook_command(self) -> &'static str {
        match self {
            Self::Bash => concat!(
                r#"stty echo 2>/dev/null; __qterm_osc7(){ printf '\033]7;file://%s%s\007' "${HOSTNAME:-localhost}" "$PWD"; }; case ";${PROMPT_COMMAND:-};" in *";__qterm_osc7;"*) ;; *) PROMPT_COMMAND="__qterm_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; __qterm_osc7"#,
                "\r"
            ),
            Self::Zsh => concat!(
                r#"stty echo 2>/dev/null; autoload -Uz add-zsh-hook; __qterm_osc7(){ printf '\033]7;file://%s%s\007' "${HOST:-localhost}" "$PWD"; }; add-zsh-hook -d precmd __qterm_osc7 2>/dev/null; add-zsh-hook precmd __qterm_osc7; __qterm_osc7"#,
                "\r"
            ),
            Self::Fish => concat!(
                r#"stty echo 2>/dev/null; function __qterm_osc7 --on-event fish_prompt; printf '\e]7;file://%s%s\a' (hostname) $PWD; end; __qterm_osc7"#,
                "\r"
            ),
            Self::PowerShell => concat!(
                r#"$global:__QtermOriginalPrompt=$function:prompt; function global:prompt { $h=[System.Net.Dns]::GetHostName(); $p=(Get-Location).Path.Replace('\','/'); $u=if($p.StartsWith('/')){$p}else{'/'+$p}; Write-Host "`e]7;file://$h$u`a" -NoNewline; & $global:__QtermOriginalPrompt }; prompt"#,
                "\r"
            ),
        }
    }

    pub fn suppress_pty_echo(self) -> bool {
        !matches!(self, Self::PowerShell)
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

    #[test]
    fn hooks_are_current_session_only_and_posix_variants_restore_echo() {
        for shell in [RemoteShell::Bash, RemoteShell::Zsh, RemoteShell::Fish] {
            let command = shell.hook_command();
            assert!(command.starts_with("stty echo 2>/dev/null;"));
            assert!(command.contains("]7;file://"));
            assert!(!command.contains(".bashrc"));
            assert!(!command.contains(".zshrc"));
            assert!(!command.contains("config.fish"));
            assert!(command.ends_with('\r'));
            assert!(shell.suppress_pty_echo());
        }
        let powershell = RemoteShell::PowerShell.hook_command();
        assert!(powershell.contains("function global:prompt"));
        assert!(powershell.contains("]7;file://"));
        assert!(!powershell.contains("$PROFILE"));
        assert!(!RemoteShell::PowerShell.suppress_pty_echo());
    }
}
