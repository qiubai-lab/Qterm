"""Test-only route gateway. Every upstream byte travels through OpenSSH SOCKS."""
import json
import select
import socket
import socketserver
import struct
import threading
import urllib.parse
import urllib.request


def exact(sock, count):
    data = b''
    while len(data) < count:
        part = sock.recv(count - len(data))
        if not part:
            raise EOFError()
        data += part
    return data


def ssh_socket(environment):
    if environment.master.poll() is not None:
        raise ConnectionError('SSH disconnected')
    sock = socket.create_connection(('127.0.0.1', environment.socks_port), timeout=4)
    try:
        sock.sendall(b'\x05\x01\x00')
        assert exact(sock, 2) == b'\x05\x00'
        sock.sendall(b'\x05\x01\x00\x01\x7f\x00\x00\x01' + struct.pack('!H', environment.target_port))
        response = exact(sock, 4)
        if response[1] != 0:
            raise ConnectionError('SSH target refused')
        size = 4 if response[3] == 1 else 16 if response[3] == 4 else exact(sock, 1)[0]
        exact(sock, size + 2)
        return sock
    except BaseException:
        sock.close()
        raise


def read_headers(sock):
    data = b''
    while b'\r\n\r\n' not in data:
        data += exact(sock, 1)
        if len(data) > 32768:
            raise ValueError('oversized headers')
    return data.decode('iso-8859-1').split('\r\n')


def relay(client, upstream):
    while True:
        readable, _, _ = select.select([client, upstream], [], [], 12)
        if not readable:
            return
        for source in readable:
            chunk = source.recv(65536)
            if not chunk:
                return
            (upstream if source is client else client).sendall(chunk)


class Gateway(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def __init__(self, environment, token, socks=False):
        super().__init__(('127.0.0.1', 0), Handler)
        self.environment, self.token, self.socks = environment, token, socks
        self.broker_port = None
        self.broker_ready = threading.Event()
        self.records = []
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def cookie(self, path):
        if not self.broker_ready.wait(5):
            raise ConnectionError('native Cookie owner unavailable')
        query = urllib.parse.urlencode({'profile': self.environment.name, 'url': 'http://localhost:3000' + path})
        request = urllib.request.Request(f'http://127.0.0.1:{self.broker_port}/header?{query}',
                                         headers={'Authorization': 'Bearer ' + self.token})
        # Ignore all machine/system/environment proxy settings for internal control RPC.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=4) as response:
            return json.load(response)['cookie']


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        client.settimeout(10)
        handshake_done = False
        try:
            if self.server.socks:
                version, size = exact(client, 2)
                if version != 5 or 0 not in exact(client, size):
                    return
                client.sendall(b'\x05\x00')
                request = exact(client, 4)
                if request[:3] != b'\x05\x01\x00' or request[3] != 3:
                    return
                host = exact(client, exact(client, 1)[0]).decode()
                port = struct.unpack('!H', exact(client, 2))[0]
                if host != 'localhost.qterm-tunnel.invalid' or port != 3000:
                    return
                client.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00')
            handshake_done = True
            lines = read_headers(client)
            values = dict(line.split(':', 1) for line in lines[1:] if ':' in line)
            headers = {key.lower(): value.strip() for key, value in values.items()}
            path = lines[0].split()[1]
            if not path.startswith('/') or path.startswith('//'):
                return
            if self.server.socks:
                if headers.get('origin') != 'http://localhost:3000' or headers.get('upgrade', '').lower() != 'websocket':
                    return
                cookie = self.server.cookie(path)
                lines = [line for line in lines if line and not line.lower().startswith(('host:', 'cookie:'))]
                lines += ['Host: localhost:3000', 'Cookie: ' + cookie]
            else:
                if headers.get('x-probe-route') != self.server.token or headers.get('host') != 'localhost:3000':
                    return
                lines = [line for line in lines if line and not line.lower().startswith('x-probe-route:')]
            self.server.records.append({'profile': self.server.environment.name, 'path': path, 'socket': self.server.socks})
            with ssh_socket(self.server.environment) as upstream:
                upstream.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode('iso-8859-1'))
                relay(client, upstream)
        except (OSError, ValueError, EOFError, AssertionError):
            if handshake_done:
                try:
                    client.sendall(b'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
                except OSError:
                    pass
