#!/usr/bin/env python3
"""Linux fault injection against an isolated server only; never touches user services.
Build qterm-server and pnpm build:server-screen first. Requires websockets.
"""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import tempfile
from websockets.legacy.client import connect

spec = importlib.util.spec_from_file_location('local_fixture', Path(__file__).with_name('test-server-local.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

async def attach(f, key):
    ws = await connect(f'ws://localhost:{f.port}/api/v1/local/sessions', origin=f.origin,
                       extra_headers={'Cookie': f.cookie})
    await ws.send(json.dumps({**f.proof(), 'version': 1, 'runtimeKey': key, 'columns': 90,
                              'rows': 30, 'osc7Enabled': True, 'initialDirectory': f.cwd}))
    ready = await local.receive(ws)
    assert ready['type'] == 'ready', ready
    assert not ready.get('failure'), ready
    output = b''
    while True:
        frame = await local.receive(ws)
        if isinstance(frame, bytes):
            output += frame
        elif frame.get('type') == 'restored':
            return ws, ready['sessionId'], output


def kill_fixture_worker(f):
    # Only direct children of this script's freshly spawned fixture are eligible.
    children = set()
    for task in Path(f'/proc/{f.process.pid}/task').glob('*/children'):
        try:
            children.update(task.read_text().split())
        except FileNotFoundError:
            pass
    workers = []
    for child in children:
        args = Path(f'/proc/{child}/cmdline').read_bytes().split(b'\0')
        if any(value.endswith(b'/dist-server/screen.mjs') for value in args):
            workers.append(int(child))
    assert len(workers) == 1, workers
    os.kill(workers[0], signal.SIGKILL)


async def verify(f):
    f.login()
    first, identifier, _ = await attach(f, 'recovery-first')
    second, other_identifier, _ = await attach(f, 'recovery-second')
    await first.send(b"export QTERM_SCREEN_TEST=survived; printf 'original-pid=%s\n' $$\r")
    output = await local.output_until(first, rb'original-pid=([0-9]+)\r?\n')
    pid = re.search(rb'original-pid=([0-9]+)', output)[1]
    # An externally killed worker must reconstruct both screens on reconnect.
    await first.close()
    await second.close()
    kill_fixture_worker(f)
    first, same_id, screen = await attach(f, 'recovery-first')
    assert same_id == identifier and b'original-pid=' + pid in screen
    second, same_other_id, _ = await attach(f, 'recovery-second')
    assert same_other_id == other_identifier
    # Also recover while attached and producing output, without restarting the shell.
    kill_fixture_worker(f)
    await first.send(b"printf 'recovered-%s-pid=%s\n' \"$QTERM_SCREEN_TEST\" $$\r")
    await local.output_until(first, rb'recovered-survived-pid=' + pid + rb'\r?\n')
    await first.close()
    first, same_id, screen = await attach(f, 'recovery-first')
    assert same_id == identifier and b'recovered-survived-pid=' + pid in screen
    # New terminals remain available after the failure as well.
    third, _, _ = await attach(f, 'recovery-new')
    await first.close()
    await second.close()
    await third.close()
    print('PASS: killed worker recovery, multiple screens, original PTY/PID/environment, offline snapshot, active output, new terminals')


if __name__ == '__main__':
    if not Path('/proc/self/task').exists():
        raise SystemExit('This isolated process-kill acceptance requires Linux; Rust recovery tests are cross-platform.')
    with tempfile.TemporaryDirectory(prefix='qterm-screen-recovery-') as directory:
        fixture = local.Fixture(directory)
        try:
            asyncio.run(verify(fixture))
        finally:
            fixture.close()
