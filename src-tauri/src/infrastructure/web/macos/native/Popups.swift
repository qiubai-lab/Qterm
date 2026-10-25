import AppKit
import WebKit

@available(macOS 14.0, *)
struct PendingPopup {
    let source: String
    let guest: BrowserGuest
}

@available(macOS 14.0, *)
extension BrowserGuest {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let host = BrowserHost.shared
        let url = action.request.url?.absoluteString ?? "about:blank"
        guard !closed, adopted, allowed(url), let window = window,
              host.pending.count < 16, host.guests.count + host.pending.count < 99,
              host.pending.values.filter({ $0.source == id }).count < 4 else { return nil }
        // WebKit's javaScriptCanOpenWindowsAutomatically=false enforces user activation.
        // Return a hidden native child synchronously; React adopts it by opaque token.
        let token = UUID().uuidString
        let child = BrowserGuest(id: "pending-\(token)", config: configuration, window: window, appOrigin: appOrigin, store: store, remote: remote)
        child.adopted = false
        host.pending[token] = PendingPopup(source: id, guest: child)
        emit("web-popup", ["label": id, "requestId": token, "url": url])
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { host.reject(token) }
        return child.web
    }
    func webViewDidClose(_ webView: WKWebView) {
        if adopted { emit("web-window-close", id) }
        else {
            for (token, pending) in BrowserHost.shared.pending where pending.guest === self { BrowserHost.shared.reject(token) }
        }
    }
}

@available(macOS 14.0, *)
extension BrowserHost {
    func reject(_ token: String) { pending.removeValue(forKey: token)?.guest.dispose() }
    func cancelPopups(_ source: String) {
        for token in pending.keys.filter({ pending[$0]?.source == source }) { reject(token) }
    }
    func adopt(_ token: String, id: String) throws {
        guard guests[id] == nil, let item = pending.removeValue(forKey: token) else { throw BrowserError("新窗口请求已失效") }
        guard guests[item.source] != nil else { item.guest.dispose(); throw BrowserError("来源网页已关闭") }
        item.guest.id = id; item.guest.adopted = true; guests[id] = item.guest
        item.guest.publish(visited: item.guest.loadState == "loaded")
    }
}
