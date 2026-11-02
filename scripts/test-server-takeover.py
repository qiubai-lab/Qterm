#!/usr/bin/env python3
"""Isolated exclusive-workbench acceptance. No user services or credentials used."""
import argparse
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import secrets
import tempfile
from websockets.legacy.client import connect
from websockets.exceptions import InvalidStatusCode

spec=importlib.util.spec_from_file_location('local_fixture',Path(__file__).with_name('test-server-local.py'))
local=importlib.util.module_from_spec(spec);spec.loader.exec_module(local)

def other(f,shared_cookie=False):
    client=copy.copy(f)
    client.client_id=secrets.token_hex(16)
    client.cookie=f.cookie if shared_cookie else ''
    client.access_key=f.access_key if shared_cookie else ''
    return client

async def presence(f):
    ws=await connect(f'ws://localhost:{f.port}/api/v1/access',origin=f.origin,extra_headers={'Cookie':f.cookie})
    await ws.send(json.dumps(f.proof()))
    assert json.loads(await ws.recv())['type']=='ready'
    return ws

async def terminal(f):
    ws=await connect(f'ws://localhost:{f.port}/api/v1/local/sessions',origin=f.origin,extra_headers={'Cookie':f.cookie})
    await ws.send(json.dumps({**f.proof(),'version':1,'runtimeKey':'takeover-proof','columns':90,'rows':30,'osc7Enabled':True,'initialDirectory':f.cwd}))
    ready=await local.receive(ws)
    assert ready['type']=='ready',ready
    screen=b''
    while True:
        frame=await local.receive(ws)
        if isinstance(frame,bytes):screen+=frame
        elif frame.get('type')=='restored':return ws,ready['sessionId'],screen

def take(f,ticket):
    reply=f.api('/access/takeover','POST',{'ticket':ticket,'clientId':f.client_id})
    assert reply['authenticated'];f.access_key=reply['accessKey']

async def verify(f):
    f.login()
    master=secrets.token_urlsafe(24)
    recovery=f.api('/vault/recovery','POST')['id']
    f.api('/vault/recovery/'+recovery)
    f.api('/vault/initialize','POST',{'recoveryId':recovery,'masterPassword':master,'savedRecovery':True})
    first_presence=await presence(f)
    if f.windows:f.api('/settings/terminal','PUT',{'historyFreeBashEnabled':False})
    ws,identifier,_=await terminal(f)
    command=b'set QTERM_TAKEOVER=survived\recho ready-proof\r' if f.windows else b"export QTERM_TAKEOVER=survived; printf 'ready-%s\\n' proof\r"
    await ws.send(command);await local.output_until(ws,b'ready-proof')
    layout=f.api('/workspace')
    f.api('/runtime/panes/takeover-proof:local','PUT',{'revision':0,'value':{'content':'unsaved takeover draft'}})
    # Copying sessionStorage and Cookie must not give a second document access.
    duplicate=other(f,True)
    occupied=duplicate.api('/access/resume','POST',duplicate.proof())
    assert occupied['authenticated'] is False
    duplicate.api('/workspace',status=401)
    assert f.api('/workspace')==layout
    # Checking occupancy or cancelling the dialog leaves all original access intact.
    next_client=other(f)
    prompt=next_client.api('/login','POST',{'password':f.password,'clientId':next_client.client_id})
    assert not prompt['authenticated'] and not next_client.cookie
    assert f.api('/auth')['authenticated']
    rival=other(f)
    late=rival.api('/login','POST',{'password':f.password,'clientId':rival.client_id})
    take(next_client,prompt['takeoverTicket'])
    async def wait_revoked():
        while True:
            event=json.loads(await first_presence.recv())
            if event['type']=='revoked':return event
    assert (await asyncio.wait_for(wait_revoked(),5))['reason']=='sessionReplaced'
    await asyncio.wait_for(ws.wait_closed(),5)
    f.api('/workspace',status=401)
    # Shared cookies alone cannot revive the old page.
    f.cookie=next_client.cookie
    f.api('/profiles','POST',{},status=401)
    f.api('/local/files/write','POST',{},status=401)
    f.api('/logout','POST',status=401)
    f.api('/runtime/sessions/'+identifier,'DELETE',status=401)
    rival.api('/access/takeover','POST',{'ticket':late['takeoverTicket'],'clientId':rival.client_id},status=409)
    assert next_client.api('/terminal-lock')['locked']
    for path in ['/workspace','/runtime/sessions','/credentials']:
        assert next_client.api(path,status=423)['code']=='terminalLocked'
    try:
        await terminal(next_client)
        raise AssertionError('locked takeover admitted a terminal socket')
    except InvalidStatusCode as error:
        assert error.status_code==423
    next_client.api('/terminal-lock/unlock','POST',{'masterPassword':'wrong-master-password'},status=400)
    assert next_client.api('/terminal-lock')['locked']
    assert next_client.api('/access/resume','POST',next_client.proof())['authenticated']
    assert next_client.api('/terminal-lock')['locked']
    assert not next_client.api('/terminal-lock/unlock','POST',{'masterPassword':master})['locked']
    next_presence=await presence(next_client)
    resumed,same_id,screen=await terminal(next_client)
    assert same_id==identifier and b'ready-proof' in screen
    assert next_client.api('/workspace')==layout
    assert next_client.api('/runtime/panes/takeover-proof:local')['value']['content']=='unsaved takeover draft'
    await resumed.send(b'echo env-%QTERM_TAKEOVER%\r' if f.windows else b"printf 'env-%s\\n' \"$QTERM_TAKEOVER\"\r")
    await local.output_until(resumed,b'env-survived')
    # Refresh has a new document ID, but keeps the stored proof and resumes after detach.
    await next_presence.close();await resumed.close()
    refresh=other(next_client,True)
    reply=refresh.api('/access/resume','POST',refresh.proof())
    assert reply['authenticated']
    refresh.access_key=reply['accessKey']
    refresh_presence=await presence(refresh)
    refreshed,same_id,_=await terminal(refresh)
    assert same_id==identifier
    await refreshed.close();await refresh_presence.close()
    print('PASS: occupancy/cancel, copied tab isolation, takeover master-password lock, HTTP/WS denial before unlock, wrong password and locked resume, immediate revocation, same PTY/environment/layout/draft after unlock, refresh resume')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--container',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='qterm-takeover-') as directory:
        fixture=local.Fixture(directory,args.container)
        try:asyncio.run(verify(fixture))
        finally:fixture.close()
