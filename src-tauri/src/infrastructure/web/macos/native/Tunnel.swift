import Foundation
import WebKit

@available(macOS 14.0, *)
enum TunnelPolicy {
    static let suffix = ".qterm-tunnel.invalid"
    static var rules: WKContentRuleList?

    static func address(_ address: String) throws -> String {
        guard var url = URLComponents(string: address), let raw = url.host else { return address }
        let host = raw.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        var alias: String?
        if host == "localhost" { alias = "localhost" }
        else if host == "::1" || host == "[::1]" { alias = "ipv6-loopback" }
        else if ["::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:127.0.0.1", "[::ffff:127.0.0.1]"].contains(host) { alias = "ip-7f000001" }
        else if host == "0.0.0.0" { alias = "unspecified" }
        else {
            let parts = host.split(separator: ".").compactMap { UInt8($0) }
            if parts.count == 4 && parts[0] == 127 { alias = "ip-" + parts.map { String(format: "%02x", $0) }.joined() }
        }
        guard let alias = alias else { return address }
        guard url.scheme == "http" || url.scheme == "ws" else {
            throw BrowserError("HTTPS localhost 不支持隧道地址映射，请使用服务器域名和有效证书")
        }
        url.host = alias + suffix
        return url.string ?? address
    }

    static func prepare(_ completion: @escaping (WKContentRuleList?, Error?) -> Void) {
        if let rules = rules { completion(rules, nil); return }
        // Apply in WebKit's network loader, including requests from subframes/workers.
        // Canonical numeric/IPv6 loopback and raw localhost must never reach the local computer.
        let hosts = [#"localhost\.?"#, #"[a-z0-9.-]+\.localhost\.?"#, #"127\.[0-9.]+"#, #"0\.0\.0\.0"#, #"\[::1\]"#, #"\[::ffff:[0-9a-f:.]+\]"#]
        let json = jsonText(hosts.flatMap { host in
            ["^[a-z]+://", "^[a-z]+://[^/]*@"].map { prefix in
                ["trigger": ["url-filter": prefix + host + "[:/]", "url-filter-is-case-sensitive": false], "action": ["type": "block"]]
            }
        })
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "qterm-tunnel-loopback-v1", encodedContentRuleList: json) { list, error in
            rules = list; completion(list, error)
        }
    }
}
