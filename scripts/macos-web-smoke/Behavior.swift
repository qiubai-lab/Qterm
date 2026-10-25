import AppKit
import WebKit

private final class CompletionBox {
    let continuation: CheckedContinuation<Any, Error>
    init(_ continuation: CheckedContinuation<Any, Error>) { self.continuation = continuation }
}

private func commandReply(_ context: UnsafeMutableRawPointer?, _ text: UnsafePointer<CChar>) {
    let box = Unmanaged<CompletionBox>.fromOpaque(context!).takeRetainedValue()
    let value = try! JSONSerialization.jsonObject(with: String(cString: text).data(using: .utf8)!) as! [String: Any]
    if let error = value["error"] as? String { box.continuation.resume(throwing: BrowserError(error)) }
    else { box.continuation.resume(returning: value["ok"] ?? NSNull()) }
}

var nativeEvents: [(String, String)] = []
private func recordEvent(_ name: UnsafePointer<CChar>, _ text: UnsafePointer<CChar>) {
    nativeEvents.append((String(cString: name), String(cString: text)))
}

@MainActor
func command(_ window: NSWindow, _ input: [String: Any]) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
        let context = Unmanaged.passRetained(CompletionBox(continuation)).toOpaque()
        jsonText(input).withCString {
            qtermWebCommand($0, Unmanaged.passUnretained(window).toOpaque(), context, commandReply, recordEvent)
        }
    }
}

@available(macOS 14.0, *) @MainActor
func click(_ guest: BrowserGuest, _ element: String) async throws {
    NSApp.activate(ignoringOtherApps: true)
    guest.window!.makeKeyAndOrderFront(nil)
    guest.window!.makeFirstResponder(guest.web)
    await pause(0.5)
    let center = try await js(guest, "(()=>{const r=document.getElementById('\(element)').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()") as! [Double]
    let location = guest.surface.convert(NSPoint(x: center[0], y: center[1]), to: nil)
    for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
        let event = NSEvent.mouseEvent(with: type, location: location, modifierFlags: [],
                                      timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: guest.window!.windowNumber,
                                      context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!
        guest.window!.sendEvent(event)
    }
    await pause(1)
}

@available(macOS 14.0, *) @MainActor
func behavior(_ a: BrowserGuest, _ window: NSWindow, _ origin: String) async throws {
    let host = BrowserHost.shared
    _ = try await command(window, ["op": "eval", "id": a.id, "script": "true"])
    try a.action(["action": "navigate", "url": "\(origin)/behavior"])
    await pause(); try await loaded(a)
    _ = try await js(a, "document.cookie='proof=A; SameSite=Lax'; localStorage.setItem('proof','A'); true")
    _ = try await command(window, ["op": "clear", "id": a.id, "selection": ["cache": true]])
    await pause(); try await loaded(a)
    try check(try await js(a, "document.cookie.includes('proof=A') && localStorage.getItem('proof') === 'A'") as? Bool == true, "cache clear retains cookies and storage")
    _ = try await command(window, ["op": "clear", "id": a.id, "selection": ["cookies": true]])
    await pause(); try await loaded(a)
    try check(try await js(a, "document.cookie === '' && localStorage.getItem('proof') === 'A'") as? Bool == true, "cookie clear leaves storage")
    _ = try await command(window, ["op": "clear", "id": a.id, "selection": ["storage": true]])
    await pause(); try await loaded(a)
    try check(try await js(a, "localStorage.getItem('proof') === null") as? Bool == true, "storage clear removes site state")
    let snapshot = try await command(window, ["op": "snapshot", "id": a.id]) as! [String: Any]
    let png = Data(base64Encoded: snapshot["png"] as! String)!
    try check(png.starts(with: [137, 80, 78, 71]), "native snapshot is a PNG")
    let evidence = ProcessInfo.processInfo.environment["QTERM_SMOKE_EVIDENCE"]
    if let evidence = evidence { try png.write(to: URL(fileURLWithPath: evidence).appendingPathComponent("guest.png")) }
    try await click(a, "popup")
    try check(host.pending.count == 1, "real click creates a deferred popup")
    let token = host.pending.keys.first!
    try host.adopt(token, id: "child")
    let child = try host.guest("child")
    try await loaded(child)
    try check(child.store == a.store && child.web.title == "Proxy A", "popup inherits source store and proxy")
    try check(try await js(child, "!!window.opener") as? Bool == true, "popup retains opener")
    _ = try await js(child, "window.close()")
    await pause()
    try check(nativeEvents.contains { $0.0 == "web-window-close" && $0.1.contains("child") }, "window.close reaches host")
    host.close("child")
    try await click(a, "post")
    try check(host.pending.count == 1, "POST target creates popup")
    try host.adopt(host.pending.keys.first!, id: "post")
    let post = try host.guest("post")
    try await loaded(post)
    try check(post.web.url?.path == "/post", "POST popup is loaded without replaying a GET")
    host.close("post")
    _ = try await js(a, "document.getElementById('popup').onclick=()=>{window.child=window.open('about:blank'); child.document.write('<title>Blank child</title>')}; true")
    try await click(a, "popup")
    try check(host.pending.count == 1, "blank popup request retained")
    try host.adopt(host.pending.keys.first!, id: "blank")
    let blank = try host.guest("blank")
    await pause()
    try check(blank.web.title == "Blank child", "blank popup retains opener-written document")
    host.close("blank")
    _ = try await js(a, "document.getElementById('popup').onclick=()=>{window.open('/child')}; true")
    try await click(a, "popup")
    try check(host.pending.count == 1, "second popup pending")
    try a.action(["action": "navigate", "url": "\(origin)/navigation"])
    await pause(); try await loaded(a)
    try check(host.pending.isEmpty, "source navigation cancels pending children")
    try a.action(["action": "navigate", "url": "\(origin)/automatic-fixture"])
    await pause(0.3); try await loaded(a)
    try check(try await js(a, "automatic") as? String == "blocked" && host.pending.isEmpty, "automatic popup denied")
    _ = try await js(a, "document.getElementById('popup').onclick=()=>{for(let i=0;i<8;i++)window.open('/bounded')}; true")
    try await click(a, "popup")
    try check(host.pending.count == 4, "pending popup capacity is bounded per source")
    for token in Array(host.pending.keys) { host.reject(token) }
    try check(host.pending.isEmpty, "popup rejection releases native children")
    _ = try await js(a, "document.getElementById('popup').onclick=()=>window.open('/expiry'); true")
    try await click(a, "popup")
    try check(host.pending.count == 1, "popup expiry fixture created")
    await pause(15)
    try check(host.pending.isEmpty, "unadopted popup expires")
    try a.action(["action": "navigate", "url": "\(origin)/slow"])
    await pause(0.5)
    try check(a.loadState == "loading", "slow navigation reports loading")
    try a.action(["action": "stop"])
    try check(a.loadState == "stopped", "stop clears loading")
    try a.action(["action": "navigate", "url": "\(origin)/close"])
    await pause(); try await loaded(a)
    try await click(a, "popup")
    try check(host.pending.count == 1, "source close fixture created")
    host.close(a.id)
    try check(host.pending.isEmpty && a.closed && a.surface.superview == nil && a.observations.isEmpty, "closing source releases pending views and observers")
}
