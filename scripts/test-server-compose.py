#!/usr/bin/env python3
"""Exercise the shipped Compose deployment using qterm-server:local.

Requires Docker Compose and the built image. Uses an isolated project, random
loopback port, generated password and disposable data volume; never reads .env.
"""
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import urllib.request
from server_container_runtime_checks import verify_runtime

ROOT = Path(__file__).resolve().parent.parent


def verify(directory):
    password = secrets.token_urlsafe(24)
    password_file = directory / "password"
    password_file.write_text(password)
    directory.chmod(0o700)
    password_file.chmod(0o600)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://localhost:{port}"
    env = {**os.environ, "QTERM_IMAGE": os.environ.get("QTERM_TEST_IMAGE", "qterm-server:local"), "QTERM_PORT": str(port),
           "QTERM_PUBLIC_ORIGIN": origin, "QTERM_PASSWORD_SOURCE_FILE": str(password_file),
           "QTERM_BIND_HOST": "127.0.0.1", "QTERM_ALLOW_INSECURE_HTTP": "false"}
    command = ["docker", "compose", "--env-file", os.devnull, "--project-name",
               "qterm-ci-" + secrets.token_hex(6), "-f", str(ROOT / "compose.yaml")]

    def compose(*args, capture=False):
        return subprocess.run(command + list(args), env=env, check=True,
                              text=True, stdout=subprocess.PIPE if capture else None)

    def get(path):
        with urllib.request.urlopen(origin + path, timeout=10) as response:
            assert response.status == 200
            return response.read(), response.headers

    try:
        compose("up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "90")
        container = compose("ps", "-q", "qterm", capture=True).stdout.strip()
        info = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
        assert info["State"]["Health"]["Status"] == "healthy"
        assert info["Config"]["User"] == "root"
        assert not info["HostConfig"]["ReadonlyRootfs"]
        assert not info["HostConfig"]["Privileged"]
        assert info["HostConfig"]["PortBindings"]["8080/tcp"] == [
            {"HostIp": "127.0.0.1", "HostPort": str(port)}]
        assert any(m["Destination"] == "/data" and m["Type"] == "volume" for m in info["Mounts"])
        get("/healthz")
        html, headers = get("/")
        assert "text/html" in headers["Content-Type"]
        scripts = re.findall(rb'<script[^>]+src="([^"]+)"', html)
        assert scripts, "web bundle is missing from the image"
        for script in scripts:
            asset, headers = get(script.decode())
            assert asset and "javascript" in headers["Content-Type"]
        request = urllib.request.Request(origin + "/api/v1/login",
            data=json.dumps({"password": password, "clientId": "compose-fixture"}).encode(),
            headers={"Origin": origin, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            assert json.load(response)["authenticated"]
            assert "HttpOnly" in response.headers["Set-Cookie"]
        compose("exec", "-T", "qterm", "sh", "-c", "test -w /data/home && echo retained > /data/home/compose-proof")
        verify_runtime(compose)
        compose("up", "-d", "--force-recreate", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "90")
        assert compose("exec", "-T", "qterm", "cat", "/data/home/compose-proof", capture=True).stdout.strip() == "retained"
        get("/healthz")
        compose("exec", "-T", "qterm", "su", "-", "qterm", "-c", "test -w \"$HOME\"")
        print("PASS: Compose health, assets, login, minimal Ubuntu/root, apt, UID switching and persistence")
    except BaseException:
        subprocess.run(command + ["logs", "--no-color", "--tail", "100"], env=env, check=False)
        raise
    finally:
        # The random project name ensures only this test's containers/volume are removed.
        compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="qterm-compose-") as directory:
        verify(Path(directory))
