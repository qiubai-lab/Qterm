//! Runs the actual SSH-generated input with an available Bash interpreter.
use super::super::shell_integration::{RemoteShell, ShellFeatures};
use std::{
    io::Write,
    process::{Command, Stdio},
};

#[test]
fn generated_bash_input_preserves_hooks_and_emits_command_boundaries() {
    let executable = std::env::var("QTERM_TEST_BASH").unwrap_or_else(|_| "bash".into());
    if Command::new(&executable).arg("--version").output().is_err() {
        eprintln!("Bash unavailable; set QTERM_TEST_BASH to run live installer coverage");
        return;
    }
    for (osc7, osc133) in [(false, false), (true, false), (false, true), (true, true)] {
        for prompt in [
            "PROMPT_COMMAND='printf \"old:%s\\n\" \"$?\" # trailing comment'",
            "PROMPT_COMMAND=('printf \"old:%s\\n\" \"$?\"' 'printf array-hook')",
        ] {
            let initialization = RemoteShell::Bash
                .initialization_with_features(None, ShellFeatures { osc7, osc133 });
            assert!(initialization.len() < 4096, "PTY canonical input limit");
            let mut child = Command::new(&executable)
                .args(["--noprofile", "--norc", "-i"])
                .env("HISTFILE", "/dev/null")
                .env("TERM", "xterm-256color")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let input = format!(
                "PS1='original> '; {prompt}\n{}\nprintf 'first-output\\n'; false\n{}\nprintf 'second-output\\n'\nexit 0\n",
                initialization.trim_end_matches('\r'),
                initialization.trim_end_matches('\r')
            );
            child
                .stdin
                .take()
                .unwrap()
                .write_all(input.as_bytes())
                .unwrap();
            let output = child.wait_with_output().unwrap();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            assert!(output.status.success(), "{stderr}");
            assert_eq!(stdout.contains("\x1b]7;file://"), osc7, "{stdout}");
            assert_eq!(stderr.contains("\x1b]133;A"), osc133, "{stderr}");
            if osc133 {
                assert!(
                    stdout.contains("first-output\n\x1b]133;D;1\x07old:1"),
                    "{stdout}"
                );
                assert!(
                    stderr.contains("\x1b]133;A\x07original> \x1b]133;B\x07"),
                    "{stderr}"
                );
                assert_eq!(stderr.matches("\x1b]133;C\x07").count(), 4, "{stderr}");
            }
            if prompt.contains("array-hook") {
                assert!(stdout.contains("array-hook"));
            }
        }
    }
}
