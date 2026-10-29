import AppKit
import WebKit
import Network

let environment = ProcessInfo.processInfo.environment
let source = environment["PROBE_SOURCE"]!
let token = environment["PROBE_TOKEN"]!
let mapping = try! String(contentsOfFile: source + "/websocket-map.js", encoding: .utf8)
let checksScript = try! String(contentsOfFile: source + "/checks.js", encoding: .utf8)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

@MainActor final class Profile {
    let store = WKWebsiteDataStore.nonPersistent()
    let owner: CookieOwner
    let handler: HTTPHandler
    let rules: WKContentRuleList
    init(name: String, rules: WKContentRuleList) {
        self.rules = rules
        owner = CookieOwner(store.httpCookieStore)
        handler = HTTPHandler(owner: owner, port: Int(environment["HTTP_" + name]!)!, token: token, workerPrefix: mapping)
        var proxy = ProxyConfiguration(socksv5Proxy: .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: UInt16(environment["SOCKS_" + name]!)!)!))
        proxy.allowFailover = false
        store.proxyConfigurations = [proxy]
    }
    func web() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = store
        precondition(ProbeRegisterHTTPHandler(config, handler))
        precondition(WKWebView.handlesURLScheme("http"))
        config.userContentController.add(rules)
        config.userContentController.addUserScript(WKUserScript(source: mapping, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        return WKWebView(frame: NSRect(x: 0, y: 0, width: 600, height: 400), configuration: config)
    }
}
@MainActor func load(_ web: WKWebView, path: String = "/") async throws {
    web.load(URLRequest(url: URL(string: "http://localhost:3000" + path)!))
    try await Task.sleep(nanoseconds: 200_000_000)
    for _ in 0..<100 {
        if !web.isLoading { return }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
    throw URLError(.timedOut)
}
@MainActor func script(_ web: WKWebView, _ source: String, arguments: [String: Any] = [:]) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
        web.callAsyncJavaScript(source, arguments: arguments, in: nil, in: .page) { result in
            continuation.resume(with: result)
        }
    }
}
func output(_ value: Any) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print("RESULT " + String(data: data, encoding: .utf8)!); fflush(stdout)
}
func control(_ action: String) {
    print("CONTROL \(action) A"); fflush(stdout)
    precondition(readLine() == "OK")
}
Task { @MainActor in
    do {
        let ruleObjects = ["^ws://localhost[:/]", "^wss://localhost[:/]", "^ws://127[.][0-9.]+[:/]"].map {
            ["trigger": ["url-filter": $0], "action": ["type": "block"]]
        }
        let ruleJSON = String(data: try JSONSerialization.data(withJSONObject: ruleObjects), encoding: .utf8)!
        let rules = try await WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "qterm-origin-probe", encodedContentRuleList: ruleJSON)!
        let a = Profile(name: "A", rules: rules), b = Profile(name: "B", rules: rules)
        let broker = try CookieBroker(owners: ["A": a.owner, "B": b.owner], token: token)
        let wa = a.web(), wb = b.web()
        try await load(wa); try await load(wb)
        async let resultA = script(wa, checksScript, arguments: ["profile": "A"])
        async let resultB = script(wb, checksScript, arguments: ["profile": "B"])
        output(["profile": "A", "checks": try await resultA])
        output(["profile": "B", "checks": try await resultB])
        let wa2 = a.web(); try await load(wa2)
        output(["phase": "reuse", "value": try await script(wa2, "return await fetch('/echo').then(r=>r.json())")])
        await a.owner.clear()
        output(["phase": "clearA", "a": try await script(wa, "return await fetch('/echo').then(r=>r.json())"), "b": try await script(wb, "return await fetch('/echo').then(r=>r.json())")])
        output(["phase": "beforeCut", "a": try await script(wa, "return await new Promise(resolve=>{window.liveSocket=new WebSocket('ws://localhost:3000/held');liveSocket.onmessage=()=>resolve('open');liveSocket.onclose=e=>window.cutCode=e.code})")])
        control("cut")
        output(["phase": "cut", "socketClose": try await script(wa, "for(let i=0;i<30 && window.cutCode===undefined;i++)await new Promise(r=>setTimeout(r,100));return window.cutCode??-1"), "newSocket": try await script(wa, "return await new Promise(resolve=>{const s=new WebSocket('ws://localhost:3000/after-cut');s.onopen=()=>{s.close();resolve('connected')};s.onerror=()=>resolve('failed');setTimeout(()=>resolve('timeout'),3000)})"), "aStatus": try await script(wa, "return await fetch('/echo').then(r=>r.status).catch(()=>0)"), "b": try await script(wb, "return await fetch('/echo').then(r=>r.json())")])
        control("restore")
        output(["phase": "restored", "a": try await script(wa, "return await fetch('/echo').then(r=>r.json())")])
        let csp = b.web(); try await load(csp, path: "/csp")
        output(["phase": "csp", "value": try await script(csp, "return await new Promise(resolve=>{let s;try{s=new WebSocket('ws://localhost:3000/ws')}catch(e){resolve('blocked');return}s.onopen=()=>{s.close();resolve('connected')};s.onerror=()=>resolve('blocked');setTimeout(()=>resolve('timeout'),2000)})")])
        withExtendedLifetime(broker) {}
        WKContentRuleListStore.default().removeContentRuleList(forIdentifier: "qterm-origin-probe") { _ in
            app.terminate(nil)
        }
    } catch {
        output(["fatal": String(describing: error)])
        WKContentRuleListStore.default().removeContentRuleList(forIdentifier: "qterm-origin-probe") { _ in
            app.terminate(nil)
        }
    }
}
app.run()
