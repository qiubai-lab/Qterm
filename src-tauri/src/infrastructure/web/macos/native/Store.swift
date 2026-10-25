import AppKit
import WebKit
import Network

@available(macOS 14.0, *)
extension BrowserHost {
    func create(_ id: String, input: [String: Any], window: NSWindow, rules: WKContentRuleList? = nil) throws {
        guard guests[id] == nil, guests.count + pending.count < 99 else { throw BrowserError("网页已打开或达到数量上限") }
        guard let key = input["store"] as? String, let uuid = UUID(uuidString: key),
              let address = input["url"] as? String else { throw BrowserError("浏览环境无效") }
        let port = input["port"] as? NSNumber
        let config = WKWebViewConfiguration()
        let store = stores[key] ?? WKWebsiteDataStore(forIdentifier: uuid)
        if let port = port {
            guard (1...65535).contains(port.intValue), let rules = rules,
                  let script = input["tunnelScript"] as? String,
                  QtermRestrictPeerConnections(config.preferences) else { throw BrowserError("当前 WebKit 无法启用隧道网络保护") }
            if stores[key] == nil {
                var proxy = ProxyConfiguration(socksv5Proxy: .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port.uint16Value)!))
                proxy.allowFailover = false
                store.proxyConfigurations = [proxy]
            }
            config.userContentController.add(rules)
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        stores[key] = store; config.websiteDataStore = store
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        for script in input["scripts"] as? [String] ?? [] {
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let destination = port == nil ? address : try TunnelPolicy.address(address)
        let guest = BrowserGuest(id: id, config: config, window: window,
                                 appOrigin: input["appOrigin"] as? String ?? "", store: key, remote: port != nil)
        guard guest.allowed(destination) else { guest.dispose(); throw BrowserError("不支持的网页地址") }
        guests[id] = guest
        guest.web.load(URLRequest(url: URL(string: destination)!))
    }

    func clear(_ input: [String: Any], reply: Reply) throws {
        let page = try guest(input["id"] as? String ?? "")
        let selection = input["selection"] as? [String: Bool] ?? [:]
        var types = Set<String>()
        if selection["cache"] == true { types.formUnion([WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]) }
        if selection["cookies"] == true { types.insert(WKWebsiteDataTypeCookies) }
        if selection["storage"] == true {
            types.formUnion([WKWebsiteDataTypeLocalStorage, WKWebsiteDataTypeSessionStorage,
                             WKWebsiteDataTypeIndexedDBDatabases, WKWebsiteDataTypeWebSQLDatabases,
                             WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache])
        }
        guard !types.isEmpty else { throw BrowserError("请选择要清理的数据") }
        let affected = guests.values.filter { $0.store == page.store }
        let originals = affected.map { ($0, $0.web.url) }
        for (guest, _) in originals { cancelPopups(guest.id); guest.web.stopLoading(); guest.web.loadHTMLString("", baseURL: nil) }
        let deadline = Date().addingTimeInterval(5)
        func awaitBlank() {
            if originals.contains(where: { $0.0.web.isLoading || $0.0.web.url?.absoluteString != "about:blank" }) {
                if Date() < deadline { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: awaitBlank); return }
                for (guest, url) in originals where !guest.closed { if let url = url { guest.web.load(URLRequest(url: url)) } }
                reply.fail("网页暂停超时，尚未清理数据"); return
            }
            var completed = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                guard !completed else { return }
                completed = true
                // Leave paused pages blank: removal may still complete later. Never claim success.
                reply.fail("清理数据超时，请稍后重新打开网页")
            }
            page.web.configuration.websiteDataStore.removeData(ofTypes: types, modifiedSince: .distantPast) {
                guard !completed else { return }
                completed = true
                for (guest, url) in originals where !guest.closed { if let url = url { guest.web.load(URLRequest(url: url)) } }
                reply.send()
            }
        }
        awaitBlank()
    }
}
