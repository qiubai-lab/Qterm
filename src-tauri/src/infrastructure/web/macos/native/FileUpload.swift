import AppKit
import WebKit

// Owns one asynchronous native picker and completes WebKit's request exactly once.
final class BrowserFileUpload {
    private let makePanel: () -> NSOpenPanel
    private var panel: NSOpenPanel?
    private var completion: (([URL]?) -> Void)?

    init(makePanel: @escaping () -> NSOpenPanel = { NSOpenPanel() }) {
        self.makePanel = makePanel
    }

    func begin(window: NSWindow, parameters: WKOpenPanelParameters,
               completionHandler: @escaping ([URL]?) -> Void) {
        guard panel == nil, window.attachedSheet == nil else { completionHandler(nil); return }
        let picker = makePanel()
        picker.canChooseFiles = true
        picker.canChooseDirectories = parameters.allowsDirectories
        picker.allowsMultipleSelection = parameters.allowsMultipleSelection
        picker.canCreateDirectories = false
        panel = picker
        completion = completionHandler
        picker.beginSheetModal(for: window) { [weak self] response in
            guard let self = self, self.panel === picker else { return }
            self.finish(response == .OK ? picker.urls : nil)
        }
    }

    private func finish(_ urls: [URL]?) {
        let reply = completion
        completion = nil
        panel = nil
        reply?(urls)
    }

    func cancel() {
        let picker = panel
        // Clear ownership before AppKit can invoke its dismissal callback.
        finish(nil)
        picker?.cancel(nil)
    }
}

@available(macOS 14.0, *)
extension BrowserGuest {
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard !closed, adopted, !surface.isHidden, !surface.inputBlocked,
              webView === web, let window = window else { completionHandler(nil); return }
        fileUpload.begin(window: window, parameters: parameters, completionHandler: completionHandler)
    }
}
