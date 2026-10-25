import WebKit

@available(macOS 14.0, *) @MainActor
func userAgentSmoke(_ guest: BrowserGuest) async throws {
    let agent = try await js(guest, "navigator.userAgent") as? String ?? ""
    try check(agent.contains("Macintosh; Intel Mac OS X 10_15_7") &&
              agent.contains("Chrome/") && agent.contains("Edg/"), "\(guest.id) exposes desktop Edge identity")
    try check(try await js(guest, "window.fixtureUserAgent") as? String == agent,
              "\(guest.id) first HTTP request and navigator share the UA")
}

@available(macOS 14.0, *) @MainActor
func popupUserAgentSmoke(_ source: BrowserGuest) async throws {
    let host = BrowserHost.shared
    let previous = Set(host.pending.keys)
    // WebKit treats evaluateJavaScript as activation; no desktop mouse injection.
    _ = try await js(source, "window.open('/ua-popup', '_blank'); true")
    for _ in 0..<50 {
        if host.pending.keys.contains(where: { !previous.contains($0) }) { break }
        await pause()
    }
    guard let token = host.pending.keys.first(where: { !previous.contains($0) }),
          let popup = host.pending[token]?.guest else { throw BrowserError("UA popup was not created") }
    defer { host.reject(token); host.close("ua-popup") }
    try await loaded(popup)
    try await userAgentSmoke(popup)
    try host.adopt(token, id: "ua-popup")
    try await userAgentSmoke(popup)
}
