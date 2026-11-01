#!/usr/bin/env python3
"""Real SSH Git + local/remote/SOCKS forwarding and retained network acceptance."""
import asyncio,importlib.util,json,os,pwd,secrets,struct,subprocess,tempfile,uuid,io,tarfile
from pathlib import Path
import websockets
spec=importlib.util.spec_from_file_location('live',Path(__file__).with_name('test-server-live.py'))
live=importlib.util.module_from_spec(spec);spec.loader.exec_module(live)

spec=importlib.util.spec_from_file_location('blocks',Path(__file__).with_name('test-server-blocks.py'))
blocks=importlib.util.module_from_spec(spec);spec.loader.exec_module(blocks)

async def echo(reader,writer):
    try:
        data=await reader.read(100);writer.write(data);await writer.drain()
    finally:writer.close();await writer.wait_closed()
async def probe(port,target=None):
    reader,writer=await asyncio.wait_for(asyncio.open_connection('127.0.0.1',port),5)
    try:
        if target:
            writer.write(b'\x05\x01\x00');await writer.drain();assert await reader.readexactly(2)==b'\x05\x00'
            writer.write(b'\x05\x01\x00\x01\x7f\x00\x00\x01'+struct.pack('!H',target));await writer.drain()
            reply=await reader.readexactly(4);assert reply[1]==0
            await reader.readexactly((4 if reply[3]==1 else 16)+2)
        writer.write(b'qterm-network-proof');await writer.drain()
        assert await asyncio.wait_for(reader.readexactly(19),5)==b'qterm-network-proof'
    finally:writer.close();await writer.wait_closed()

async def verify(f):
    f.login(); recovery=f.api('/vault/recovery','POST')['id']; f.api('/vault/recovery/'+recovery)
    f.api('/vault/initialize','POST',dict(recoveryId=recovery,masterPassword=secrets.token_urlsafe(24),savedRecovery=True))
    credential=f.api('/credentials/generate','POST',{'name':'Block SSH'})['id']
    (f.directory/'authorized_keys').write_text(f.api('/credentials/'+credential+'/public-key')+'\n')
    profile=f.api('/profiles','POST',dict(name='Block SSH',host='127.0.0.1',port=f.ssh_port,username=pwd.getpwuid(os.getuid()).pw_name,authPreference='privateKey',credentialId=credential,groupId=None,jumpProfileIds=[]))['id']
    sftp_ws,sftp_id,_=await live.connect(f,profile,credential,'files',runtime_key='files-block')
    blocks.upload(f,'transfer/nested/file.txt',session=sftp_id,base=str(f.directory))
    blocks.upload(f,'transfer/empty',b'',True,session=sftp_id,base=str(f.directory))
    blocks.upload(f,'../escape',status=400,session=sftp_id,base=str(f.directory))
    ticket=f.api('/transfers/download','POST',dict(sessionId=sftp_id,path=str(f.directory/'transfer'),taskId=str(uuid.uuid4()),directory=True))
    with tarfile.open(fileobj=io.BytesIO(f.api('/downloads/'+ticket['id']))) as archive:
        assert archive.extractfile('files/nested/file.txt').read()==b'block-transfer'
        assert archive.getmember('files/empty').isdir()
    await sftp_ws.close()
    print('PASS: real SFTP nested upload, empty directory, traversal rejection and tar download')
    git_ws,git_id,_=await live.connect(f,profile,credential,'git',runtime_key='git-block')
    repo=f.directory/'repo'; repo.mkdir()
    subprocess.run(['git','init',str(repo)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['git','-C',str(repo),'config','user.name','Qterm Fixture'],check=True)
    subprocess.run(['git','-C',str(repo),'config','user.email','fixture@example.invalid'],check=True)
    (repo/'file.txt').write_text('remote git proof\n')
    def git(action):return f.api('/git/remote_execute','POST',dict(sessionId=git_id,profileId=profile,action=action))
    snap=git(dict(type='snapshot',path=str(repo)));assert snap['changes'][0]['path']=='file.txt'
    git(dict(type='stageAll',repository=str(repo)))
    snap=git(dict(type='commit',repository=str(repo),message='SSH Git proof'));assert snap['head']['oid']
    files=f.api('/git/remote_commit_files','POST',dict(sessionId=git_id,profileId=profile,repository=str(repo),oid=snap['head']['oid']));assert files[0]['path']=='file.txt'
    net_ws,net_id,_=await live.connect(f,profile,credential,'network',runtime_key='network-block')
    server=await asyncio.start_server(echo,'127.0.0.1',0);target=server.sockets[0].getsockname()[1]
    rules=[]
    try:
        for kind in ['local','remote','socks5']:
            port=live.port();payload=dict(type=kind,profileId=profile,name=kind,bindHost='127.0.0.1',bindPort=port)
            if kind!='socks5':payload.update(targetHost='127.0.0.1',targetPort=target)
            rule=f.api('/network/rules','POST',payload);rules.append((rule['id'],port,kind))
            f.api('/network/start','POST',dict(sessionId=net_id,ruleId=rule['id']))
            await probe(port,target if kind=='socks5' else None)
            f.api('/network/rules/'+rule['id'],'DELETE',status=409)
        await net_ws.close();await git_ws.close()
        f.api('/logout','POST',status=204);f.login()
        sessions=f.api('/runtime/sessions');network=next(s for s in sessions if s['runtimeKey']=='network-block')
        assert network['sessionId']==net_id and len(network['ruleStates'])==3
        assert next(s for s in sessions if s['runtimeKey']=='git-block')['sessionId']==git_id
        for rule,port,kind in rules:await probe(port,target if kind=='socks5' else None)
        # Reattach with new access proof; no password or new SSH process needed.
        ws=await websockets.connect(f'ws://localhost:{f.http_port}/api/v1/runtime/attach',origin=f.origin,extra_headers={'Cookie':f.cookie})
        await ws.send(json.dumps({**f.proof(),'version':2,'sessionId':net_id}))
        ready=await live.receive(ws);assert ready['type']=='ready' and ready['sessionId']==net_id
        await ws.close()
        for rule,port,kind in rules:
            f.api('/network/stop','POST',dict(sessionId=net_id,ruleId=rule))
            f.api('/network/rules/'+rule,'DELETE')
        assert f.api('/network/rules')==[]
        # Existing SSH Git still works after logout vault lock.
        assert git(dict(type='snapshot',path=str(repo)))['head']['oid']==snap['head']['oid']
        print('PASS: real remote Git; local/remote/SOCKS5 TCP; active-rule protection; logout/reattach same sessions and listeners; stop/delete')
    finally:
        server.close();await server.wait_closed()

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='qterm-blocks-ssh-') as directory:
        f=live.Fixture(directory)
        try:asyncio.run(asyncio.wait_for(verify(f),120))
        finally:f.close()
