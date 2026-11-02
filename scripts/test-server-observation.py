#!/usr/bin/env python3
"""Isolated real HTTP/WS acceptance for vault state and Git observations.
Build qterm-server first; requires Python websockets, local Git, and dist-web.
"""
import asyncio
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

from websockets.legacy.client import connect
from websockets.exceptions import ConnectionClosed

spec = importlib.util.spec_from_file_location("local_fixture", Path(__file__).with_name("test-server-local.py"))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


async def channel(f, path, hello):
    ws = await connect(f"ws://localhost:{f.port}/api/v1{path}", origin=f.origin, extra_headers={"Cookie": f.cookie})
    await ws.send(json.dumps({**f.proof(), **hello}))
    return ws


async def event(ws, kind):
    async def read():
        while True:
            value = json.loads(await ws.recv())
            if value["type"] == kind:
                return value
    return await asyncio.wait_for(read(), 10)


async def quiet(ws, seconds=1):
    try:
        value = await asyncio.wait_for(ws.recv(), seconds)
    except asyncio.TimeoutError:
        return
    raise AssertionError(f"unexpected event: {value}")


def snapshot(f, target, revision):
    return f.api("/git/observations/snapshot", "POST", {"target": target, "revision": revision})


async def verify(f):
    f.login()
    repo = f.directory / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    target = {"kind": "local", "path": str(repo.resolve())}
    control = await channel(f, "/access", {})
    assert (await event(control, "ready"))["type"] == "ready"
    baseline = await event(control, "vaultStatus")
    assert baseline["initial"] and not baseline["status"]["initialized"]
    recovery = f.api("/vault/recovery", "POST")["id"]
    f.api("/vault/recovery/" + recovery)
    master = "isolated-observation-fixture-password"
    f.api("/vault/initialize", "POST", {"recoveryId": recovery, "masterPassword": master, "savedRecovery": True})
    initialized = await event(control, "vaultStatus")
    assert not initialized["initial"] and initialized["status"]["unlocked"]
    assert set(initialized["status"]) == {"revision", "initialized", "unlocked", "legacy", "reason"}
    data = await channel(f, "/git/events", {"version": 1})
    await data.send(json.dumps({"type": "subscribe", "id": "pane-a", "target": target}))
    first = await event(data, "repositoryChanged")
    assert set(first) == {"type", "id", "revision"}
    assert snapshot(f, target, first["revision"])["changes"] == []
    await data.send(json.dumps({"type": "subscribe", "id": "pane-b", "target": target}))
    shared = await event(data, "repositoryChanged")
    assert shared["id"] == "pane-b" and shared["revision"] == first["revision"]
    await quiet(data)
    (repo / "temporary").write_text("fixture\n")
    (repo / "temporary").rename(repo / "changed.txt")
    updates = [await event(data, "repositoryChanged"), await event(data, "repositoryChanged")]
    assert {v["id"] for v in updates} == {"pane-a", "pane-b"}
    assert updates[0]["revision"] == updates[1]["revision"]
    assert any(c["path"] == "changed.txt" for c in snapshot(f, target, updates[0]["revision"])["changes"])
    f.api("/vault/lock", "POST")
    assert not (await event(control, "vaultStatus"))["status"]["unlocked"]
    assert data.open, "vault-only lock revoked Git data"
    f.api("/vault/lock", "POST")
    await quiet(control)
    f.api("/vault/unlock", "POST", {"masterPassword": master})
    assert (await event(control, "vaultStatus"))["status"]["unlocked"]
    f.api("/terminal-lock/lock", "POST")
    assert (await event(control, "terminalLock"))["locked"]
    try:
        await asyncio.wait_for(data.recv(), 5)
        raise AssertionError("data connection survived terminal lock")
    except ConnectionClosed:
        pass
    f.api("/git/observations/snapshot", "POST", {"target": target, "revision": 1}, status=423)
    f.api("/vault", status=423)
    (repo / "while-locked.txt").write_text("after unlock\n")
    await quiet(control)
    await control.close()
    control = await channel(f, "/access", {})
    await event(control, "ready")
    assert f.api("/terminal-lock")["locked"]
    await quiet(control)
    f.api("/terminal-lock/unlock", "POST", {"masterPassword": master})
    assert not (await event(control, "terminalLock"))["locked"]
    assert (await event(control, "vaultStatus"))["status"]["unlocked"]
    data = await channel(f, "/git/events", {"version": 1})
    await data.send(json.dumps({"type": "subscribe", "id": "resumed", "target": target}))
    resumed = await event(data, "repositoryChanged")
    assert any(c["path"] == "while-locked.txt" for c in snapshot(f, target, resumed["revision"])["changes"])
    await data.close()
    # Closing the socket drops the final subscription and its cached snapshot.
    for _ in range(100):
        try:
            result = f.api("/git/observations/snapshot", "POST", {"target": target, "revision": 1}, status=400)
            assert result["code"] == "invalidRequest"
            break
        except AssertionError:
            await asyncio.sleep(0.05)
    else:
        raise AssertionError("subscription cache survived the last disconnect")
    await control.close()
    print("PASS: vault event baseline/transitions, shared Git invalidations, atomic writes, vault-only lock, terminal lock, refresh, unlock/resync, final unsubscribe")


def main():
    with tempfile.TemporaryDirectory(prefix="qterm-observation-") as directory:
        fixture = local.Fixture(directory)
        try:
            asyncio.run(verify(fixture))
        finally:
            fixture.close()


if __name__ == "__main__":
    main()
