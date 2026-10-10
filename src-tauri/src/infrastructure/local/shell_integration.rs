//! Ordinary local login-shell startup. User profiles run before queued hooks.
use crate::domain::shell_integration::ShellFeatures;
use crate::infrastructure::shell_startup::ShellStartup;
use portable_pty::CommandBuilder;

type Initialization = (String, ShellStartup);

pub(super) fn command(features: ShellFeatures) -> (CommandBuilder, Option<Initialization>) {
    let default = CommandBuilder::new_default_prog();
    #[cfg(unix)]
    if features.any()
        && let Some((command, initialization)) = integrated_login(&default.get_shell(), features)
    {
        return (command, Some(initialization));
    }
    #[cfg(not(unix))]
    let _ = features;
    (default, None)
}

#[cfg(any(unix, test))]
fn integrated_login(
    executable: &str,
    features: ShellFeatures,
) -> Option<(CommandBuilder, Initialization)> {
    use crate::domain::shell_integration::RemoteShell;
    let name = std::path::Path::new(executable).file_name()?.to_str()?;
    let shell = RemoteShell::parse_name(name)?;
    if !matches!(shell, RemoteShell::Bash | RemoteShell::Zsh) {
        return None;
    }
    let startup = ShellStartup::new();
    let mut command = CommandBuilder::new("/bin/sh");
    // Readiness is acknowledged before the parent writes any input, so the
    // bootstrap cannot be echoed by the PTY while stty is still starting.
    command.args([
        "-c",
        "stty -echo || exit; printf '%s' \"$2\"; exec \"$1\" -l",
        "qterm-shell",
        executable,
        startup.marker(),
    ]);
    Some((
        command,
        (shell.initialization_with_features(None, features), startup),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disabled_keeps_the_platform_default_without_input() {
        let (command, input) = command(ShellFeatures::coupled(false));
        assert!(command.is_default_prog());
        assert!(input.is_none());
    }
    #[test]
    fn login_shell_and_readiness_are_literal_arguments_and_unknown_shells_are_untouched() {
        let path = "/opt/a' $(touch nope)/bash";
        let (command, (input, startup)) =
            integrated_login(path, ShellFeatures::coupled(true)).unwrap();
        let args = command.get_argv();
        assert_eq!(args[4], path);
        assert_eq!(args[5], startup.marker());
        assert!(args[2].to_string_lossy().contains("exec \"$1\" -l"));
        assert!(input.contains("__qterm_commands_loaded"));
        assert!(integrated_login("/bin/zsh", ShellFeatures::coupled(true)).is_some());
        assert!(integrated_login("/bin/fish", ShellFeatures::coupled(true)).is_none());
        assert!(integrated_login("/bin/sh", ShellFeatures::coupled(true)).is_none());
    }
}
