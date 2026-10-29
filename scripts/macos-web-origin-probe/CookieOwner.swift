import Foundation
import WebKit

// Deliberately first-party HTTP only. This is not a general browser Cookie policy.
@MainActor final class CookieOwner {
    let store: WKHTTPCookieStore
    init(_ store: WKHTTPCookieStore) { self.store = store }
    func all() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
    }
    func header(_ url: URL) async -> String {
        let host = url.host ?? ""
        let path = url.path.isEmpty ? "/" : url.path
        return await all().filter { cookie in
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))
            let domainMatches = host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))
            let pathMatches = path == cookie.path || (path.hasPrefix(cookie.path) &&
                (cookie.path.hasSuffix("/") || path.dropFirst(cookie.path.count).hasPrefix("/")))
            return domainMatches && pathMatches && (!cookie.isSecure || url.scheme == "https") &&
                (cookie.expiresDate == nil || cookie.expiresDate! > Date())
        }.sorted { $0.path.count > $1.path.count }.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
    }
    func receive(_ headers: [String: String], url: URL) async {
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: url) {
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))
            guard domain == url.host else { continue }
            if let expires = cookie.expiresDate, expires <= Date() {
                for existing in await all() where existing.name == cookie.name && existing.path == cookie.path && existing.domain == cookie.domain {
                    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                        store.delete(existing) { continuation.resume() }
                    }
                }
            } else {
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    store.setCookie(cookie) { continuation.resume() }
                }
            }
        }
    }
    func clear() async {
        for cookie in await all() {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                store.delete(cookie) { continuation.resume() }
            }
        }
    }
}
