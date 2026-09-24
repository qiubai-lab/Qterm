//! Run with QTERM_TEST_BASH=/path/to/bash cargo test history_free_live -- --ignored.
//! Uses an isolated HOME and a real PTY, never the account's history or rc files.
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

#[test]
#[ignore = "requires a real Bash executable; set QTERM_TEST_BASH (Git Bash is supported for this test)"]
fn history_free_live_pty_preserves_history_for_exit_and_disconnect() {
    let bash = std::env::var("QTERM_TEST_BASH").expect("set QTERM_TEST_BASH");
    for osc in [false, true] {
        for disconnect in [false, true] {
            let home = tempfile::tempdir().unwrap();
            let history = home.path().join(".bash_history");
            std::fs::write(&history, "existing-history-sentinel\n").unwrap();
            std::fs::write(
                home.path().join(".bashrc"),
                "echo RC_LOADED; history -s forbidden; history -a\n",
            )
            .unwrap();
            let cwd = home.path().join("quoted ' $() directory");
            std::fs::create_dir(&cwd).unwrap();
            let directory = InitialDirectory::new(shell_path(&cwd)).unwrap();
            let marker = "__QTERM_TEST_READY__";
            let pair = native_pty_system()
                .openpty(PtySize {
                    rows: 30,
                    cols: 240,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .unwrap();
            let mut command = CommandBuilder::new(&bash);
            // Exercise the complete remote command including nested quoting and env.
            command.args(["--noprofile", "--norc", "-c"]);
            command.arg(remote_command(osc, Some(&directory), marker));
            command.env("HOME", shell_path(home.path()));
            let mut paths = vec![Path::new(&bash).parent().unwrap().to_path_buf()];
            paths.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap()));
            command.env("PATH", std::env::join_paths(paths).unwrap());
            command.env("TERM", "xterm-256color");
            let mut child = pair.slave.spawn_command(command).unwrap();
            drop(pair.slave);
            let mut writer = pair.master.take_writer().unwrap();
            let mut reader = pair.master.try_clone_reader().unwrap();
            let (tx, rx) = mpsc::channel();
            thread::spawn(move || {
                let mut buf = [0; 8192];
                while let Ok(n) = reader.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            });
            let mut output = Vec::new();
            while !String::from_utf8_lossy(&output).contains(marker) {
                match rx.recv_timeout(Duration::from_secs(10)) {
                    Ok(data) => {
                        if data.windows(4).any(|w| w == b"\x1b[6n") {
                            writer.write_all(b"\x1b[1;1R").unwrap();
                            writer.flush().unwrap();
                        }
                        output.extend(data);
                    }
                    Err(error) => {
                        let _ = child.kill();
                        panic!("startup: {error}; {}", String::from_utf8_lossy(&output));
                    }
                }
            }
            assert!(!String::from_utf8_lossy(&output).contains("RC_LOADED"));
            // Disable terminal echo so assertions inspect actual output, not input text.
            writer.write_all(b"stty -echo\r").unwrap();
            writer.write_all(b"echo ordinary-command\rfor item in one two; do\recho $item\rdone\rbuiltin printf 'HISTORY_BEGIN\\n'; builtin history; builtin printf 'HISTORY_END\\n'; builtin pwd; builtin printf 'CHECK_%s\\n' DONE\r").unwrap();
            writer.flush().unwrap();
            loop {
                match rx.recv_timeout(Duration::from_secs(10)) {
                    Ok(data) => output.extend(data),
                    Err(error) => {
                        let _ = child.kill();
                        panic!("commands: {error}; {}", String::from_utf8_lossy(&output));
                    }
                }
                if String::from_utf8_lossy(&output).contains("CHECK_DONE") {
                    break;
                }
            }
            let text = String::from_utf8_lossy(&output).replace('\r', "");
            assert!(text.contains("HISTORY_BEGIN\nHISTORY_END"), "{text}");
            assert!(text.contains("quoted ' $() directory"), "{text}");
            assert_eq!(text.contains("\x1b]7;file://"), osc);
            if disconnect {
                child.kill().unwrap();
            } else {
                writer.write_all(b"exit\r").unwrap();
            }
            child.wait().unwrap();
            assert_eq!(
                std::fs::read_to_string(&history).unwrap(),
                "existing-history-sentinel\n"
            );
        }
    }
}
