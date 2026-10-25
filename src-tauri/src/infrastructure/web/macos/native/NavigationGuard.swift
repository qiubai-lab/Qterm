import Foundation

/// Bound repeated document navigations, including script loops with changing query tokens.
/// A stopped chain stays stopped until an explicit navigation starts another attempt.
struct NavigationGuard {
    private var recent: [(String, TimeInterval)] = []
    private(set) var blocked = false

    mutating func reset() { recent.removeAll(); blocked = false }

    mutating func allow(_ url: URL, now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        guard !blocked else { return false }
        guard var location = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return true }
        location.query = nil; location.fragment = nil
        let key = location.string ?? url.absoluteString
        recent.removeAll { now - $0.1 > 10 }
        if recent.filter({ $0.0 == key }).count >= 6 {
            blocked = true; return false
        }
        recent = Array(recent.suffix(63))
        recent.append((key, now))
        return true
    }
}
