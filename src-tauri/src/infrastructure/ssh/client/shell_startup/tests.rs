use super::*;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tempfile::tempdir;

fn bash() -> PathBuf {
    if let Some(path) = std::env::var_os("QTERM_TEST_BASH") {
        return path.into();
    }
    if cfg!(windows) {
        let output = Command::new("git")
            .arg("--exec-path")
            .output()
            .expect("Git for Windows or QTERM_TEST_BASH");
        let path = PathBuf::from(String::from_utf8(output.stdout).unwrap().trim());
        for parent in path.ancestors() {
            let candidate = parent.join("bin/bash.exe");
            if candidate.is_file() {
                return candidate;
            }
        }
        panic!("Set QTERM_TEST_BASH to bash.exe");
    }
    PathBuf::from("/bin/bash")
}

fn run_bash(profile: &str, input: &str, directory: Option<&InitialDirectory>) -> (String, String) {
    let home = tempdir().unwrap();
    fs::write(
        home.path().join(".bash_profile"),
        format!("PS1='QTERM_PROMPT> '\nHISTFILE=\"$HOME/history\"\n{profile}\n"),
    )
    .unwrap();
    fs::write(home.path().join("history"), "echo previous-user-command\n").unwrap();
    let mut child = Command::new(bash())
        .args([
            "--noprofile",
            "--norc",
            "-c",
            &command(RemoteShell::Bash, directory),
        ])
        .env("HOME", home.path())
        .env("SHELL", "/bin/bash")
        .env("TERM", "xterm-256color")
        .env_remove("ENV")
        .env_remove("HISTFILE")
        .env_remove("BASH_ENV")
        .env_remove("PROMPT_COMMAND")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while child.try_wait().unwrap().is_none() {
        if Instant::now() > deadline {
            child.kill().unwrap();
            panic!("Bash startup timed out");
        }
        thread::sleep(Duration::from_millis(20));
    }
    let output = child.wait_with_output().unwrap();
    let output = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let history = fs::read_to_string(home.path().join("history")).unwrap();
    (output, history)
}

#[test]
fn bash_startup_preserves_history_and_login_without_an_initial_input() {
    let (output, history) = run_bash(
        "HISTCONTROL=\nHISTIGNORE=\nprintf 'PROFILE_LOADED\\n'\n",
        "echo USER_COMMAND\nhistory\nshopt login_shell\nset -o | command grep posix\nexit\n",
        None,
    );
    assert!(output.contains("PROFILE_LOADED"), "{output}");
    assert_eq!(output.matches("PROFILE_LOADED").count(), 1, "{output}");
    assert!(output.contains("\u{1b}]7;file://"), "{output}");
    assert!(output.contains("login_shell    \ton"), "{output}");
    assert!(output.contains("posix          \toff"), "{output}");
    assert!(history.contains("echo previous-user-command"), "{history}");
    assert!(history.contains("echo USER_COMMAND"), "{history}");
    assert!(
        !history.contains("qterm") && !history.contains("QTERM"),
        "{history}"
    );
    assert!(
        !history.contains("stty") && !history.contains("exec /bin"),
        "{history}"
    );
    assert_eq!(output.matches("QTERM_PROMPT>").count(), 5, "{output}");
}

#[test]
fn bash_keeps_array_and_string_prompt_commands_and_exit_status() {
    for profile in [
        "PROMPT_COMMAND='printf \"OLD_STATUS:%s\\n\" \"$?\"'",
        "PROMPT_COMMAND=('printf \"OLD_STATUS:%s\\n\" \"$?\"' 'printf \"SECOND_HOOK\\n\"')",
    ] {
        let (output, _) = run_bash(profile, "false\nexit\n", None);
        assert!(output.contains("OLD_STATUS:1"), "{output}");
        if profile.contains("SECOND_HOOK") {
            assert_eq!(output.matches("SECOND_HOOK").count(), 2, "{output}");
        }
    }
}

#[test]
fn bash_directory_is_literal_uri_encoded_and_missing_directory_is_nonfatal() {
    let root = tempdir().unwrap();
    let path = root.path().join("space ' ; $() % 中文");
    fs::create_dir(&path).unwrap();
    let directory = InitialDirectory::new(path.to_string_lossy().replace('\\', "/")).unwrap();
    let (output, _) = run_bash("", "printf 'CWD:%s\\n' \"$PWD\"\nexit\n", Some(&directory));
    assert!(
        output.contains("space%20%27%20%3B%20%24%28%29%20%25%20"),
        "{output}"
    );
    assert!(
        output.contains("CWD:") && output.contains("space ' ; $() % 中文"),
        "{output}"
    );
    let missing = InitialDirectory::new("/qterm-path-that-does-not-exist/a".into()).unwrap();
    let (output, _) = run_bash("", "echo STILL_INTERACTIVE\nexit\n", Some(&missing));
    assert!(output.contains("STILL_INTERACTIVE"), "{output}");
}

