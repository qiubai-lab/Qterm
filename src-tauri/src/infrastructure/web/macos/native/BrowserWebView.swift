import AppKit
import WebKit

final class BrowserWebView: WKWebView {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        // A child WKWebView consumes these equivalents without running the Edit
        // menu actions in a Tauri window. Let AppKit resolve them against the
        // current first responder, as Wry does for its own child webviews.
        // Keep other shortcuts on WebKit's path so page key handlers still run.
        let modifiers = event.modifierFlags.intersection([.command, .control, .option, .shift])
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
        // Cmd+W is also menu-owned (close Block), unlike the guest's Ctrl+W.
        if modifiers == .command && ["a", "c", "v", "x", "z", "w"].contains(key) {
            return false
        }
        if modifiers == [.command, .shift] && key == "z" { return false }
        return super.performKeyEquivalent(with: event)
    }
}
