use serde::Deserialize;
use std::{io::BufRead, path::PathBuf};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Command {
    Open {
        id: String,
        profile: String,
        port: u16,
        path: String,
    },
    Eval {
        id: String,
        tag: String,
        script: String,
    },
    Close {
        id: String,
    },
    Quit,
}

// Local parent-process controller. Guest pages get no native command API.
pub fn start(app: tauri::AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let result = line.map_err(|e| e.to_string()).and_then(|line| {
                let command: Command = serde_json::from_str(&line).map_err(|e| e.to_string())?;
                match command {
                    Command::Open { id, profile, port, path } => {
                        crate::browser::open(&app, &root, &id, &profile, port, &path)
                    }
                    Command::Eval { id, tag, script } => {
                        let window = app.get_webview_window(&id).ok_or("unknown window")?;
                        let tag = serde_json::to_string(&tag).unwrap();
                        window.eval(format!(
                            "(async()=>{{try{{const value=await(async()=>{{{script}}})();console.log('PROBE_RESULT '+JSON.stringify({{tag:{tag},value}}));}}catch(e){{console.log('PROBE_RESULT '+JSON.stringify({{tag:{tag},error:String(e)}}));}}}})()"
                        )).map_err(|e| e.to_string())
                    }
                    Command::Close { id } => {
                        app.get_webview_window(&id).ok_or("unknown window")?.destroy().map_err(|e| e.to_string())?;
                        crate::report::emit(serde_json::json!({"event":"closed","id":id}));
                        Ok(())
                    }
                    Command::Quit => { app.exit(0); Ok(()) }
                }
            });
            if let Err(error) = result {
                crate::report::emit(serde_json::json!({"event":"error","error":error}));
            }
        }
    });
}
