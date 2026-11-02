#!/usr/bin/env python3
"""Isolated HTTP/WebSocket access journal acceptance; build qterm-server first.
Requires websockets. Uses only temporary data, listeners and generated credentials.
"""
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import secrets
import tempfile
from websockets.legacy.client import connect

spec = importlib.util.spec_from_file_location("local_fixture", Path(__file__).with_name("test-server-local.py"))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


async def presence(fixture):
    ws = await connect(f"ws://localhost:{fixture.port}/api/v1/access", origin=fixture.origin,
                       extra_headers={"Cookie": fixture.cookie})
    await ws.send(json.dumps(fixture.proof()))
    assert json.loads(await ws.recv())["type"] == "ready"
    return ws


async def run():
    with tempfile.TemporaryDirectory(prefix="qterm-access-log-") as directory:
        fixture = local.Fixture(directory)
        old_socket = new_socket = None
        try:
            fixture.api("/access-log", status=401)
            fixture.api("/login", "POST", {"password": "incorrect-test-secret", "clientId": fixture.client_id}, status=401)
            fixture.login()
            async with connect(f"ws://localhost:{fixture.port}/api/v1/access", origin=fixture.origin,
                               extra_headers={"Cookie": fixture.cookie}) as invalid:
                await invalid.send("invalid-proof-json")
                await asyncio.wait_for(invalid.wait_closed(), 10)
            old_socket = await presence(fixture)
            before = fixture.api("/access-log")
            assert before["recordingHealthy"]
            old_session = next(e["source"]["session"] for e in before["entries"] if e["kind"] == "login" and e["success"])
            peer = copy.copy(fixture)
            peer.client_id = secrets.token_hex(16)
            peer.cookie = peer.access_key = ""
            pending = peer.api("/login", "POST", {"password": peer.password, "clientId": peer.client_id})
            admitted = peer.api("/access/takeover", "POST", {"ticket": pending["takeoverTicket"], "clientId": peer.client_id})
            peer.access_key = admitted["accessKey"]
            while True:
                message = json.loads(await asyncio.wait_for(old_socket.recv(), 10))
                if message["type"] == "revoked":
                    assert message["reason"] == "sessionReplaced"
                    break
            await asyncio.wait_for(old_socket.wait_closed(), 10)
            new_socket = await presence(peer)
            await new_socket.close()
            fixture.api("/access-log", status=401)
            # Wait for the server's disconnect observer, rather than assuming close ordering.
            async def wait_for_disconnect():
                while True:
                    page = peer.api("/access-log")
                    if any(e["kind"] == "disconnected" and e["source"]["session"] != old_session for e in page["entries"]):
                        return page
                    await asyncio.sleep(0.02)
            page = await asyncio.wait_for(wait_for_disconnect(), 10)
            kinds = {e["kind"] for e in page["entries"]}
            assert {"login", "takeover", "connected", "disconnected", "revoked", "accessDenied"} <= kinds
            assert any(e["kind"] == "revoked" and e["source"]["session"] == old_session for e in page["entries"])
            assert all(e["source"]["ip"] == "127.0.0.1" for e in page["entries"])
            failures = peer.api("/access-log?kind=login&success=false")
            assert len(failures["entries"]) == 1 and failures["entries"][0]["reason"] == "invalidPassword"
            retained = {e["id"] for e in page["entries"]}
            sensitive = [fixture.password, fixture.access_key, peer.access_key, pending["takeoverTicket"], "incorrect-test-secret"]
            peer.api("/logout", "POST", status=204)
        finally:
            if old_socket:
                await old_socket.close()
            if new_socket:
                await new_socket.close()
            fixture.close()
        raw = "".join(path.read_text() for path in (Path(directory) / "data/logs/access").glob("*.jsonl"))
        assert all(secret not in raw for secret in sensitive)
        restarted = local.Fixture(directory)
        try:
            restarted.login()
            page = restarted.api("/access-log")
            assert retained <= {e["id"] for e in page["entries"]}
            assert any(e["kind"] == "logout" for e in page["entries"])
            assert page["recordingHealthy"]
        finally:
            restarted.close()
        print("PASS: HTTP/WS login, takeover, revocation, peer IP, filtering, secret exclusion and restart persistence")


if __name__ == "__main__":
    asyncio.run(run())
