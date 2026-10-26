// Isolated native regression; compile with the production native/*.swift and
// WebKitPolicy.m bridge. Uses an ephemeral WKWebView and no user profiles.
import AppKit
import WebKit

var closeEvents: [String] = []
var tabCloseEvents: [String] = []

@main
struct BlockCloseProbe {
    static func main() {
        if #available(macOS 14.0, *) { run() }
        else { fatalError("Requires macOS 14+") }
    }

    @available(macOS 14.0, *)
    static func run() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 500, height: 300),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Qterm isolated web shortcut regression"
        window.isReleasedWhenClosed = false
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        let guest = BrowserGuest(id: "web-probe", config: config, window: window,
                                 appOrigin: "tauri://localhost", store: UUID().uuidString)
        guest.surface.frame = window.contentView!.bounds; guest.web.frame = guest.surface.bounds
        guest.surface.isHidden = false
        guest.web.loadHTMLString("<input autofocus autocorrect=off autocomplete=off spellcheck=false><p>Isolated shortcut fixture</p>", baseURL: nil)
        eventCallback = { name, data in
            if String(cString: name) == "qterm-close-block" { closeEvents.append(String(cString: data)) }
            if String(cString: name) == "qterm-close-web-tab" { tabCloseEvents.append(String(cString: data)) }
        }
        window.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
        pump(0.5)
        window.makeFirstResponder(guest.web)
        func key(_ repeatKey: Bool = false, _ flags: NSEvent.ModifierFlags = .control) {
            let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags,
                                        timestamp: ProcessInfo.processInfo.systemUptime,
                                        windowNumber: window.windowNumber, context: nil, characters: "w",
                                        charactersIgnoringModifiers: "w", isARepeat: repeatKey, keyCode: 13)!
            app.postEvent(event, atStart: false); pump(0.15)
            let released = NSEvent.keyEvent(with: .keyUp, location: .zero, modifierFlags: flags,
                                           timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: window.windowNumber, context: nil, characters: "w",
                                           charactersIgnoringModifiers: "w", isARepeat: false, keyCode: 13)!
            app.postEvent(released, atStart: false); pump(0.05)
        }
        key(); precondition(tabCloseEvents == ["\"web-probe\""] && closeEvents.isEmpty, "Ctrl+W closes a tab, not the block")
        key(false, .option)
        precondition(tabCloseEvents.count == 1 && closeEvents.isEmpty, "Option+W is no longer a close shortcut")
        key(true); key(false, [.control, .shift])
        precondition(tabCloseEvents.count == 1 && closeEvents.isEmpty, "repeat and exact-modifier protection")
        guest.surface.inputBlocked = true
        key(); precondition(tabCloseEvents.count == 1, "blocked surface cannot close")
        guest.surface.inputBlocked = false; guest.surface.isHidden = true
        key(); precondition(tabCloseEvents.count == 1, "hidden guest cannot close")
        guest.surface.isHidden = false; window.makeFirstResponder(guest.web)
        key(); precondition(tabCloseEvents.count == 2, "next press remains usable")
        guest.dispose(); precondition(guest.closeShortcutMonitor == nil, "monitor removed on disposal")
        key(); precondition(tabCloseEvents.count == 2 && closeEvents.isEmpty, "disposed guest cannot close")
        window.close()
        print("PASS: native guest Ctrl+W tab-only close, Option+W pass-through, repeat/modifier/blocked/hidden protection and teardown")
    }

    static func pump(_ seconds: TimeInterval) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if let event = NSApp.nextEvent(matching: .any, until: Date().addingTimeInterval(0.01), inMode: .default, dequeue: true) {
                NSApp.sendEvent(event)
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.005))
        }
    }
}
