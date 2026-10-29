import Foundation
import WebKit

// Keep redirects in WebKit so URLSession cannot silently escape the SSH gateway.
private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@MainActor final class HTTPHandler: NSObject, WKURLSchemeHandler {
    let owner: CookieOwner
    let port: Int
    let token: String
    let workerPrefix: String
    let session: URLSession
    var jobs: [ObjectIdentifier: Task<Void, Never>] = [:]
    init(owner: CookieOwner, port: Int, token: String, workerPrefix: String) {
        self.owner = owner; self.port = port; self.token = token; self.workerPrefix = workerPrefix
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil; configuration.httpShouldSetCookies = false
        configuration.urlCache = nil; configuration.connectionProxyDictionary = [:]
        configuration.timeoutIntervalForRequest = 6
        session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let key = ObjectIdentifier(task)
        jobs[key] = Task { @MainActor in
            defer { jobs.removeValue(forKey: key) }
            do {
                guard let original = task.request.url, original.scheme == "http", original.host == "localhost", original.port == 3000 else {
                    throw URLError(.unsupportedURL)
                }
                let cookiesAllowed = task.request.httpShouldHandleCookies
                var address = URLComponents(url: original, resolvingAgainstBaseURL: false)!
                address.host = "127.0.0.1"; address.port = port
                var request = task.request
                request.url = address.url; request.httpShouldHandleCookies = false
                request.setValue("localhost:3000", forHTTPHeaderField: "Host")
                request.setValue(token, forHTTPHeaderField: "X-Probe-Route")
                request.setValue(cookiesAllowed ? await owner.header(original) : nil, forHTTPHeaderField: "Cookie")
                let (received, response) = try await session.data(for: request)
                try Task.checkCancellation()
                guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                var headers: [String: String] = [:]
                for (key, value) in response.allHeaderFields { headers[String(describing: key)] = String(describing: value) }
                if cookiesAllowed { await owner.receive(headers, url: original) }
                try Task.checkCancellation()
                var data = received
                let destination = task.request.value(forHTTPHeaderField: "Sec-Fetch-Dest")
                if destination == "worker" || destination == "sharedworker" {
                    data = Data((workerPrefix + "\n").utf8) + data
                }
                headers = headers.filter { !["content-length", "content-encoding", "set-cookie"].contains($0.key.lowercased()) }
                headers["Content-Length"] = String(data.count)
                task.didReceive(HTTPURLResponse(url: original, statusCode: response.statusCode, httpVersion: "HTTP/1.1", headerFields: headers)!)
                task.didReceive(data); task.didFinish()
            } catch {
                if !Task.isCancelled { task.didFailWithError(error) }
            }
        }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        jobs.removeValue(forKey: ObjectIdentifier(task))?.cancel()
    }
}