#[test]
fn startup_payloads_never_modify_history_or_terminal_echo() {
    for shell in [
        RemoteShell::Bash,
        RemoteShell::Zsh,
        RemoteShell::Fish,
        RemoteShell::PowerShell,
    ] {
        let payload = command(shell, None);
        assert!(!payload.contains("stty") && !payload.contains("history -"));
        assert!(!payload.ends_with('\r'));
    }
}

#[test]
fn startup_file_write_failure_falls_back_to_plain_login() {
    let root = tempdir().unwrap();
    let shell = root.path().join("bash");
    fs::write(&shell, "#!/bin/sh\nprintf 'PLAIN_LOGIN:%s\\n' \"$1\"\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&shell, fs::Permissions::from_mode(0o700)).unwrap();
    }
    // A missing parent makes the fixed startup-file write fail after mktemp.
    let payload = posix_bootstrap(
        RemoteShell::Bash,
        &[("missing/init", "unused".into())],
        "printf INTEGRATED",
    );
    let output = Command::new(bash())
        .args(["--noprofile", "--norc", "-c", &payload])
        .env("SHELL", shell.to_string_lossy().replace('\\', "/"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "PLAIN_LOGIN:-l"
    );
}

#[test]
fn bash_nounset_configuration_keeps_working() {
    let (output, _) = run_bash("set -u", "echo NOUNSET_OK\nexit\n", None);
    assert!(
        output.contains("NOUNSET_OK") && output.contains("\u{1b}]7;file://"),
        "{output}"
    );
    assert!(!output.contains("unbound variable"), "{output}");
}

#[cfg(windows)]
#[test]
fn powershell_hook_preserves_prompt_and_encodes_literal_directory() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("space ' ; $() % 中文");
    fs::create_dir(&path).unwrap();
    let initial = InitialDirectory::new(path.to_string_lossy().into_owned()).unwrap();
    let payload = command(RemoteShell::PowerShell, Some(&initial));
    let bytes = STANDARD
        .decode(payload.split_whitespace().last().unwrap())
        .unwrap();
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .collect();
    let script = String::from_utf16(&units).unwrap();
    let source = format!(
        "function global:prompt {{ 'ORIGINAL_PROMPT' }}\n{script}\n$global:LASTEXITCODE=37\nprompt\nWrite-Output ('EXIT_CODE:'+$global:LASTEXITCODE)\n"
    );
    let bytes: Vec<u8> = source.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let output = Command::new("pwsh")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &STANDARD.encode(bytes),
        ])
        .output()
        .expect("PowerShell 7 on PATH");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stdout);
    assert_eq!(text.matches("ORIGINAL_PROMPT").count(), 1, "{text}");
    assert!(text.contains("EXIT_CODE:37"), "{text}");
    assert!(
        text.contains("space%20%27%20%3B%20%24%28%29%20%25%20"),
        "{text}"
    );
}

#[test]
fn real_pty_reports_directory_before_first_prompt_without_writing_any_input() {
    use portable_pty::{CommandBuilder, PtySize, native_pty_system};
    use std::{io::Read, sync::mpsc};
    let home = tempdir().unwrap();
    fs::write(
        home.path().join(".bash_profile"),
        "PS1='QTERM_READY> '\nHISTFILE=\"$HOME/history\"\nHISTCONTROL=\n",
    )
    .unwrap();
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 24,
            cols: 160,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();
    let mut cmd = CommandBuilder::new(bash());
    cmd.args([
        "--noprofile",
        "--norc",
        "-c",
        &command(RemoteShell::Bash, None),
    ]);
    cmd.env("HOME", home.path());
    cmd.env("SHELL", "/bin/bash");
    cmd.env("TERM", "xterm-256color");
    cmd.env_remove("ENV");
    cmd.env_remove("HISTFILE");
    cmd.env_remove("BASH_ENV");
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = [0; 8192];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 || tx.send(buffer[..count].to_vec()).is_err() {
                break;
            }
        }
    });
    let mut output = String::new();
    let deadline = Instant::now() + Duration::from_secs(15);
    while !output.contains("QTERM_READY>") && Instant::now() < deadline {
        if let Ok(bytes) = rx.recv_timeout(Duration::from_millis(100)) {
            // ConPTY asks the terminal emulator for its cursor before launching.
            // This is a device reply, not an interactive shell command.
            if bytes.windows(4).any(|part| part == b"\x1b[6n") {
                writer.write_all(b"\x1b[1;1R").unwrap();
            }
            output.push_str(&String::from_utf8_lossy(&bytes));
        }
    }
    // Always release the process, including assertion failures.
    writer.write_all(b"exit\r").unwrap();
    let _ = child.kill();
    let _ = child.wait();
    assert!(output.contains("QTERM_READY>"), "{output}");
    assert!(
        output
            .find("\u{1b}]7;file://")
            .is_some_and(|index| index < output.find("QTERM_READY>").unwrap()),
        "{output}"
    );
    assert_eq!(output.matches("QTERM_READY>").count(), 1, "{output}");
    assert!(
        !output.contains("stty") && !output.contains("__qterm_osc7"),
        "{output}"
    );
}
