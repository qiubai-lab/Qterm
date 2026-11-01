#!/usr/bin/env python3
"""Real local PTY + HTTP acceptance, Linux/macOS/Windows; requires websockets.
Run after building qterm-server. Add --container to test qterm-server:local.
All data and listeners belong to an isolated fixture; no user credentials used.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from websockets.legacy.client import connect
from websockets.exceptions import ConnectionClosed

ROOT = Path(__file__).resolve().parent.parent
BINARY = Path(os.environ.get("QTERM_TEST_BINARY", ROOT / "crates/target/debug" / ("qterm-server.exe" if os.name == "nt" else "qterm-server")))


class Fixture:
    def __init__(self, directory, container=False):
        self.directory = Path(directory)
        self.container = container
        self.windows = os.name == "nt" and not container
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.port = listener.getsockname()[1]
        self.origin = f"http://localhost:{self.port}"
        self.cookie = ""
        self.access_key = ""
        self.client_id = secrets.token_hex(16)
        self.password = secrets.token_urlsafe(24)
        password_file = self.directory / "password"
        password_file.write_text(self.password)
        self.container_name = "qterm-pty-test-" + secrets.token_hex(4)
        env = dict(os.environ)
        env.pop("QTERM_PASSWORD_HASH_FILE", None)
        env.update(QTERM_LISTEN=f"127.0.0.1:{self.port}", QTERM_PUBLIC_ORIGIN=self.origin,
                   QTERM_DATA_DIR=str(self.directory / "data"), QTERM_ASSETS_DIR=str(ROOT / "dist-web"),
                   QTERM_PASSWORD_FILE=str(password_file))
        command = [str(BINARY)]
        if container:
            # Test-only password; enable the image's unprivileged user to read it.
            self.directory.chmod(0o755)
            password_file.chmod(0o644)
            command = ["docker", "run", "--rm", "--name", self.container_name,
                       "--read-only", "--tmpfs", "/tmp", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                       "-p", f"127.0.0.1:{self.port}:8080", "-e", f"QTERM_PUBLIC_ORIGIN={self.origin}",
                       "-e", "QTERM_PASSWORD_FILE=/fixture/password", "-v", f"{self.directory}:/fixture:ro", "qterm-server:local"]
        with (self.directory / "server.log").open("wb") as log:
            self.process = subprocess.Popen(command, env=env, stdout=log, stderr=log)
        self.cwd = "/data/home" if container else str(self.directory)
        for _ in range(200):
            if self.process.poll() is not None:
                raise AssertionError((self.directory / "server.log").read_text())
            try:
                self.request("/healthz")
                return
            except OSError:
                time.sleep(0.05)
        self.close()
        raise AssertionError("server startup timed out")

    def request(self, path, method="GET", body=None, status=200, origin=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.origin + path, data=data, method=method,
            headers={"Origin": origin or self.origin, "Cookie": self.cookie, "Content-Type":"application/json", "X-Qterm-Access":self.access_key,"X-Qterm-Client":self.client_id})
        try:
            response = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        assert response.status == status, (path, response.status, content[:500])
        if response.headers.get("Set-Cookie"):
            self.cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        return json.loads(content) if "application/json" in response.headers.get("Content-Type", "") else content

    def api(self, path, method="GET", body=None, **kwargs):
        return self.request("/api/v1" + path, method, body, **kwargs)

    def login(self):
        reply=self.api("/login", "POST", {"password":self.password,"clientId":self.client_id})
        assert reply["authenticated"], reply
        self.access_key=reply["accessKey"]

    def proof(self):
        return {"accessKey":self.access_key,"clientId":self.client_id}

    def close(self):
        if self.container:
            subprocess.run(["docker", "stop", "-t", "5", self.container_name], stdout=subprocess.DEVNULL, check=False)
        elif self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


async def receive(ws):
    value = await asyncio.wait_for(ws.recv(), 15)
    if isinstance(value, bytes):
        await ws.send(json.dumps({"type":"ack", "bytes":len(value)}))
        return value
    return json.loads(value)


async def open_terminal(f):
    ws = await connect(f"ws://localhost:{f.port}/api/v1/local/sessions", origin=f.origin, extra_headers={"Cookie":f.cookie})
    await ws.send(json.dumps({**f.proof(),"version":1,"columns":90,"rows":30,"osc7Enabled":True,"initialDirectory":f.cwd}))
    ready = await receive(ws)
    assert ready["type"] == "ready", ready
    expected = Path(f.cwd) if f.container else Path(f.cwd).resolve()
    assert Path(ready["cwd"]) == expected, ready
    while True:
        value = await receive(ws)
        if isinstance(value, dict) and value.get("type") == "restored": break
    return ws


async def output_until(ws, pattern):
    output = b""
    async with asyncio.timeout(20):
        while not re.search(pattern, output):
            message = await receive(ws)
            if isinstance(message, bytes):
                output += message
    return output


async def verify(f):
    f.api("/local/capabilities", status=401)
    f.login()
    f.api("/local/files/list", "POST", {"path":f.cwd}, status=403, origin="https://attacker.invalid")
    capabilities = f.api("/local/capabilities")
    assert bool(capabilities["windowsPty"]) == f.windows
    # Disable the optional Bash-only mode so Windows exercises its normal cmd.exe.
    f.api("/settings/terminal", "PUT", {"historyFreeBashEnabled":False})
    ws = await open_terminal(f)
    # Headless terminal answers ConPTY queries even with no browser attached.
    await ws.send(json.dumps({"type":"resize","columns":111,"rows":37}))
    if f.windows:
        await ws.send(b"echo local-pty-proof>pty-proof.txt\r")
        await ws.send(b"type pty-proof.txt\r")
        await output_until(ws, rb"local-pty-proof\r\n")
    else:
        await ws.send(b"printf 'local-%s-proof\\n' pty >pty-proof.txt; cat pty-proof.txt; stty size\r")
        await output_until(ws, rb"37 111\r?\n")
    filepath = str(Path(f.cwd) / "pty-proof.txt")
    document = f.api("/local/files/read", "POST", {"path":filepath})
    assert document["content"].strip() == "local-pty-proof", document
    f.api("/local/files/write", "POST", {"path":filepath,"content":"edited-through-web\n","expectedRevision":document["revision"]})
    await ws.send(b"type pty-proof.txt\r" if f.windows else b"cat pty-proof.txt\r")
    await output_until(ws, rb"edited-through-web\r?\n")
    pid = None
    if not f.windows and not f.container:
        await ws.send(b"printf 'shell-pid=%s\\n' $$; sleep 120\r")
        output = await output_until(ws, rb"shell-pid=([0-9]+)\r?\n")
        pid = int(re.search(rb"shell-pid=([0-9]+)", output)[1])
    children = []
    if pid and Path(f"/proc/{pid}/task/{pid}/children").exists():
        children = Path(f"/proc/{pid}/task/{pid}/children").read_text().split()
    f.api("/logout", "POST", status=204)
    try:
        async with asyncio.timeout(10):
            while True:
                await ws.recv()
    except ConnectionClosed:
        pass
    if pid:
        os.kill(pid, 0)  # Logout revokes access but must preserve the process.
    f.login()
    for session in f.api("/runtime/sessions"):
        f.api("/runtime/sessions/" + session["sessionId"], "DELETE")
    if pid:
        for _ in range(100):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            await asyncio.sleep(0.05)
        else:
            raise AssertionError("explicit stop left the local shell alive")
    for child in children:
        status_file = Path(f"/proc/{child}/stat")
        for _ in range(100):
            if not status_file.exists() or status_file.read_text().split()[2] == "Z":
                break
            await asyncio.sleep(0.05)
        else:
            raise AssertionError("explicit stop left the foreground process alive")
    f.api("/logout", "POST", status=204)
    f.api("/local/files/read", "POST", {"path":filepath}, status=401)
    f.login()
    ws = await open_terminal(f)
    await ws.send(json.dumps({"type":"close"}))
    await asyncio.wait_for(ws.wait_closed(), 10)
    print("PASS: local PTY input/output, cwd, resize, local file edit, origin/auth, logout retention, explicit close cleanup")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="qterm-local-") as directory:
        fixture = Fixture(directory, args.container)
        try:
            asyncio.run(verify(fixture))
        finally:
            fixture.close()


if __name__ == "__main__":
    main()
