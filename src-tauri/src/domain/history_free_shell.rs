//! Bash history policy, applied after user rc initialization and before terminal input.
use super::session::InitialDirectory;

pub const SESSION_NOTICE: &str =
    "[Qterm] Bash command history recording disabled; user shell configuration loaded.\r\n";
const HISTORY_WARNING: &str =
    "[Qterm] Warning: could not redirect HISTFILE; history suppression is incomplete.\r\n";

/// The outer non-interactive Bash only supplies an in-memory rc file. The inner
/// interactive, non-login Bash retains its normal system rc and sources ~/.bashrc.
/// Neither initialization nor OSC hooks are submitted through terminal input.
pub fn bootstrap(osc7: bool, directory: Option<&InitialDirectory>, marker: &str) -> String {
    format!(
        "exec \"$BASH\" --rcfile <(builtin printf '%s' {}) +o history -i",
        quote(&startup_script(osc7, directory, marker))
    )
}

pub fn remote_command(osc7: bool, directory: Option<&InitialDirectory>, marker: &str) -> String {
    format!(
        "exec bash -c {}",
        quote(&bootstrap(osc7, directory, marker))
    )
}

fn startup_script(osc7: bool, directory: Option<&InitialDirectory>, marker: &str) -> String {
    // Read prior history before redirecting the default file, without clearing it.
    // No readonly variables: users can source their configuration again normally.
    let mut script = format!(
        r#"if [[ -r "$HOME/.bashrc" ]]; then builtin source "$HOME/.bashrc"; fi
builtin set +o history
builtin history -r "${{HISTFILE-$HOME/.bash_history}}" 2>/dev/null || true
if [[ $(builtin declare -p HISTFILE 2>/dev/null) =~ ^declare[[:space:]]+-[^[:space:]]*r ]]; then
    builtin printf '%s' {}
else
    HISTFILE=/dev/null
    builtin printf '%s' {}
fi
"#,
        quote(HISTORY_WARNING),
        quote(SESSION_NOTICE),
    );
    if let Some(directory) = directory {
        script.push_str(&format!(
            "builtin cd -- {} 2>/dev/null || true\n",
            quote(directory.as_str())
        ));
    }
    if osc7 {
        // Appending to the last existing entry preserves both scalar and array
        // PROMPT_COMMAND, including older Bash versions that only execute [0].
        // A newline also keeps a trailing user comment from swallowing our hook.
        script.push_str(
            r#"_qterm_prompt_index=0
if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    for _qterm_prompt_index in "${!PROMPT_COMMAND[@]}"; do :; done
fi
if [[ ! $(builtin declare -p PROMPT_COMMAND 2>/dev/null) =~ ^declare[[:space:]]+-[^[:space:]]*r ]]; then
    PROMPT_COMMAND[${_qterm_prompt_index}]="${PROMPT_COMMAND[${_qterm_prompt_index}]-}"$'\n''builtin printf '\''\033]7;file://%s%s\007'\'' "${HOSTNAME:-localhost}" "$PWD"'
else
    builtin printf '%s\n' '[Qterm] Warning: PROMPT_COMMAND is readonly; OSC 7 hook was not installed.'
fi
builtin unset _qterm_prompt_index
"#,
        );
    }
    // An echoed exec request must not impersonate an initialized shell.
    let encoded_marker: String = marker.bytes().map(|byte| format!("\\{byte:03o}")).collect();
    script.push_str(&format!("builtin printf '%b' {}\n", quote(&encoded_marker)));
    script
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
#[path = "history_free_shell_live_tests.rs"]
mod live_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configures_history_after_user_rc_without_clearing_or_locking_variables() {
        let script = startup_script(false, None, "ready");
        assert!(script.find("builtin source").unwrap() < script.find("set +o history").unwrap());
        assert!(script.contains("HISTFILE=/dev/null"));
        assert!(!script.contains("HISTSIZE="));
        assert!(!script.contains("history -c"));
        assert!(!script.contains("builtin readonly"));
        assert!(!remote_command(false, None, "ready").contains("--norc"));
    }

    #[test]
    fn osc_and_directory_are_independent_and_paths_are_quoted() {
        let directory = InitialDirectory::new("/tmp/a'$(touch nope)\nfolder".into()).unwrap();
        let script = startup_script(false, Some(&directory), "ready");
        assert!(script.contains("builtin cd -- '/tmp/a'\\''$(touch nope)\nfolder'"));
        assert!(!script.contains("file://"));
        assert!(!script.contains("PROMPT_COMMAND"));
        assert!(startup_script(true, None, "ready").contains("file://"));
    }
}
