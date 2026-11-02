#!/usr/bin/env python3
"""Exercise the shipped Compose deployment using qterm-server:local.

Requires Docker Compose and the built image. Uses an isolated project, random
loopback port, generated password and temporary bind directory; never reads .env.
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
    data_directory = directory / "data"
    data_directory.mkdir()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    endpoint = f"http://localhost:{port}"
    # Connect locally while exercising the default remote-HTTP origin policy.
    origin = f"http://192.0.2.10:{port}"
    env = {**os.environ, "QTERM_IMAGE": os.environ.get("QTERM_TEST_IMAGE", "qterm-server:local"), "QTERM_PORT": str(port),
           "QTERM_PUBLIC_ORIGIN": origin, "QTERM_PASSWORD_SOURCE_FILE": str(password_file),
           "QTERM_BIND_HOST": "127.0.0.1", "QTERM_ALLOW_INSECURE_HTTP": ""}
    command = ["docker", "compose", "--env-file", os.devnull, "--project-directory", str(directory), "--project-name",
               "qterm-ci-" + secrets.token_hex(6), "-f", str(ROOT / "compose.yaml")]

    def compose(*args, capture=False):
        return subprocess.run(command + list(args), env=env, check=True,
                              text=True, stdout=subprocess.PIPE if capture else None)

    def get(path):
        with urllib.request.urlopen(endpoint + path, timeout=10) as response:
            assert response.status == 200
            return response.read(), response.headers

    try:
        config = json.loads(compose("config", "--format", "json", capture=True).stdout)
        mounts = config["services"]["qterm"]["volumes"]
        assert any(m["target"] == "/data" and m["type"] == "bind"
                   and Path(m["source"]) == data_directory for m in mounts)
        compose("up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "90")
        container = compose("ps", "-q", "qterm", capture=True).stdout.strip()
        info = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
        assert info["State"]["Health"]["Status"] == "healthy"
        assert info["Config"]["User"] == "root"
        assert not info["HostConfig"]["ReadonlyRootfs"]
        assert not info["HostConfig"]["Privileged"]
        assert info["HostConfig"]["NetworkMode"] == "host"
        assert not info["HostConfig"].get("PortBindings")
        assert f"QTERM_LISTEN=127.0.0.1:{port}" in info["Config"]["Env"]
        assert "QTERM_ALLOW_INSECURE_HTTP=true" in info["Config"]["Env"]
        assert any(m["Destination"] == "/data" and m["Type"] == "bind"
                   and Path(m["Source"]) == data_directory for m in info["Mounts"])
        get("/healthz")
        html, headers = get("/")
        assert "text/html" in headers["Content-Type"]
        scripts = re.findall(rb'<script[^>]+src="([^"]+)"', html)
        assert scripts, "web bundle is missing from the image"
        for script in scripts:
            asset, headers = get(script.decode())
            assert asset and "javascript" in headers["Content-Type"]
        request = urllib.request.Request(endpoint + "/api/v1/login",
            data=json.dumps({"password": password, "clientId": "compose-fixture"}).encode(),
            headers={"Origin": origin, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            assert json.load(response)["authenticated"]
            assert "HttpOnly" in response.headers["Set-Cookie"]
        compose("exec", "-T", "qterm", "sh", "-c", "test -w /data/home && echo retained > /data/home/compose-proof")
        assert (data_directory / "home" / "compose-proof").read_text().strip() == "retained"
        verify_runtime(compose)
        compose("up", "-d", "--force-recreate", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "90")
        assert compose("exec", "-T", "qterm", "cat", "/data/home/compose-proof", capture=True).stdout.strip() == "retained"
        get("/healthz")
        compose("exec", "-T", "qterm", "su", "-", "qterm", "-c", "test -w \"$HOME\"")
        print("PASS: host networking, custom port/health, default remote HTTP, login, minimal Ubuntu/root, apt, UID switching and bind persistence")
    except BaseException:
        subprocess.run(command + ["logs", "--no-color", "--tail", "100"], env=env, check=False)
        raise
    finally:
        # Clean only the explicit temporary path, even if Compose validation fails.
        # Root-owned service files otherwise prevent non-root CI from cleaning up.
        compose("down", "--remove-orphans")
        if any(data_directory.iterdir()):
            subprocess.run(["docker", "run", "--rm", "--network", "none", "--user", "0:0",
                            "--entrypoint", "find", "--mount", f"type=bind,src={data_directory},dst=/fixture",
                            env["QTERM_IMAGE"], "/fixture", "-mindepth", "1", "-delete"], check=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="qterm-compose-") as directory:
        verify(Path(directory))
