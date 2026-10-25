import AppKit
import WebKit

// All native objects are confined to the Tauri/AppKit main thread. No page message handler exists.
typealias ReplyCallback = @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>) -> Void
typealias EventCallback = @convention(c) (UnsafePointer<CChar>, UnsafePointer<CChar>) -> Void
var eventCallback: EventCallback?

func jsonText(_ value: Any) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
          let text = String(data: data, encoding: .utf8) else { return "null" }
    return text
}
func emit(_ name: String, _ value: Any) {
    let text = jsonText(value)
    name.withCString { name in text.withCString { eventCallback?(name, $0) } }
}
final class Reply {
    private var callback: ReplyCallback?
    private let context: UnsafeMutableRawPointer?
    init(_ callback: @escaping ReplyCallback, _ context: UnsafeMutableRawPointer?) {
        self.callback = callback; self.context = context
    }
    func send(_ value: Any = NSNull()) { finish(["ok": value]) }
    func fail(_ message: String) { finish(["error": message]) }
    private func finish(_ value: Any) {
        guard let callback = callback else { return }
        self.callback = nil
        jsonText(value).withCString { callback(context, $0) }
    }
}

@_cdecl("qterm_web_supported")
func qtermWebSupported() -> Bool {
    if #available(macOS 14.0, *) { return true }
    return false
}

@_cdecl("qterm_web_remote_supported")
func qtermWebRemoteSupported() -> Bool {
    if #available(macOS 14.0, *) { return QtermPeerPolicyAvailable() }
    return false
}

@_cdecl("qterm_web_command")
func qtermWebCommand(_ text: UnsafePointer<CChar>, _ window: UnsafeMutableRawPointer?,
                     _ context: UnsafeMutableRawPointer?, _ callback: @escaping ReplyCallback,
                     _ event: @escaping EventCallback) {
    precondition(Thread.isMainThread)
    eventCallback = event
    let reply = Reply(callback, context)
    guard #available(macOS 14.0, *) else { reply.fail("内部浏览器需要 macOS 14 或更高版本"); return }
    guard let data = String(cString: text).data(using: .utf8),
          let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        reply.fail("无效的浏览器请求"); return
    }
    do {
        let nsWindow = window.map { Unmanaged<NSWindow>.fromOpaque($0).takeUnretainedValue() }
        try BrowserHost.shared.command(request, window: nsWindow, reply: reply)
    } catch { reply.fail(error.localizedDescription) }
}

struct BrowserError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

@available(macOS 14.0, *)
final class BrowserHost {
    static let shared = BrowserHost()
    var guests: [String: BrowserGuest] = [:]
    var stores: [String: WKWebsiteDataStore] = [:]
    var pending: [String: PendingPopup] = [:]

    func guest(_ id: String) throws -> BrowserGuest {
        guard let guest = guests[id] else { throw BrowserError("网页已关闭") }
        return guest
    }
    func command(_ input: [String: Any], window: NSWindow?, reply: Reply) throws {
        let id = input["id"] as? String ?? ""
        switch input["op"] as? String {
        case "open":
            guard let window = window else { throw BrowserError("主窗口不存在") }
            if let port = input["port"], !(port is NSNull) {
                TunnelPolicy.prepare { rules, error in
                    guard let rules = rules, error == nil else { reply.fail("无法启用隧道网络保护"); return }
                    do { try self.create(id, input: input, window: window, rules: rules); reply.send() }
                    catch { reply.fail(error.localizedDescription) }
                }
            } else { try create(id, input: input, window: window); reply.send() }
        case "close": close(id); reply.send()
        case "sync":
            let page = try guest(id)
            try page.sync(input["bounds"] as? [String: Any] ?? [:])
            if let script = input["scrollbarScript"] as? String, page.lastPalette != script {
                page.lastPalette = script; page.web.evaluateJavaScript(script, completionHandler: nil)
            }
            reply.send()
        case "action": try guest(id).action(input); reply.send()
        case "eval": try guest(id).evaluate(input["script"] as? String ?? "", reply: reply)
        case "snapshot": try guest(id).snapshot(reply)
        case "clear": try clear(input, reply: reply)
        case "popupSource":
            guard let pending = pending[input["request"] as? String ?? ""] else { throw BrowserError("新窗口请求已失效") }
            reply.send(pending.source)
        case "adopt": try adopt(input["request"] as? String ?? "", id: id); reply.send()
        case "reject": reject(input["request"] as? String ?? ""); reply.send()
        default: throw BrowserError("未知原生浏览器操作")
        }
    }
    func close(_ id: String) {
        cancelPopups(id)
        guard let guest = guests.removeValue(forKey: id) else { return }
        guest.dispose()
    }
}
