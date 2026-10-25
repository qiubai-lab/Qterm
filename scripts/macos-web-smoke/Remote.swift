import AppKit
import WebKit

@available(macOS 14.0, *) @MainActor
func remoteSmoke(_ window: NSWindow) async throws {
    let env = ProcessInfo.processInfo.environment
    let host = BrowserHost.shared
    let script = try String(contentsOfFile: env["QTERM_SMOKE_ROOT"]! + "/src-tauri/src/infrastructure/web/macos/tunnel_script.mjs", encoding: .utf8)
    let port = Int(env["QTERM_SMOKE_PROXY"]!)!
    let local = env["QTERM_SMOKE_LOCAL"]!
    let uuid = UUID().uuidString
    _ = try await command(window, ["op": "open", "id": "remote", "store": uuid, "port": port,
                                  "url": "http://localhost:8765/", "tunnelScript": script])
    let page = try host.guest("remote")
    try await loaded(page)
    try check(page.web.title == "Proxy Remote" && page.web.url?.host == "localhost.qterm-tunnel.invalid", "remote localhost navigates through a tunnel origin")
    try check(try await js(page, "typeof RTCPeerConnection") as? String == "undefined", "native WebRTC disabled in remote guest")
    try page.action(["action": "navigate", "url": "http://127.0.0.1:8765/ip"])
    await pause(); try await loaded(page)
    try check(page.web.url?.host == "ip-7f000001.qterm-tunnel.invalid", "numeric loopback maps to tunnel origin")
    _ = try await js(page, "window.fetchProof='pending'; fetch('http://127.0.0.1:8765/fetch').then(r=>r.text()).then(t=>fetchProof=t.includes('Proxy Remote')?'mapped':'bad').catch(()=>fetchProof='failed'); true")
    for _ in 0..<50 {
        if try await js(page, "fetchProof") as? String != "pending" { break }
        await pause()
    }
    try check(try await js(page, "fetchProof") as? String == "mapped", "fetch preserves remote loopback routing")
    _ = try await js(page, "window.wsProof='pending'; window.socket=new WebSocket('ws://127.0.0.1:8765/ws'); socket.onmessage=e=>{wsProof=e.data;socket.close()}; socket.onerror=()=>wsProof='failed'; true")
    for _ in 0..<50 {
        if try await js(page, "wsProof") as? String != "pending" { break }
        await pause()
    }
    try check(try await js(page, "wsProof") as? String == "tunnel", "WebSocket traverses the mapped tunnel")
    // Workers do not inherit the page's JS wrappers: native content rules must stop them.
    let worker = "fetch('http://127.0.0.1:\(local)/raw-worker-fetch').catch(()=>{}); try { new WebSocket('ws://127.0.0.1:\(local)/raw-worker-socket'); } catch {} for (const host of ['localhost.', '127.1', '2130706433', 'test.localhost']) { fetch('http://'+host+':\(local)/raw-worker-variant').catch(()=>{}); } try { importScripts('http://user:pass@127.0.0.1:\(local)/raw-worker-credentials'); } catch {} postMessage('attempted');"
    _ = try await js(page, "window.workerStarted=false; window.worker=new Worker(URL.createObjectURL(new Blob([\(jsonText(worker))],{type:'text/javascript'}))); worker.onmessage=()=>workerStarted=true; true")
    await pause(1.5)
    try check(try await js(page, "workerStarted") as? Bool == true, "unwrapped worker requests exercised against native block rules")
    do {
        try page.action(["action": "navigate", "url": "https://localhost:8765/"])
        throw BrowserError("HTTPS loopback incorrectly accepted")
    } catch { try check(error.localizedDescription.contains("HTTPS localhost"), "HTTPS localhost reports certificate compatibility limit") }
    for (address, expected) in [("http://[::1]:8765/", "ipv6-loopback"), ("http://0.0.0.0:8765/", "unspecified"), ("http://[::ffff:127.0.0.1]:8765/", "ip-7f000001"), ("http://remote.test:8765/", "remote.test")] {
        try page.action(["action": "navigate", "url": address])
        await pause(); try await loaded(page)
        try check(page.web.url?.host == (expected == "remote.test" ? expected : expected + TunnelPolicy.suffix), "remote address maps correctly: \(address)")
    }
    _ = try await js(page, "document.cookie='remoteProof=A'; localStorage.setItem('remoteProof','A'); true")
    _ = try await command(window, ["op": "open", "id": "remote2", "store": UUID().uuidString, "port": Int(env["QTERM_SMOKE_PROXY2"]!)!, "url": "http://remote.test:8765/", "tunnelScript": script])
    let other = try host.guest("remote2")
    try await loaded(other)
    try check(other.web.title == "Proxy Remote2", "independent remote store uses its own proxy")
    try check(try await js(other, "document.cookie + (localStorage.getItem('remoteProof') || '')") as? String == "", "remote stores isolate cookies and storage at identical origins")
    host.close("remote2")
    let failing = UUID().uuidString
    _ = try await command(window, ["op": "open", "id": "remote-failed", "store": failing, "port": 1,
                                  "url": "http://127.0.0.1:\(local)/must-not-bypass", "tunnelScript": script])
    await pause(2)
    try check(try host.guest("remote-failed").loadState == "failed", "dead tunnel fails without local fallback")
    try check(try host.guest("remote-failed").message.contains("网页加载失败（"), "native network failures expose an error code and message")
    host.close("remote"); host.close("remote-failed")
}
