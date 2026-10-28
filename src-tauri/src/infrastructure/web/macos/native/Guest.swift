import AppKit
import WebKit

@available(macOS 14.0, *)
final class BrowserGuest: NSObject, WKNavigationDelegate, WKUIDelegate {
    // Desktop Edge compatibility identity; 156 is maintained independently of WebKit.
    // Keep this on the guest so normal tabs and native popup children agree.
    private static let edgeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0"
    var id: String
    let store: String
    let remote: Bool
    let appOrigin: String
    let web: WKWebView
    let surface: BrowserSurface
    weak var window: NSWindow?
    var closed = false
    var adopted = true
    var activeNavigation: WKNavigation?
    var source = "about:blank"
    var navigationAddress = "about:blank"
    var loadState = "idle"
    var navigationError: Error?
    var message = ""
    var closeShortcutMonitor: Any?
    var observations: [NSKeyValueObservation] = []
    var lastPalette = ""
    var navigationGuard = NavigationGuard()
    let fileUpload: BrowserFileUpload

    init(id: String, config: WKWebViewConfiguration, window: NSWindow, appOrigin: String, store: String, remote: Bool = false,
         fileUpload: BrowserFileUpload = BrowserFileUpload()) {
        self.id = id; self.store = store; self.remote = remote; self.appOrigin = appOrigin; self.window = window
        self.fileUpload = fileUpload
        web = BrowserWebView(frame: NSRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        surface = BrowserSurface(frame: web.frame)
        super.init()
        installBlockCloseShortcut()
        web.customUserAgent = Self.edgeUserAgent
        surface.owner = self; surface.addSubview(web); surface.isHidden = true
        window.contentView?.addSubview(surface, positioned: .above, relativeTo: nil)
        web.navigationDelegate = self; web.uiDelegate = self
        observations = [
            web.observe(\.url, options: [.new]) { [weak self] _, _ in self?.sourceChanged() },
            web.observe(\.title, options: [.new]) { [weak self] _, _ in self?.publish(visited: false, metadata: true) }
        ]
    }
    func allowed(_ address: String) -> Bool {
        if address == "about:blank" { return true }
        guard address.utf8.count <= 8192, let url = URL(string: address),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.user == nil, url.password == nil, let host = url.host else { return false }
        if host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".")).hasSuffix(".localhost") { return false }
        if let internalURL = URL(string: appOrigin), internalURL.scheme == url.scheme,
           internalURL.host == url.host, internalURL.port == url.port { return false }
        return true
    }
    func publish(visited: Bool, metadata: Bool = false) {
        let url = loadState == "loaded" ? (web.url?.absoluteString ?? navigationAddress) : navigationAddress
        guard adopted, !closed, allowed(url), url != "about:blank" else { return }
        if metadata && loadState != "loaded" { return }
        emit("web-page-state", ["label": id, "url": url, "title": loadState == "loaded" ? String((web.title ?? "").prefix(512)) : "",
             "loading": loadState == "loading", "visited": visited, "metadata": metadata, "loadState": loadState, "error": message])
    }
    func sourceChanged() {
        let next = web.url?.absoluteString ?? "about:blank"
        let visited = source != next && !web.isLoading && activeNavigation == nil && loadState == "loaded"
        source = next
        if visited { navigationAddress = next }
        publish(visited: visited)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard !closed, let url = action.request.url, allowed(url.absoluteString), !action.shouldPerformDownload else {
            decisionHandler(.cancel); return
        }
        if action.targetFrame?.isMainFrame == true {
            guard navigationGuard.allow(url) else {
                decisionHandler(.cancel)
                web.stopLoading(); activeNavigation = nil; loadState = "failed"
                message = "检测到网页循环跳转，已停止加载。请检查网站验证或登录状态，或手动重新访问。"
                publish(visited: false); return
            }
        }
        if remote {
            do {
                let mapped = try TunnelPolicy.address(url.absoluteString)
                if mapped != url.absoluteString {
                    decisionHandler(.cancel)
                    guard action.targetFrame?.isMainFrame == true, action.request.httpMethod == "GET" else {
                        message = "该请求无法保持原始语义，请使用隧道域名重新提交"; publish(visited: false); return
                    }
                    var request = action.request; request.url = URL(string: mapped); web.load(request); return
                }
            } catch { message = error.localizedDescription; decisionHandler(.cancel); publish(visited: false); return }
        }
        if action.targetFrame?.isMainFrame == true { navigationAddress = url.absoluteString }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        fileUpload.cancel()
        BrowserHost.shared.cancelPopups(id)
        message = ""; navigationError = nil; activeNavigation = navigation; loadState = "loading"; publish(visited: false)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard activeNavigation != nil, activeNavigation === navigation else { return }
        activeNavigation = nil; loadState = "loaded"; source = web.url?.absoluteString ?? "about:blank"
        if !lastPalette.isEmpty { web.evaluateJavaScript(lastPalette, completionHandler: nil) }
        publish(visited: true)
    }
    func failed(_ navigation: WKNavigation?, _ error: Error) {
        guard activeNavigation != nil, activeNavigation === navigation else { return }
        activeNavigation = nil; navigationError = error
        if (error as NSError).code != NSURLErrorCancelled {
            message = "网页加载失败（\((error as NSError).code)）：\(error.localizedDescription)"
        }
        loadState = (error as NSError).code == NSURLErrorCancelled ? "stopped" : "failed"
        publish(visited: false)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(navigation, error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(navigation, error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        fileUpload.cancel()
        activeNavigation = nil; loadState = "failed"; message = "网页进程已退出，请刷新后重试"; publish(visited: false)
    }
    func action(_ input: [String: Any]) throws {
        if ["navigate", "reload", "back", "forward"].contains(input["action"] as? String ?? "") { navigationGuard.reset() }
        switch input["action"] as? String {
        case "navigate":
            guard let address = input["url"] as? String, address != "about:blank", allowed(address), let url = URL(string: address) else { throw BrowserError("不支持的网页地址") }
            let destination = remote ? try TunnelPolicy.address(url.absoluteString) : url.absoluteString
            web.load(URLRequest(url: URL(string: destination)!))
        case "reload": web.reload()
        case "stop": web.stopLoading(); activeNavigation = nil; loadState = "stopped"; publish(visited: false)
        case "back": web.goBack()
        case "forward": web.goForward()
        default: throw BrowserError("未知网页操作")
        }
    }
    func evaluate(_ script: String, reply: Reply) {
        web.evaluateJavaScript(script) { result, error in
            if error != nil { reply.fail("网页脚本执行失败") } else { reply.send(result ?? NSNull()) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { reply.fail("网页脚本执行超时") }
    }
    func snapshot(_ reply: Reply) {
        let url = web.url?.absoluteString ?? ""
        guard web.bounds.width * web.bounds.height * pow(window?.backingScaleFactor ?? 1, 2) <= 16_777_216 else {
            reply.fail("网页预览尺寸过大"); return
        }
        web.takeSnapshot(with: nil) { [weak self] image, error in
            guard let self = self, !self.closed, self.web.url?.absoluteString == url,
                  let image = image, error == nil, let tiff = image.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]),
                  png.count <= 16 * 1024 * 1024 else { reply.fail("网页预览暂不可用"); return }
            reply.send(["url": url, "png": png.base64EncodedString()])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { reply.fail("网页预览超时") }
    }
    func dispose() {
        fileUpload.cancel()
        if let monitor = closeShortcutMonitor { NSEvent.removeMonitor(monitor); closeShortcutMonitor = nil }
        closed = true; observations.removeAll(); web.stopLoading()
        web.navigationDelegate = nil; web.uiDelegate = nil; surface.removeFromSuperview()
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { completionHandler() }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { completionHandler(false) }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { completionHandler(nil) }
}
