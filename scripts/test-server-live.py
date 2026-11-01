#!/usr/bin/env python3
"""Isolated HTTP/WS/SSH/SFTP acceptance test. Requires OpenSSH and python3-websockets.
Run after cargo build -p qterm-server: python3 scripts/test-server-live.py
Only starts loopback listeners and writes to its temporary directory.
"""
import asyncio
import json
import os
from pathlib import Path
import pwd
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

import websockets

ROOT = Path(__file__).resolve().parent.parent
BINARY = Path(os.environ.get("QTERM_TEST_BINARY", ROOT / "crates/target/debug/qterm-server"))


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


class Fixture:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.http_port, self.ssh_port = port(), port()
        self.origin = f"http://localhost:{self.http_port}"
        self.cookie = ""
        self.password = secrets.token_urlsafe(24)
        self.processes = []
        hashed = subprocess.check_output([BINARY, "hash-password"], input=self.password.encode())
        (self.directory / "password.hash").write_bytes(hashed)
        self.host_key = self.directory / "host-key"
        self.keygen()
        config = self.directory / "sshd_config"
        config.write_text(f"""Port {self.ssh_port}
ListenAddress 127.0.0.1
HostKey {self.host_key}
PidFile {self.directory}/sshd.pid
AuthorizedKeysFile {self.directory}/authorized_keys
StrictModes no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
UsePAM no
AllowTcpForwarding yes
Subsystem sftp internal-sftp
LogLevel ERROR
""")
        self.ssh = self.spawn(["/usr/sbin/sshd", "-D", "-e", "-f", str(config)], "sshd.log")
        self.start_server()

    def keygen(self):
        for path in (self.host_key, Path(str(self.host_key) + ".pub")):
            path.unlink(missing_ok=True)
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(self.host_key)], check=True)

    def spawn(self, command, log, env=None):
        with (self.directory / log).open("ab") as output:
            process = subprocess.Popen(command, env=env, stdout=output, stderr=output)
        self.processes.append(process)
        return process

    def start_server(self):
        env = dict(os.environ, QTERM_LISTEN=f"127.0.0.1:{self.http_port}", QTERM_PUBLIC_ORIGIN=self.origin,
                   QTERM_DATA_DIR=str(self.directory / "data"), QTERM_ASSETS_DIR=str(ROOT / "dist-web"),
                   QTERM_PASSWORD_HASH_FILE=str(self.directory / "password.hash"))
        self.server = self.spawn([BINARY], "server.log", env)
        for _ in range(100):
            if self.server.poll() is not None:
                raise AssertionError((self.directory / "server.log").read_text())
            try:
                with urllib.request.urlopen(self.origin + "/healthz", timeout=1) as response:
                    if response.status == 200:
                        return
            except OSError:
                time.sleep(0.05)
        raise AssertionError("server startup timed out")

    def request(self, path, method="GET", body=None, status=200, origin=None, raw=None, content_type=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = {"Origin": origin or self.origin, "Cookie": self.cookie}
        if data is not None:
            headers["Content-Type"] = content_type or "application/json"
        request = urllib.request.Request(self.origin + path, data=data, headers=headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        result = response.read()
        assert response.status == status, (path, response.status, result[:500])
        if response.headers.get("Set-Cookie"):
            self.cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        if "application/json" in response.headers.get("Content-Type", ""):
            return json.loads(result)
        return result

    def api(self, path, method="GET", body=None, **kwargs):
        return self.request("/api/v1" + path, method, body, **kwargs)

    def login(self):
        self.api("/login", "POST", {"password": self.password})

    def close(self):
        for process in reversed(self.processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


async def receive(ws):
    value = await asyncio.wait_for(ws.recv(), 15)
    if isinstance(value, bytes):
        await ws.send(json.dumps({"type": "ack", "bytes": len(value)}))
        return value
    return json.loads(value)


async def connect(f, profile, credential, purpose="terminal", changed=False):
    ws = await websockets.connect(f"ws://localhost:{f.http_port}/api/v1/sessions", origin=f.origin,
                                  extra_headers={"Cookie": f.cookie}, max_queue=None)
    await ws.send(json.dumps({"version": 1, "purpose": purpose, "input": {
        "profileId": profile, "auth": {"method": "storedCredential", "credentialId": credential},
        "terminalSize": {"columns": 90, "rows": 30} if purpose == "terminal" else None}}))
    ready = await receive(ws)
    assert ready["type"] == "ready", ready
    confirmations = 0
    while True:
        value = await receive(ws)
        if isinstance(value, bytes):
            continue
        event = value.get("event", {})
        if event.get("type") == "hostKeyConfirmationRequired":
            assert not changed, "changed host key must never be offered for acceptance"
            confirmations += 1
            await ws.send(json.dumps({"type": "acceptHostKey"}))
        if event.get("type") == "hostKeyChanged":
            assert changed
            await ws.close()
            return None, None, confirmations
        if event.get("type") == "failed":
            raise AssertionError(event)
        if event.get("state") == "connected":
            assert not changed
            return ws, ready["sessionId"], confirmations


async def output_contains(ws, marker):
    output = b""
    while marker not in output:
        value = await receive(ws)
        if isinstance(value, bytes):
            output += value
        elif value.get("event", {}).get("type") == "failed":
            raise AssertionError(value)
    return output


async def exercise(f):
    f.api("/profiles", status=401)
    f.api("/login", "POST", {"password": f.password}, origin="https://attacker.test", status=403)
    f.login()
    try:
        async with websockets.connect(f"ws://localhost:{f.http_port}/api/v1/sessions", origin="https://attacker.test", extra_headers={"Cookie": f.cookie}):
            raise AssertionError("cross-origin WebSocket accepted")
    except websockets.exceptions.InvalidStatusCode as error:
        assert error.status_code == 403
    recovery = f.api("/vault/recovery", "POST")["id"]
    master = secrets.token_urlsafe(24)
    initialize = {"recoveryId": recovery, "masterPassword": master, "savedRecovery": True}
    f.api("/vault/initialize", "POST", initialize, status=403)
    assert f.api(f"/vault/recovery/{recovery}")
    f.api("/vault/initialize", "POST", initialize)
    credential = f.api("/credentials/generate", "POST", {"name": "Smoke SSH"})["id"]
    public = f.api(f"/credentials/{credential}/public-key")
    (f.directory / "authorized_keys").write_text(public + "\n")
    profile = f.api("/profiles", "POST", {"name": "Smoke", "host": "127.0.0.1", "port": f.ssh_port,
                    "username": pwd.getpwuid(os.getuid()).pw_name, "authPreference": "privateKey",
                    "credentialId": credential, "groupId": None, "jumpProfileIds": []})["id"]
    terminal, terminal_id, confirmations = await connect(f, profile, credential)
    assert confirmations == 1
    await terminal.send(b"printf 'QTERM_%s\\n' 'LIVE_OK'\n")
    await output_contains(terminal, b"QTERM_LIVE_OK")
    await terminal.send(json.dumps({"type": "resize", "columns": 101, "rows": 37}))
    await terminal.send(b"stty size\n")
    await output_contains(terminal, b"37 101")
    file_ws, session, confirmations = await connect(f, profile, credential, "files")
    assert confirmations == 0, "accepted key must persist across sessions"
    path = str(f.directory / "transfer.txt")
    task = str(uuid.uuid4())
    content = b"Qterm live SFTP\n"
    boundary = "qterm-smoke"
    multipart = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="transfer.txt"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + f"\r\n--{boundary}--\r\n".encode()
    from urllib.parse import urlencode
    upload = "/transfers/upload?" + urlencode({"sessionId": session, "path": path, "taskId": task})
    f.api(upload, "POST", raw=multipart, content_type=f"multipart/form-data; boundary={boundary}")
    document = f.api("/files/read", "POST", {"sessionId": session, "path": path})
    assert document["content"].encode() == content
    f.api("/files/write", "POST", {"sessionId": session, "path": path, "content": "updated\n", "expectedRevision": document["revision"]})
    f.api("/files/write", "POST", {"sessionId": session, "path": path, "content": "stale", "expectedRevision": document["revision"]}, status=400)
    download = f.api("/transfers/download", "POST", {"sessionId": session, "path": path, "taskId": str(uuid.uuid4())})["id"]
    assert f.api(f"/downloads/{download}") == b"updated\n"
    f.api(f"/downloads/{download}", status=400)
    cancelled = str(uuid.uuid4())
    f.api(f"/transfers/{cancelled}/cancel", "POST")
    upload = "/transfers/upload?" + urlencode({"sessionId": session, "path": path, "taskId": cancelled})
    f.api(upload, "POST", raw=multipart, content_type=f"multipart/form-data; boundary={boundary}", status=400)
    f.api("/files/list", "POST", {"sessionId": "not-owned", "path": "/"}, status=403)
    # A slow view reconnects to a fresh screen without killing its process.
    await terminal.send(b"head -c 2097152 /dev/zero\n")
    await asyncio.sleep(2)
    while True:
        frame = await asyncio.wait_for(terminal.recv(), 15)
        if isinstance(frame, str):
            value = json.loads(frame)
            if value.get("type") == "resync":
                break
        else:
            try:
                await terminal.send(json.dumps({"type":"ack","bytes":len(frame)}))
            except websockets.exceptions.ConnectionClosed:
                pass  # Drain already-delivered frames through the resync marker.
    f.api("/logout", "POST", status=204)
    await asyncio.wait_for(file_ws.wait_closed(), 10)
    await asyncio.wait_for(terminal.wait_closed(), 10)
    f.api("/profiles", status=401)
    f.login()
    assert not f.api("/vault")["unlocked"]
    terminal = await websockets.connect(f"ws://localhost:{f.http_port}/api/v1/runtime/attach", origin=f.origin, extra_headers={"Cookie":f.cookie})
    await terminal.send(json.dumps({"version":2,"sessionId":terminal_id}))
    ready = await receive(terminal)
    assert ready["sessionId"] == terminal_id
    while True:
        event = await receive(terminal)
        if isinstance(event,dict) and event.get("type") == "restored": break
    await terminal.send(b"printf 'SSH_%s\\n' RESUMED\n")
    await output_contains(terminal,b"SSH_RESUMED")
    assert f.api("/files/read","POST",{"sessionId":session,"path":path})["content"] == "updated\n"
    await terminal.close()
    f.server.terminate()
    f.server.wait(timeout=10)
    f.start_server()
    f.login()
    assert f.api("/runtime/sessions") == []
    assert f.api("/profiles")[0]["id"] == profile
    assert not f.api("/vault")["unlocked"]
    f.api("/vault/unlock", "POST", {"masterPassword": master})
    ws, _, confirmations = await connect(f, profile, credential, "files")
    assert confirmations == 0
    await ws.close()
    f.ssh.terminate()
    f.ssh.wait(timeout=10)
    f.keygen()
    f.ssh = f.spawn(["/usr/sbin/sshd", "-D", "-e", "-f", str(f.directory / "sshd_config")], "sshd.log")
    for _ in range(100):
        try:
            with socket.create_connection(("127.0.0.1", f.ssh_port), timeout=0.1):
                break
        except OSError:
            await asyncio.sleep(0.05)
    await connect(f, profile, credential, "files", changed=True)
    print("PASS: login/Origin, recovery confirmation, encrypted credentials, SSH/resize, host keys, SFTP/edit/conflict/upload/download/cancel, ownership, slow-view resync, logout/relogin SSH/SFTP retention, restart persistence")


def main():
    with tempfile.TemporaryDirectory(prefix="qterm-live-") as directory:
        fixture = None
        try:
            fixture = Fixture(directory)
            asyncio.run(exercise(fixture))
        except Exception:
            for name in ("server.log", "sshd.log"):
                path = Path(directory) / name
                if path.exists():
                    print(name, path.read_text()[-4000:])
            raise
        finally:
            if fixture:
                fixture.close()


if __name__ == "__main__":
    main()
