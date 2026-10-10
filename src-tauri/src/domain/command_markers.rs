//! Shared current-session OSC 133 installers for Bash and Zsh.
use super::shell_integration::RemoteShell;

pub fn script(shell: RemoteShell) -> Option<&'static str> {
    match shell {
        RemoteShell::Bash => Some(include_str!(
            "../../../scripts/shell-integration/qterm.bash"
        )),
        RemoteShell::Zsh => Some(include_str!("../../../scripts/shell-integration/qterm.zsh")),
        _ => None,
    }
}

/// A single input line, without literal terminal controls. The function scope
/// permits the sourceable script's early returns without exiting the login shell.
pub fn installation(shell: RemoteShell) -> String {
    let Some(script) = script(shell) else {
        return String::new();
    };
    let literal = script
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\r', "")
        .replace('\n', "\\n");
    format!(
        "__qterm_install_commands() {{ eval $'{literal}'; }}; __qterm_install_commands; unset -f __qterm_install_commands; "
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installers_are_bounded_single_lines_and_unsupported_shells_are_untouched() {
        for shell in [RemoteShell::Bash, RemoteShell::Zsh] {
            let line = installation(shell);
            assert!(line.len() < 3000);
            assert!(!line.contains(['\n', '\r', '\x1b']));
            assert!(line.contains("__qterm_commands_loaded"));
        }
        assert!(installation(RemoteShell::Fish).is_empty());
        assert!(installation(RemoteShell::PowerShell).is_empty());
    }
}

#[cfg(test)]
#[path = "command_markers_live_tests.rs"]
mod live_tests;
