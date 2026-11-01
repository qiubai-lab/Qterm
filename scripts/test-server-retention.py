#!/usr/bin/env python3
"""Isolated retained PTY acceptance; build server and pnpm build:server-screen first."""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
import re
import tempfile
from websockets.legacy.client import connect

spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('test-server-local.py'))
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

async def attach(f, key='retained-test'):
    ws=await connect(f'ws://localhost:{f.port}/api/v1/local/sessions',origin=f.origin,extra_headers={'Cookie':f.cookie})
    await ws.send(json.dumps({'version':1,'runtimeKey':key,'columns':90,'rows':30,'osc7Enabled':True,'initialDirectory':f.cwd}))
    ready=await fixture.receive(ws)
    assert ready['type']=='ready',ready
    output=b''
    while True:
        value=await fixture.receive(ws)
        if isinstance(value,bytes):output+=value
        elif value.get('type')=='restored':break
    return ws,ready,output

async def verify(f):
    f.login()
    if f.windows:
        f.api('/settings/terminal','PUT',{'historyFreeBashEnabled':False})
    ws,ready,_=await attach(f)
    identifier=ready['sessionId']
    workspace=f.api('/workspace')
    assert any(w['layout'].get('blockId')=='retained-test' for w in workspace['document']['workspaces'])
    assert f.api('/workspace')==workspace
    if f.windows:
        await ws.send(b'set QTERM_RETAIN=original\r')
        await ws.send(b'powershell -NoProfile -Command "Start-Sleep -Seconds 2; Write-Output (\'detached-\'+\'complete\')"\r')
    else:
        await ws.send(b"printf 'session-pid=%s\\n' $$; (sleep 2; printf 'detached-%s\\n' complete) &\r")
        first=await fixture.output_until(ws,rb'session-pid=([0-9]+)\r?\n')
        pid=re.search(rb'session-pid=([0-9]+)',first)[1]
    await ws.close()
    await asyncio.sleep(3)
    f.api('/logout','POST',status=204)
    f.login()
    ws,ready,snapshot=await attach(f)
    assert ready['sessionId']==identifier
    assert b'detached-complete' in snapshot,snapshot[-1000:]
    if f.windows:
        await ws.send(b'echo retained-%QTERM_RETAIN%\r')
        await fixture.output_until(ws,rb'retained-original')
    else:
        await ws.send(b"printf 'same-pid=%s\\n' $$\r")
        await fixture.output_until(ws,rb'same-pid='+pid+rb'\r?\n')
        # Full-screen mode, colors, Unicode and cursor position survive detachment.
        await ws.send("printf '\\033[?1049h\\033[2J\\033[3;8H\\033[31m中文 CLI state\\033[0m'; sleep 1\r".encode())
        await fixture.output_until(ws,'中文 CLI state'.encode())
        await ws.close()
        ws,ready,snapshot=await attach(f)
        assert '中文 CLI state'.encode() in snapshot
        assert b'1049h' in snapshot
    # Second view is read-only and cannot terminate the first view's process.
    other,second,_=await attach(f)
    assert second['readOnly'] is True
    await ws.close()
    while True:
        event=await fixture.receive(other)
        if isinstance(event,dict) and event.get('type')=='access':
            assert event['readOnly'] is False
            break
    ws=other
    if not f.windows:
        await ws.send(b"printf '\\033[?1049l'\r")
    await ws.send(json.dumps({'type':'close'}))
    await asyncio.wait_for(ws.wait_closed(),5)
    assert all(s['sessionId']!=identifier for s in f.api('/runtime/sessions'))
    print('PASS: browser detach, logout/relogin, original PID, offline output, alternate screen/Unicode, read-only second attachment, control handoff, explicit stop')

with tempfile.TemporaryDirectory(prefix='qterm-retained-') as directory:
    parser=argparse.ArgumentParser()
    parser.add_argument('--container',action='store_true')
    f=fixture.Fixture(directory,parser.parse_args().container)
    try:asyncio.run(verify(f))
    finally:f.close()
