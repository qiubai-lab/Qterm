import Foundation
import Network

// Test-only native/backend control channel. The random token is never injected into pages.
@MainActor final class CookieBroker {
    let listener: NWListener
    let owners: [String: CookieOwner]
    let token: String
    init(owners: [String: CookieOwner], token: String) throws {
        self.owners = owners; self.token = token
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
            connection.start(queue: .main)
            Task { @MainActor in self?.receive(connection, accumulated: Data()) }
        }
        listener.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                if case .ready = state, let port = self?.listener.port {
                    print("BROKER \(port.rawValue)"); fflush(stdout)
                }
            }
        }
        listener.start(queue: .main)
    }
    func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, complete, error in
            Task { @MainActor in
                guard let self else { connection.cancel(); return }
                let bytes = accumulated + (data ?? Data())
                guard bytes.count <= 16384, error == nil else { connection.cancel(); return }
                guard let raw = String(data: bytes, encoding: .utf8), raw.contains("\r\n\r\n") else {
                    if complete { connection.cancel() } else { self.receive(connection, accumulated: bytes) }
                    return
                }
                let lines = raw.components(separatedBy: "\r\n")
                guard lines.contains("Authorization: Bearer " + self.token),
                      let path = lines.first?.split(separator: " ").dropFirst().first,
                      let parts = URLComponents(string: "http://127.0.0.1" + path) else { connection.cancel(); return }
                let query = Dictionary((parts.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
                guard let owner = self.owners[query["profile"] ?? ""], let url = URL(string: query["url"] ?? ""),
                      url.scheme == "http", url.host == "localhost", url.port == 3000 else { connection.cancel(); return }
                let payload = try! JSONSerialization.data(withJSONObject: ["cookie": await owner.header(url)])
                let head = Data("HTTP/1.1 200 OK\r\nContent-Length: \(payload.count)\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n".utf8)
                connection.send(content: head + payload, completion: .contentProcessed { _ in connection.cancel() })
            }
        }
    }
}
