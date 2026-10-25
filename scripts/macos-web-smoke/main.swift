import AppKit
import WebKit

func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw BrowserError("FAIL: \(message)") }
    print("PASS: \(message)")
}

@MainActor
func pause(_ seconds: Double = 0.1) async { try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }

@available(macOS 14.0, *) @MainActor
func loaded(_ guest: BrowserGuest) async throws {
    for _ in 0..<120 {
        if guest.loadState == "loaded" { return }
        await pause()
    }
    throw BrowserError("Load timed out: \(guest.id) \(String(describing: guest.navigationError)) \(guest.loadState) \(guest.web.url?.absoluteString ?? "nil")")
}

@available(macOS 14.0, *) @MainActor
func js(_ guest: BrowserGuest, _ script: String) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
        guest.web.evaluateJavaScript(script) { value, error in
            if let error = error { continuation.resume(throwing: error) }
            else { continuation.resume(returning: value ?? NSNull()) }
        }
    }
}

@available(macOS 14.0, *) @MainActor
func smoke(_ window: NSWindow) async throws {
    try await remoteSmoke(window)
    let host = BrowserHost.shared
    let env = ProcessInfo.processInfo.environment
    let aPort = Int(env["QTERM_SMOKE_A"]!)!, bPort = Int(env["QTERM_SMOKE_B"]!)!
    let localPort = Int(env["QTERM_SMOKE_LOCAL"]!)!
    let storeA = UUID().uuidString, storeB = UUID().uuidString, localStore = UUID().uuidString
    let root = env["QTERM_SMOKE_ROOT"]!
    let metrics = try String(contentsOfFile: root + "/src-tauri/src/infrastructure/web/metrics_script.mjs", encoding: .utf8)
    let origin = "http://127.0.0.1:\(aPort)"
    func open(_ id: String, _ store: String, _ port: Int, _ path: String = "/") throws -> BrowserGuest {
        let input: [String: Any] = ["store": store, "url": "http://127.0.0.1:\(port)\(path)", "scripts": [metrics], "appOrigin": "http://localhost:1420"]
        try host.create(id, input: input, window: window)
        let guest = try host.guest(id)
        try guest.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true])
        return guest
    }
    let a = try open("a", storeA, aPort), b = try open("b", storeB, bPort)
    try await loaded(a); try await loaded(b)
    try check(a.web.title == "Proxy A" && b.web.title == "Proxy B", "independent native stores")
    try check(try await js(a, "typeof window.__TAURI_INTERNALS__") as? String == "undefined", "guest has no Tauri IPC")
    _ = try await js(a, "document.cookie='proof=A; SameSite=Lax'; localStorage.setItem('proof','A'); true")
    try check(try await js(b, "document.cookie + (localStorage.getItem('proof') || '')") as? String == "", "cookies and storage isolated")
    let shared = try open("shared", storeA, aPort)
    try await loaded(shared)
    try check(try await js(shared, "document.cookie.includes('proof=A') && localStorage.getItem('proof') === 'A'") as? Bool == true, "same environment shares storage")
    host.close("shared")
    let reopened = try open("shared", storeA, aPort)
    try await loaded(reopened)
    try check(try await js(reopened, "localStorage.getItem('proof')") as? String == "A", "reopen preserves storage")
    host.close("shared"); host.close("b")
    let local = try open("local", localStore, localPort)
    try await loaded(local)
    try check(local.web.title == "Proxy Local", "local environment connects directly")
    host.close("local")
    _ = try await js(a, "history.pushState({}, '', '/spa'); document.title='SPA'; true")
    await pause()
    try check(a.web.url?.path == "/spa" && a.web.title == "SPA", "SPA URL and title update")
    try check(try await js(a, "!!window.__qtermPageMetrics()") as? Bool == true, "page metrics injected")
    try check(!a.allowed("tauri://localhost") && !a.allowed("file:///tmp/a") && !a.allowed("http://localhost:1420/"), "internal and custom schemes denied")
    try a.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true,
                "occlusions": [["x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0]]])
    let point = a.surface.convert(NSPoint(x: 20, y: 20), to: a.surface.superview)
    try check(a.surface.hitTest(point) == nil, "occluded region rejects mouse input")
    window.makeFirstResponder(a.web)
    try a.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true, "inputBlocked": true])
    try check((window.firstResponder as? NSView).map { $0 === a.web || $0.isDescendant(of: a.web) } != true, "modal returns keyboard focus to host")
    let center = a.surface.convert(NSPoint(x: 200, y: 200), to: a.surface.superview)
    try check(a.surface.hitTest(center) == nil, "modal locks native input")
    try a.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true])
    try check(a.surface.hitTest(center) != nil, "unlock restores native input")
    try await navigationSmoke(a, origin)
    if env["QTERM_SMOKE_NAVIGATION_ONLY"] == "1" { return }
    try await behavior(a, window, origin)
    do {
        try host.create("remote", input: ["store": UUID().uuidString, "url": origin, "port": 12345], window: window)
        throw BrowserError("unqualified remote proxy must be refused")
    } catch {
        try check(host.guests["remote"] == nil, "unqualified remote proxy rejected before navigation")
    }
}

@available(macOS 14.0, *) @MainActor
func cleanup() async {
    let host = BrowserHost.shared
    for id in Array(host.guests.keys) { host.close(id) }
    for token in Array(host.pending.keys) { host.reject(token) }
    let stores = Array(host.stores.keys); host.stores.removeAll()
    await pause()
    for key in stores {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.remove(forIdentifier: UUID(uuidString: key)!) { error in
                if let error = error { fputs("Store cleanup: \(error)\n", stderr) }
                continuation.resume()
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 900, height: 650),
                      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.title = "Qterm isolated macOS browser smoke"
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
Task { @MainActor in
    do {
        guard #available(macOS 14.0, *) else { throw BrowserError("macOS 14+ required") }
        try await smoke(window)
        await cleanup()
        print("PASS: native browser smoke")
        exit(0)
    } catch {
        if #available(macOS 14.0, *) { await cleanup() }
        fputs("\(error)\n", stderr); exit(1)
    }
}
app.run()
