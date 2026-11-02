#!/usr/bin/env python3
"""Real SSH acceptance for shared on-demand Git observations. Requires OpenSSH."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import pwd
import subprocess
import tempfile


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


live = module("ssh_fixture", "test-server-live.py")
observation = module("observations", "test-server-observation.py")


async def verify(f):
    f.port = f.http_port
    f.login()
    recovery = f.api("/vault/recovery", "POST")["id"]
    f.api("/vault/recovery/" + recovery)
    f.api("/vault/initialize", "POST", {"recoveryId": recovery, "masterPassword": "isolated-ssh-observation-password", "savedRecovery": True})
    credential = f.api("/credentials/generate", "POST", {"name": "Observation SSH"})["id"]
    (f.directory / "authorized_keys").write_text(f.api(f"/credentials/{credential}/public-key") + "\n")
    profile = f.api("/profiles", "POST", dict(name="Observation SSH", host="127.0.0.1", port=f.ssh_port,
        username=pwd.getpwuid(os.getuid()).pw_name, authPreference="privateKey", credentialId=credential,
        groupId=None, jumpProfileIds=[]))["id"]
    session, session_id, _ = await live.connect(f, profile, credential, "git", runtime_key="observed-git")
    repo = f.directory / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    target = {"kind": "remote", "path": str(repo), "sessionId": session_id, "profileId": profile}
    ws = await observation.channel(f, "/git/events", {"version": 1})
    # A rejected target must not close other subscriptions on the same socket.
    await ws.send(json.dumps({"type": "subscribe", "id": "wrong-owner", "target": {**target, "profileId": "wrong-profile"}}))
    assert (await observation.event(ws, "subscriptionError"))["error"]["code"] == "forbidden"
    for id in ("first", "second"):
        await ws.send(json.dumps({"type": "subscribe", "id": id, "target": target}))
        initial = await observation.event(ws, "repositoryChanged")
        assert initial["revision"] == 1
    assert observation.snapshot(f, target, 1)["changes"] == []
    (repo / "external.txt").write_text("changed outside Qterm\n")
    # The remote sampler runs every 15s only while subscribed.
    changes = [json.loads(await asyncio.wait_for(ws.recv(), 25)), json.loads(await asyncio.wait_for(ws.recv(), 5))]
    assert {v["id"] for v in changes} == {"first", "second"}
    assert changes[0]["revision"] == changes[1]["revision"]
    assert observation.snapshot(f, target, changes[0]["revision"])["changes"][0]["path"] == "external.txt"
    f.api("/git/remote_execute", "POST", {"sessionId": session_id, "profileId": profile, "action": {"type": "stageAll", "repository": str(repo)}})
    mutation = json.loads(await asyncio.wait_for(ws.recv(), 5))
    assert observation.snapshot(f, target, mutation["revision"])["changes"][0]["staged"]
    await ws.close()
    await session.close()
    print("PASS: remote authorization isolation, shared initial snapshot, external SSH change sampling, immediate mutation notification")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="qterm-observation-ssh-") as directory:
        fixture = live.Fixture(directory)
        try:
            asyncio.run(asyncio.wait_for(verify(fixture), 90))
        finally:
            fixture.close()
