use tauri::Runtime;
use tauri_plugin_dialog::{FileDialogBuilder, FilePath};
use tokio::sync::oneshot;

pub async fn pick_file<R: Runtime>(dialog: FileDialogBuilder<R>) -> Option<FilePath> {
    wait_for_result(move |complete| dialog.pick_file(complete)).await
}

pub async fn pick_folder<R: Runtime>(dialog: FileDialogBuilder<R>) -> Option<FilePath> {
    wait_for_result(move |complete| dialog.pick_folder(complete)).await
}

pub async fn save_file<R: Runtime>(dialog: FileDialogBuilder<R>) -> Option<FilePath> {
    wait_for_result(move |complete| dialog.save_file(complete)).await
}

async fn wait_for_result<T, F>(show: F) -> T
where
    T: Default + Send + 'static,
    F: FnOnce(Box<dyn FnOnce(T) + Send>),
{
    let (sender, receiver) = oneshot::channel();
    show(Box::new(move |result| {
        let _ = sender.send(result);
    }));
    receiver.await.unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    #[test]
    fn command_modules_do_not_use_blocking_native_file_dialogs() {
        let commands = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/commands");
        let forbidden = [
            ["blocking", "pick"].join("_"),
            ["blocking", "save"].join("_"),
        ];

        for entry in fs::read_dir(commands).expect("commands directory") {
            let path = entry.expect("command module").path();
            if path.extension().and_then(|value| value.to_str()) != Some("rs") {
                continue;
            }
            let source = fs::read_to_string(&path).expect("command source");
            for pattern in &forbidden {
                assert!(
                    !source.contains(pattern),
                    "{} must use commands::native_dialog instead of {pattern}",
                    path.display()
                );
            }
        }
    }
}
