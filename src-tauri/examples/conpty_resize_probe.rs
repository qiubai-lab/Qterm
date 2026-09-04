//! JSON-lines bridge for exercising real local PTY resize output with xterm.
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde_json::json;
use std::io::{BufRead, Read, Write};

fn main() {
    #[cfg(windows)]
    println!(
        "{}",
        json!({"buildNumber": windows_version::OsVersion::current().build})
    );
    let size = |cols, rows| PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = native_pty_system().openpty(size(80, 24)).unwrap();
    let mut command = CommandBuilder::new("cmd.exe");
    command.arg("/d");
    command.env("TERM", "xterm-256color");
    command.env("PROMPT", "$E]7;file://localhost/$P$E\\$P$G");
    let mut child = pair.slave.spawn_command(command).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
    std::thread::spawn(move || {
        let mut bytes = [0; 8192];
        while let Ok(count) = reader.read(&mut bytes) {
            if count == 0 {
                break;
            }
            println!("{}", json!({"data": &bytes[..count]}));
        }
    });
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let message: serde_json::Value = serde_json::from_str(&line).unwrap();
        if let Some(data) = message["write"].as_str() {
            writer.write_all(data.as_bytes()).unwrap();
            writer.flush().unwrap();
        } else if let Some(cols) = message["cols"].as_u64() {
            pair.master
                .resize(size(cols as u16, message["rows"].as_u64().unwrap() as u16))
                .unwrap();
            println!("{}", json!({"ack": message["id"]}));
        } else {
            break;
        }
    }
    child.kill().unwrap();
    let _ = child.wait();
}
