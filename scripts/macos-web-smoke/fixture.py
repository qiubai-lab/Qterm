#!/usr/bin/env python3
"""Real AppKit/WebKit checks. Run on an interactive macOS 14+ desktop with Xcode.
Only throwaway UUID stores and loopback fixtures are used; no SSH/account required.
"""
import os
import argparse
import base64
import hashlib
from pathlib import Path
import socket
import socketserver
import struct
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
requests = []


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(10)
        try:
            host = "direct"
            if self.server.proxy:
                version, count = self.rfile.read(2)
                assert version == 5
                self.rfile.read(count)
                self.wfile.write(b"\x05\x00")
                header = self.rfile.read(4)
                if header[3] == 3:
                    host = self.rfile.read(self.rfile.read(1)[0]).decode()
                elif header[3] == 1:
                    host = socket.inet_ntoa(self.rfile.read(4))
                else:
                    host = socket.inet_ntop(socket.AF_INET6, self.rfile.read(16))
                port = struct.unpack("!H", self.rfile.read(2))[0]
                self.wfile.write(b"\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00")
                host += ":" + str(port)
                print("SOCKS CONNECT", self.server.name, host, flush=True)
            first = self.rfile.readline().decode().strip()
            headers = {}
            while True:
                line = self.rfile.readline().decode().strip()
                if not line:
                    break
                key, value = line.split(":", 1)
                headers[key.lower()] = value.strip()
            body = self.rfile.read(int(headers.get("content-length", 0))).decode()
            requests.append((self.server.name, host, first, body))
            path = first.split()[1] if len(first.split()) > 1 else ""
            if path in ["/redirect-301", "/redirect-302"]:
                status = path.rsplit("-", 1)[1]
                self.wfile.write(("HTTP/1.1 " + status + " Redirect\r\nLocation: /redirect-done\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").encode())
                return
            if headers.get("upgrade", "").lower() == "websocket":
                accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
                self.wfile.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").encode() + b"\x81\x06tunnel")
                time.sleep(0.5)
                return
            if "/slow" in first:
                time.sleep(4)
            loop = ""
            if path.startswith("/loop-a") or path.startswith("/loop-b"):
                target = "/loop-b" if path.startswith("/loop-a") else "/loop-a"
                loop = "<script>setTimeout(()=>location.replace('" + target + "?nonce='+Date.now()), 30)</script>"
            automatic = "<script>setTimeout(()=>{window.automatic=window.open('/automatic')===null?'blocked':'opened'}, 50)</script>" if "/automatic-fixture" in first else ""
            response = (loop + automatic + "<!doctype html><title>Proxy " + self.server.name + "</title>"
                        "<body style='margin:0;background:#d9edff'>"
                        "<button id='popup' style='width:200px;height:80px' "
                        "onclick=\"window.child=window.open('/child','_blank')\">Popup</button>"
                        "<form action='/post' method='post' target='_blank'>"
                        "<input name='proof' value='preserved'><button id='post'>Post</button></form>"
                        "<div style='height:2000px'>Native browser fixture</div></body>").encode()
            self.wfile.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
                              "Content-Length: %d\r\nConnection: close\r\n\r\n" % len(response)).encode() + response)
        except (OSError, ValueError, IndexError) as error:
            print("fixture:", error, flush=True)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def server(name, proxy):
    result = Server(("127.0.0.1", 0), Handler)
    result.name, result.proxy = name, proxy
    threading.Thread(target=result.serve_forever, daemon=True).start()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--navigation-only", action="store_true", help="Run network/store/navigation checks without desktop mouse popup tests")
    options = parser.parse_args()
    a, b, direct = server("A", False), server("B", False), server("Local", False)
    proxy = server("Remote", True)
    proxy2 = server("Remote2", True)
    with tempfile.TemporaryDirectory(prefix="qterm-web-smoke-") as directory:
        executable = Path(directory) / "QtermWebSmoke"
        native = ROOT / "src-tauri/src/infrastructure/web/macos/native"
        policy = Path(directory) / "WebKitPolicy.o"
        subprocess.run(["xcrun", "clang", "-fobjc-arc", "-c", str(native / "WebKitPolicy.m"), "-o", str(policy)], check=True)
        subprocess.run(["xcrun", "swiftc", "-import-objc-header", str(native / "WebKitPolicy.h"), str(policy), "-swift-version", "5", "-O",
                        *map(str, sorted(native.glob("*.swift"))), *map(str, sorted(Path(__file__).parent.glob("*.swift"))),
                        "-o", str(executable)], check=True)
        env = dict(os.environ, QTERM_SMOKE_A=str(a.server_address[1]),
                   QTERM_SMOKE_B=str(b.server_address[1]), QTERM_SMOKE_PROXY2=str(proxy2.server_address[1]), QTERM_SMOKE_PROXY=str(proxy.server_address[1]), QTERM_SMOKE_LOCAL=str(direct.server_address[1]),
                   QTERM_SMOKE_ROOT=str(ROOT), QTERM_SMOKE_NAVIGATION_ONLY="1" if options.navigation_only else "0")
        result = subprocess.run([str(executable)], env=env, timeout=150)
        print("Proxy requests:", requests, flush=True)
        assert not any(name == "Local" and ("raw-worker" in line or "must-not-bypass" in line) for name, _, line, _ in requests), "raw loopback request bypassed the tunnel"
        assert any(name == "Remote" and "GET /ws " in line for name, _, line, _ in requests)
        if not options.navigation_only:
            assert any(name == "A" and "POST /post " in line and body == "proof=preserved" for name, _, line, body in requests)
        assert result.returncode == 0, "Native smoke failed"
        print("PASS: macOS native browser routing and behavior")


if __name__ == "__main__":
    main()
