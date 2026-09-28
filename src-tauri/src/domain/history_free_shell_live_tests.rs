//! QTERM_TEST_BASH=/bin/bash cargo test history_free_live -- --ignored
//! All rc/history files and executables belong to a temporary HOME.
use super::*;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::{
    io::{Read, Write},
    path::Path,
    sync::mpsc,
    thread,
    time::Duration,
};

fn shell_path(path: &Path) -> String {
    let path = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) && path.as_bytes().get(1) == Some(&b':') {
        format!("/{}{path}", path[..1].to_lowercase(), path = &path[2..])
    } else {
        path
    }
}

struct Terminal {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    output: mpsc::Receiver<Vec<u8>>,
    // Keep the PTY alive until the child exits.
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

impl Terminal {
    fn start(home: &Path, osc: bool, remote: bool, cwd: &Path) -> Self {
        let bash = std::env::var("QTERM_TEST_BASH").expect("set QTERM_TEST_BASH");
        let directory = InitialDirectory::new(shell_path(cwd)).unwrap();
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 30,
                cols: 240,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut command = CommandBuilder::new(&bash);
        command.args(["--noprofile", "--norc", "-c"]);
        command.arg(if remote {
            remote_command(osc, Some(&directory), "__QTERM_TEST_READY__")
        } else {
            bootstrap(osc, None, "__QTERM_TEST_READY__")
        });
        command.cwd(cwd);
        command.env("HOME", shell_path(home));
        let mut paths = vec![Path::new(&bash).parent().unwrap().to_path_buf()];
        paths.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap()));
        command.env("PATH", std::env::join_paths(paths).unwrap());
        command.env("TERM", "xterm-256color");
        let child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let writer = pair.master.take_writer().unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let (tx, output) = mpsc::channel();
        thread::spawn(move || {
            let mut buf = [0; 8192];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 || tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            writer,
            output,
            _master: pair.master,
        }
    }

    fn send(&mut self, text: &str) {
        self.writer.write_all(text.as_bytes()).unwrap();
        self.writer.flush().unwrap();
    }

    fn until(&mut self, marker: &str) -> String {
        let mut output = Vec::new();
        loop {
            match self.output.recv_timeout(Duration::from_secs(10)) {
                Ok(data) => {
                    if data.windows(4).any(|w| w == b"\x1b[6n") {
                        self.send("\x1b[1;1R");
                    }
                    output.extend(data);
                    let text = String::from_utf8_lossy(&output).replace('\r', "");
                    if text.contains(marker) {
                        return text;
                    }
                }
                Err(error) => panic!("PTY: {error}; {}", String::from_utf8_lossy(&output)),
            }
        }
    }

