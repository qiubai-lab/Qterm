import AppKit
import WebKit

@available(macOS 14.0, *) @MainActor
func navigationSmoke(_ page: BrowserGuest, _ origin: String) async throws {
    var guardrail = NavigationGuard()
    for index in 0..<6 {
        try check(guardrail.allow(URL(string: "https://site.test/search?nonce=\(index)")!, now: Double(index)), "navigation guard allows bounded same-route steps")
    }
    try check(!guardrail.allow(URL(string: "https://site.test/search?nonce=new")!, now: 6), "query churn cannot evade a repeated-route limit")
    try check(!guardrail.allow(URL(string: "https://site.test/other")!, now: 60), "loop stop stays latched")
    guardrail.reset()
    try check(guardrail.allow(URL(string: "https://site.test/search")!, now: 61), "explicit retry resets loop state")
    for index in 0..<10 {
        try check(guardrail.allow(URL(string: "https://site.test/search")!, now: 80 + Double(index) * 11), "separate visits do not accumulate into a loop")
    }
    for code in [301, 302] {
        try page.action(["action": "navigate", "url": "\(origin)/redirect-\(code)"])
        await pause(); try await loaded(page)
        try check(page.web.url?.path == "/redirect-done", "normal \(code) redirects still complete")
    }
    try page.action(["action": "navigate", "url": "\(origin)/loop-a"])
    for _ in 0..<100 {
        if page.navigationGuard.blocked { break }
        await pause()
    }
    try check(page.navigationGuard.blocked && page.loadState == "failed" && page.message.contains("循环跳转"), "real script redirect loop stops with an explanation")
    let stopped = page.web.url
    await pause(0.5)
    try check(page.web.url == stopped && page.loadState == "failed", "cancel callbacks do not restart or overwrite loop failure")
    _ = try await command(page.window!, ["op": "clear", "id": page.id, "selection": ["cache": true]])
    try check(!page.navigationGuard.blocked, "explicit data clearing can pause a loop-blocked document")
    try page.action(["action": "navigate", "url": "\(origin)/recovered"])
    await pause(); try await loaded(page)
    try check(!page.navigationGuard.blocked && page.message.isEmpty && page.web.url?.path == "/recovered", "manual navigation recovers from a stopped loop")
    let count = nativeEvents.count
    try page.action(["action": "navigate", "url": "\(origin)/slow"])
    await pause(0.3)
    let phantomVisits = nativeEvents.dropFirst(count).filter { name, data in
        guard name == "web-page-state", let bytes = data.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return false }
        return (event["url"] as? String)?.hasSuffix("/slow") == true && event["visited"] as? Bool == true
    }
    try check(phantomVisits.isEmpty, "provisional URL changes are not recorded as completed visits")
    try page.action(["action": "stop"])
}
