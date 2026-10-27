//! cargo run --example macos_web_edit
//! Real Tauri menu + production Swift guest; no profiles, SSH or remote pages.
#[cfg(target_os = "macos")]
#[path = "support/web_edit_fixture.rs"]
mod fixture;
#[cfg(target_os = "macos")]
#[path = "../src/infrastructure/macos_menu.rs"]
mod macos_menu;
#[cfg(target_os = "macos")]
#[path = "support/terminal_edit_checks.rs"]
mod terminal_edit_checks;
#[cfg(not(target_os = "macos"))]
fn main() {}

#[cfg(target_os = "macos")]
fn main() {
    use fixture::{CMD, CTRL, Clipboard, Fixture, SHIFT};
    use serde_json::json;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    use tauri::Listener;
    let clipboard = Clipboard::save();
    let mut f = Fixture::new();
    f.eval("document.body.innerHTML='<input id=i value=input spellcheck=false autocorrect=off><textarea id=t spellcheck=false autocorrect=off>seed</textarea><div id=e contenteditable=true spellcheck=false autocorrect=off>editable text</div><iframe id=childFrame></iframe>';window.keys=[];addEventListener('keydown',e=>{keys.push(e.key);if(e.metaKey&&e.key==='k')e.preventDefault()});true");
    f.pump(200);
    for element in ["i", "t"] {
        f.eval(&format!(
            "{element}.focus();{element}.setSelectionRange(0,0);true"
        ));
        f.key("a", 0, CMD);
        f.assert_js(&format!("{element}.selectionEnd === {element}.value.length && {element}.selectionStart === 0"), json!(true), &format!("Cmd+A in {element}"));
    }
    f.key("c", 8, CMD);
    f.assert_clipboard(&clipboard, "seed", "Cmd+C copies selection");
    f.key("x", 7, CMD);
    f.assert_js("t.value", json!(""), "Cmd+X cuts selection");
    f.key("v", 9, CMD);
    f.assert_js("t.value", json!("seed"), "Cmd+V pastes text");
    f.key("z", 6, CMD);
    f.assert_js("t.value", json!(""), "Cmd+Z undoes paste");
    f.key("z", 6, CMD | SHIFT);
    f.assert_js("t.value", json!("seed"), "Cmd+Shift+Z redoes paste");
    clipboard.set_text("中文 🙂\nsecond line");
    f.key("a", 0, CMD);
    f.key("v", 9, CMD);
    assert_eq!(
        f.eval("t.value"),
        "中文 🙂\nsecond line",
        "Unicode/multiline native paste"
    );
    println!("PASS: input/textarea select, copy, cut, paste, undo, redo and Unicode");

    f.eval("e.focus();getSelection().collapse(e.firstChild,0);true");
    f.key("a", 0, CMD);
    f.key("c", 8, CMD);
    f.assert_clipboard(
        &clipboard,
        "editable text",
        "contenteditable selection/copy",
    );
    f.eval("childFrame.contentDocument.body.innerHTML='<input id=n value=iframe>';childFrame.contentDocument.getElementById('n').focus();true");
    f.key("a", 0, CMD);
    f.key("c", 8, CMD);
    f.assert_clipboard(&clipboard, "iframe", "focused iframe selection/copy");
    println!("PASS: contenteditable and iframe edits target the focused document");

    f.eval("t.focus();t.setSelectionRange(0,0);keys=[];true");
    f.key("k", 40, CMD);
    assert_eq!(
        f.eval("keys.includes('k')"),
        true,
        "unrelated Command shortcuts reach page"
    );
    f.key("b", 11, 0);
    assert!(
        f.eval("t.value.startsWith('b')").as_bool().unwrap(),
        "ordinary typing survives"
    );

    let closes = Arc::new(AtomicUsize::new(0));
    let received = closes.clone();
    f.app.listen_any("qterm-close-block", move |_| {
        received.fetch_add(1, Ordering::SeqCst);
    });
    f.key("w", 13, CMD);
    assert_eq!(
        closes.load(Ordering::SeqCst),
        1,
        "Cmd+W still reaches its menu"
    );
    f.key("w", 13, CTRL);
    assert_eq!(
        fixture::tab_closes(),
        1,
        "Ctrl+W still reaches the guest close monitor"
    );
    println!("PASS: typing, page shortcuts and Command+W ownership");

    // A hidden or modal-blocked guest must not retain host editing commands.
    for bounds in [
        json!({"visible":false}),
        json!({"visible":true,"inputBlocked":true}),
    ] {
        f.command(json!({"op":"sync","id":"editing","bounds":bounds}));
        f.host_eval("document.body.innerHTML='<input id=h value=host>';h.focus();h.setSelectionRange(0,0);true");
        f.key("a", 0, CMD);
        assert_eq!(
            f.host_eval("h.selectionStart === 0 && h.selectionEnd === 4"),
            true,
            "host receives edit with guest hidden/blocked"
        );
    }
    f.command(json!({"op":"sync","id":"editing","bounds":{"x":10,"y":100,"width":800,"height":500,"visible":true}}));
    f.focus_guest();
    f.eval("t.focus();t.setSelectionRange(0,0);true");
    f.key("a", 0, CMD);
    assert_eq!(
        f.eval("t.selectionEnd === t.value.length"),
        true,
        "guest edits resume after unblocking"
    );
    println!("PASS: host focus isolation and restored guest editing");
    if let Ok(path) = std::env::var("QTERM_TERMINAL_EDIT_FIXTURE") {
        terminal_edit_checks::run(&mut f, &clipboard, &path);
    } else {
        println!(
            "SKIP: terminal checks; run node scripts/macos-web-smoke/native-edit.mjs for both suites"
        );
    }
}
