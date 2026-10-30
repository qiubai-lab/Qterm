//! Native macOS shortcuts. Closing a block is a frontend use case, not a window close.
use tauri::{
    AppHandle, Emitter, EventTarget, Manager, Runtime,
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem as Item, Submenu},
};

const CLOSE_BLOCK: &str = "qterm-close-block";
const CLOSE_EVENT: &str = "qterm-close-block";
const SELECT_ALL: &str = "qterm-select-all";

#[path = "macos_menu/select_all.rs"]
mod select_all;

pub(crate) fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let package = app.package_info();
    let config = app.config();
    let about = AboutMetadata {
        name: Some(package.name.clone()),
        version: Some(package.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                package.name.clone(),
                true,
                &[
                    &Item::about(app, None, Some(about))?,
                    &Item::separator(app)?,
                    &Item::services(app, None)?,
                    &Item::separator(app)?,
                    &Item::hide(app, None)?,
                    &Item::hide_others(app, None)?,
                    &Item::separator(app)?,
                    &Item::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[&MenuItem::with_id(
                    app,
                    CLOSE_BLOCK,
                    "关闭当前 Block",
                    true,
                    Some("Cmd+W"),
                )?],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &Item::undo(app, None)?,
                    &Item::redo(app, None)?,
                    &Item::separator(app)?,
                    &Item::cut(app, None)?,
                    &Item::copy(app, None)?,
                    &Item::paste(app, None)?,
                    &MenuItem::with_id(app, SELECT_ALL, "Select All", true, Some("Cmd+A"))?,
                ],
            )?,
            &Submenu::with_items(app, "View", true, &[&Item::fullscreen(app, None)?])?,
            &Submenu::with_id_and_items(
                app,
                tauri::menu::WINDOW_SUBMENU_ID,
                "Window",
                true,
                &[&Item::minimize(app, None)?, &Item::maximize(app, None)?],
            )?,
            &Submenu::with_id_and_items(app, tauri::menu::HELP_SUBMENU_ID, "Help", true, &[])?,
        ],
    )
}

pub(crate) fn handle(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == SELECT_ALL {
        select_all::dispatch(app);
        return;
    }
    if event.id().as_ref() != CLOSE_BLOCK || is_repeated_key_event() {
        return;
    }
    if let Some(window) = app.get_window("main")
        && window.is_focused().unwrap_or(false)
        && let Err(error) = app.emit_to(EventTarget::window("main"), CLOSE_EVENT, ())
    {
        eprintln!("Could not deliver block close shortcut: {error}");
    }
}

fn is_repeated_key_event() -> bool {
    use objc2::{class, msg_send, runtime::AnyObject};
    // SAFETY: Tauri dispatches menu events on the AppKit thread. Only inspect
    // the current NSEvent; mouse/menu actions and synthetic commands may have none.
    unsafe {
        let application: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let event: *mut AnyObject = msg_send![application, currentEvent];
        if event.is_null() {
            return false;
        }
        let event_type: usize = msg_send![event, type];
        event_type == 10 && msg_send![event, isARepeat]
    }
}
