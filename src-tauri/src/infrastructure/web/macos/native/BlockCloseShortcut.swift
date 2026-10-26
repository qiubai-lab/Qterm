import AppKit
import WebKit

@available(macOS 14.0, *)
extension BrowserGuest {
    func installBlockCloseShortcut() {
        closeShortcutMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, !self.closed, self.adopted,
                  !self.surface.isHidden, !self.surface.inputBlocked,
                  let window = self.window, event.window === window,
                  let responder = window.firstResponder as? NSView,
                  responder === self.web || responder.isDescendant(of: self.web),
                  event.charactersIgnoringModifiers?.lowercased() == "w" else { return event }
            let modifiers = event.modifierFlags.intersection([.control, .command, .option, .shift])
            guard modifiers == .control else { return event }
            // Command+W remains owned by the app menu. Native Ctrl+W never
            // enters the page or carries IPC access into the guest.
            if !event.isARepeat { emit("qterm-close-web-tab", self.id) }
            return nil
        }
    }
}
