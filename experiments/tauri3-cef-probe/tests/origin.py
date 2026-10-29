"""Extend the previous HTTP/WS fixture with a first-party Service Worker."""
import json
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
from origin_server import Handler as PreviousHandler


class Handler(PreviousHandler):
    def do_GET(self):
        if urlsplit(self.path).path != '/sw.js':
            return super().do_GET()
        # Distinct server-owned response lets tests detect shared SW/cache storage.
        identity = json.dumps(self.server.identity)
        source = ("self.addEventListener('install',e=>self.skipWaiting());"
                  "self.addEventListener('activate',e=>e.waitUntil(clients.claim()));"
                  "self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/sw-identity')"
                  f"e.respondWith(Promise.resolve(new Response({identity})));" + "});").encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Content-Length', str(len(source)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(source)


def start_origin(identity):
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.identity, server.records = identity, []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
