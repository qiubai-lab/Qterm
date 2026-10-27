use super::fixture::{CMD, CTRL, Clipboard, Fixture, SHIFT};
use serde_json::json;

pub fn run(f: &mut Fixture, clipboard: &Clipboard, adapter_path: &str) {
    f.command(json!({"op":"sync","id":"editing","bounds":{"visible":false}}));
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let xterm =
        std::fs::read_to_string(root.join("node_modules/@xterm/xterm/lib/xterm.js")).unwrap();
    let adapter = std::fs::read_to_string(adapter_path).unwrap();
    f.host_eval(&format!(
        "window.eval({});window.eval({});true",
        json!(xterm),
        json!(adapter)
    ));
    f.host_eval("document.body.innerHTML='<div id=terminal></div><input id=normal value=ordinary>';window.term=new Terminal({cols:80,rows:24});term.open(document.getElementById('terminal'));window.data=[];window.requests=0;term.onData(d=>data.push(d));window.paste=async()=>{requests++};window.copy=async()=>{};term.attachCustomKeyEventHandler(e=>QtermClipboard.handleClipboardShortcut(e,'mac',term,true,copy,paste));window.unbind=QtermClipboard.bindTerminalClipboardEvents(term.element,true,paste,()=>term.selectAll());term.write('terminal output');term.focus();true");
    f.pump(300);
    for modifiers in [CMD, CMD | SHIFT] {
        clipboard.set_text("clipboard text");
        f.host_eval("requests=0;data=[];term.focus();true");
        f.key("v", 9, modifiers);
        assert_eq!(
            f.host_eval("({requests,data})"),
            json!({"requests":1,"data":[]}),
            "native text paste enters app once, with no xterm bypass"
        );
        clipboard.set_png();
        f.host_eval("requests=0;term.focus();true");
        f.key("v", 9, modifiers);
        assert_eq!(
            f.host_eval("({requests,data})"),
            json!({"requests":1,"data":[]}),
            "native image paste enters app once"
        );
    }
    f.key("a", 0, CMD);
    assert_eq!(
        f.host_eval("term.getSelection().trim()"),
        "terminal output",
        "Cmd+A selects xterm's virtual buffer"
    );
    f.key("c", 8, CMD);
    assert_eq!(
        clipboard.text().trim(),
        "terminal output",
        "Cmd+C uses native xterm copy"
    );
    f.host_eval("term.clearSelection();data=[];true");
    for (key, code) in [("c", 8), ("a", 0), ("z", 6)] {
        f.key(key, code, CTRL);
    }
    assert_eq!(
        f.host_eval("data"),
        json!(["\u{3}", "\u{1}", "\u{1a}"]),
        "terminal Ctrl+C/A/Z pass through"
    );
    println!("PASS: native Cmd+V/Cmd+Shift+V text and PNG entry, terminal Cmd+A/C and Ctrl+C/A/Z");

    f.host_eval("normal.focus();normal.setSelectionRange(0,0);true");
    f.key("a", 0, CMD);
    assert_eq!(
        f.host_eval("[normal.selectionStart,normal.selectionEnd]"),
        json!([0, 8]),
        "nonterminal select-all falls back to native responder"
    );
    clipboard.set_text("ordinary paste");
    f.key("v", 9, CMD);
    assert_eq!(
        f.host_eval("normal.value"),
        "ordinary paste",
        "input paste is not hijacked by terminal"
    );
    f.key("z", 6, CMD);
    assert_eq!(
        f.host_eval("normal.value"),
        "ordinary",
        "input undo remains native"
    );
    f.host_eval("unbind();window.unbind=QtermClipboard.bindTerminalClipboardEvents(term.element,false,paste,()=>term.selectAll());requests=0;data=[];term.focus();true");
    f.key("v", 9, CMD);
    assert_eq!(
        f.host_eval("({requests,data})"),
        json!({"requests":0,"data":[]}),
        "disabled terminal cannot bypass paste guard"
    );
    f.host_eval("unbind();term.dispose();true");
    println!("PASS: ordinary input select/paste/undo and disabled terminal paste isolation");
}
