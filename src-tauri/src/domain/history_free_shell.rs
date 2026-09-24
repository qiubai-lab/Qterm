//! Startup policy for an isolated Bash, never submitted as interactive input.
use super::session::InitialDirectory;

pub const BASH_ARGUMENTS: &[&str] = &["--noprofile", "--norc", "+o", "history", "-i"];
pub const SESSION_NOTICE: &str = "[Qterm] History-free Bash (experimental): command history disabled; user shell configuration skipped.\r\n";

pub fn environment(
    osc7: bool,
    directory: Option<&InitialDirectory>,
    ready_marker: &str,
) -> Vec<(&'static str, String)> {
    let hook = if osc7 {
        r#"builtin printf '\033]7;file://%s%s\007' "${HOSTNAME:-localhost}" "$PWD""#
    } else {
        ":"
    };
    let cd = directory.map_or_else(String::new, |directory| {
        format!(
            "builtin cd -- {} 2>/dev/null || true; ",
            quote(directory.as_str())
        )
    });
    // An echoed exec request must not impersonate a successfully initialized shell.
    let encoded_marker: String = ready_marker
        .bytes()
        .map(|byte| format!("\\{byte:03o}"))
        .collect();
    let prompt = format!(
        "builtin set +o history; HISTFILE=/dev/null; HISTSIZE=0; HISTFILESIZE=0; builtin readonly HISTFILE HISTSIZE HISTFILESIZE; {cd}PROMPT_COMMAND={}; {hook}; builtin printf '%b' {}; builtin printf '%s' {}",
        quote(hook),
        quote(&encoded_marker),
        quote(SESSION_NOTICE),
    );
    vec![
        ("HISTFILE", "/dev/null".into()),
        ("HISTSIZE", "0".into()),
        ("HISTFILESIZE", "0".into()),
        ("PROMPT_COMMAND", prompt),
        ("PS1", r"\u@\h:\w\$ ".into()),
    ]
}

pub fn remote_command(osc7: bool, directory: Option<&InitialDirectory>, marker: &str) -> String {
    let variables = environment(osc7, directory, marker)
        .into_iter()
        .map(|(key, value)| quote(&format!("{key}={value}")))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "exec env -u BASH_ENV -u ENV -u SHELLOPTS -u BASHOPTS {variables} bash {}",
        BASH_ARGUMENTS.join(" ")
    )
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
    fn starts_without_history_and_without_interactive_injection() {
        let command = remote_command(true, None, "ready");
        assert!(command.starts_with("exec env "));
        assert!(command.ends_with("bash --noprofile --norc +o history -i"));
        assert!(command.contains("HISTFILE=/dev/null"));
        assert!(!command.contains("history -d"));
        assert!(!command.contains("history -c"));
    }

    #[test]
    fn osc_and_directory_are_independent_and_paths_are_quoted() {
        let directory = InitialDirectory::new("/tmp/a'$(touch nope)\nfolder".into()).unwrap();
        let env = environment(false, Some(&directory), "ready");
        let prompt = &env
            .iter()
            .find(|(key, _)| *key == "PROMPT_COMMAND")
            .unwrap()
            .1;
        assert!(prompt.contains("builtin cd -- '/tmp/a'\\''$(touch nope)\nfolder'"));
        assert!(!prompt.contains("file://"));
        assert!(prompt.contains("builtin readonly HISTFILE HISTSIZE HISTFILESIZE"));
    }
}
