"""Byte-transparent SOCKS fixture: remap only the TCP destination, through real SSH."""
import ipaddress
import socket
import socketserver
import struct
import threading

from gateway import exact, relay, ssh_socket


class Gateway(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def __init__(self, environment):
        super().__init__(('127.0.0.1', 0), Handler)
        self.environment = environment
        self.records = []
        threading.Thread(target=self.serve_forever, daemon=True).start()


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        client.settimeout(10)
        connected = False
        try:
            version, size = exact(client, 2)
            if version != 5 or 0 not in exact(client, size):
                return
            client.sendall(b'\x05\x00')
            version, command, reserved, kind = exact(client, 4)
            if (version, command, reserved) != (5, 1, 0):
                raise ValueError('only SOCKS CONNECT is supported')
            if kind == 3:
                host = exact(client, exact(client, 1)[0]).decode('ascii')
            elif kind in (1, 4):
                host = str(ipaddress.ip_address(exact(client, 4 if kind == 1 else 16)))
            else:
                raise ValueError('unsupported address')
            port = struct.unpack('!H', exact(client, 2))[0]
            entry = dict(profile=self.server.environment.name, host=host, port=port, connected=False)
            self.server.records.append(entry)
            if host not in ('localhost', '127.0.0.1', '::1') or port != 3000:
                raise ValueError('destination outside fixture allowlist')
            with ssh_socket(self.server.environment) as upstream:
                client.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00')
                connected = entry['connected'] = True
                relay(client, upstream)
        except (OSError, ValueError, EOFError, AssertionError):
            if not connected:
                try:
                    client.sendall(b'\x05\x01\x00\x01\x00\x00\x00\x00\x00\x00')
                except OSError:
                    pass


class Sentinel(socketserver.ThreadingTCPServer):
    """Catches direct browser loopback access; never forwards to a fixture."""
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, ipv6=False):
        self.address_family = socket.AF_INET6 if ipv6 else socket.AF_INET
        super().__init__(('::1' if ipv6 else '127.0.0.1', 3000), SentinelHandler)
        self.hits = 0
        threading.Thread(target=self.serve_forever, daemon=True).start()


class SentinelHandler(socketserver.BaseRequestHandler):
    def handle(self):
        self.server.hits += 1
        self.request.sendall(b'HTTP/1.1 503 Direct-localhost-bypass\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
