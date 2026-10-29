"""Observable first-party HTTP and RFC6455 test endpoints, two independent identities."""
import base64
import hashlib
import json
import socket
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

WORKER = """
(async()=>{try {
 const socket = await new Promise((resolve,reject)=>{const s=new WebSocket('ws://localhost:3000/ws');s.onmessage=e=>{s.close(1000);resolve(JSON.parse(e.data))};s.onerror=()=>reject(Error('worker socket failed'))});
 const response=await fetch('/echo',{method:'POST',body:'worker-post'}).then(r=>r.json());
 postMessage({socket,response,origin:location.origin});
}catch(e){postMessage({error:String(e)})}})();
"""


def read_exact(stream, count):
    data = stream.read(count)
    if len(data) != count:
        raise EOFError()
    return data


def frame(payload, opcode=1):
    size = len(payload)
    head = bytes([0x80 | opcode, size]) if size < 126 else bytes([0x80 | opcode, 126]) + struct.pack('!H', size)
    return head + payload


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_args):
        pass

    def do_POST(self):
        self.do_GET()

    def do_GET(self):
        parsed = urlsplit(self.path)
        body = self.rfile.read(int(self.headers.get('content-length', '0'))).decode()
        record = dict(profile=self.server.identity, path=self.path,
                      host=self.headers.get('host'), origin=self.headers.get('origin'),
                      cookie=self.headers.get('cookie', ''), body=body)
        self.server.records.append(record)
        if self.headers.get('upgrade', '').lower() == 'websocket':
            self.websocket(record)
            return
        headers, mime = [], 'application/json'
        if parsed.path == '/set':
            headers = [('Set-Cookie', cookie) for cookie in parse_qs(parsed.query)['cookie']]
            payload = b'{}'
        elif parsed.path == '/worker.js':
            mime, payload = 'text/javascript', WORKER.encode()
        elif parsed.path in ('/', '/csp'):
            mime, payload = 'text/html', b'<!doctype html><title>SSH Origin Probe</title><body>fixture</body>'
            if parsed.path == '/csp':
                headers.append(('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'"))
        elif parsed.path == '/slow':
            import time
            time.sleep(1)
            payload = json.dumps(record).encode()
        else:
            payload = json.dumps(record).encode()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(payload)
        except OSError:
            pass

    def websocket(self, record):
        self.connection.settimeout(10)
        key = self.headers['sec-websocket-key']
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        self.wfile.write(frame(json.dumps(record).encode()))
        try:
            while True:
                head = read_exact(self.rfile, 2)
                opcode, size = head[0] & 15, head[1] & 127
                if size == 126:
                    size = struct.unpack('!H', read_exact(self.rfile, 2))[0]
                elif size == 127:
                    size = struct.unpack('!Q', read_exact(self.rfile, 8))[0]
                if size > 65536:
                    raise ValueError('oversized fixture frame')
                mask = read_exact(self.rfile, 4) if head[1] & 128 else None
                payload = read_exact(self.rfile, size)
                if mask:
                    payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                if opcode == 8:
                    self.wfile.write(frame(payload, 8))
                    return
                self.wfile.write(frame(payload, 10 if opcode == 9 else opcode))
        except (OSError, EOFError):
            pass
        finally:
            self.close_connection = True


def start_origin(identity):
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.identity, server.records = identity, []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