    fn finish(&mut self, disconnect: bool) {
        if disconnect {
            self.child.kill().unwrap();
        } else {
            self.send("exit\r");
        }
        self.child.wait().unwrap();
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "requires Bash and a real PTY; set QTERM_TEST_BASH"]
fn history_free_live_preserves_environment_hooks_and_history() {
    for osc in [false, true] {
        for disconnect in [false, true] {
            for remote in [false, true] {
                let home = tempfile::tempdir().unwrap();
                let history = home.path().join(".bash_history");
                std::fs::write(&history, "existing-history-sentinel\n").unwrap();
                let bin = home.path().join("bin");
                std::fs::create_dir(&bin).unwrap();
                let executable = bin.join("qterm_codex_probe");
                std::fs::write(&executable, "#!/bin/sh\nprintf 'CODEX_AVAILABLE\\n'\n").unwrap();
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755))
                        .unwrap();
                }
                // Exercise both a scalar hook (with a trailing comment) and array hooks.
                let prompt = if remote {
                    "PROMPT_COMMAND=('printf USER_HOOK; history -a' 'printf ARRAY_HOOK')"
                } else {
                    "PROMPT_COMMAND='printf USER_HOOK; history -a # user comment'"
                };
                std::fs::write(home.path().join(".bashrc"), format!(
                    "echo RC_LOADED\nexport PATH=\"$HOME/bin:$PATH\"\nalias qterm_alias='echo ALIAS_OK'\nPS1=custom-prompt\nHISTSIZE=1234\nHISTFILESIZE=4321\n{prompt}\nset -o history\n"
                )).unwrap();
                let cwd = home.path().join("quoted ' $() directory");
                std::fs::create_dir(&cwd).unwrap();
                let mut terminal = Terminal::start(home.path(), osc, remote, &cwd);
                let startup = terminal.until("__QTERM_TEST_READY__");
                assert_eq!(startup.matches("RC_LOADED").count(), 1, "{startup}");
                assert!(startup.contains(SESSION_NOTICE.trim()), "{startup}");
                terminal.send("builtin printf 'FIRST_%s\\n' INPUT\rstty -echo\rqterm_codex_probe\rqterm_alias\recho ordinary-command\rfor item in one two; do\recho $item\rdone\r");
                terminal.send("builtin printf '\\nHISTORY_BEGIN\\n'; builtin history; builtin printf 'HISTORY_END\\n'; builtin pwd; builtin printf 'SIZES:%s:%s\\n' \"$HISTSIZE\" \"$HISTFILESIZE\"; HISTSIZE=2345; builtin printf 'CHECK_%s\\n' DONE\r");
                let output = terminal.until("CHECK_DONE");
                let recorded = output
                    .split("\nHISTORY_BEGIN\n")
                    .nth(1)
                    .unwrap()
                    .split("HISTORY_END")
                    .next()
                    .unwrap();
                assert!(recorded.contains("existing-history-sentinel"), "{output}");
                assert_eq!(
                    recorded.lines().count(),
                    1,
                    "unexpected command history: {recorded}"
                );
                for expected in [
                    "FIRST_INPUT",
                    "CODEX_AVAILABLE",
                    "ALIAS_OK",
                    "USER_HOOK",
                    "custom-prompt",
                    "SIZES:1234:4321",
                    "quoted ' $() directory",
                ] {
                    assert!(output.contains(expected), "missing {expected}: {output}");
                }
                assert!(!output.contains("readonly variable"), "{output}");
                // Bash < 5.1 only executes PROMPT_COMMAND[0]; still preserve the array.
                terminal.send("builtin printf 'ARRAY:%s\\n' \"${PROMPT_COMMAND[1]-}\"; builtin printf 'ARRAY_%s\\n' DONE\r");
                let array = terminal.until("ARRAY_DONE");
                if remote {
                    assert!(array.contains("printf ARRAY_HOOK"), "{array}");
                }
                assert_eq!((startup + &output + &array).contains("\x1b]7;file://"), osc);
                terminal.finish(disconnect);
                assert_eq!(
                    std::fs::read_to_string(&history).unwrap(),
                    "existing-history-sentinel\n"
                );
            }
        }
    }
}

#[test]
#[ignore = "requires Bash and a real PTY; set QTERM_TEST_BASH"]
fn history_free_live_warns_for_readonly_history_without_blocking_terminal() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(
        home.path().join(".bashrc"),
        "readonly HISTFILE=\"$HOME/.bash_history\"\nreadonly PROMPT_COMMAND='printf USER_HOOK'\n",
    )
    .unwrap();
    let mut terminal = Terminal::start(home.path(), true, true, home.path());
    let output = terminal.until("__QTERM_TEST_READY__");
    assert!(output.contains("could not redirect HISTFILE"), "{output}");
    assert!(output.contains("OSC 7 hook was not installed"), "{output}");
    assert!(!output.contains(SESSION_NOTICE.trim()), "{output}");
    terminal.send("builtin printf 'USABLE_%s\\n' YES\r");
    terminal.until("USABLE_YES");
    terminal.finish(false);
}
