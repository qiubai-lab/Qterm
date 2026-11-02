#!/usr/bin/env python3
"""Real terminal clipboard upload and progress; native/containers or Linux OpenSSH."""
import argparse,asyncio,importlib.util,json,os,secrets,shlex,tempfile,urllib.request,urllib.parse,urllib.error,uuid
from pathlib import Path

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
local=module('local','test-server-local.py')

def upload(f,session,task,content=b'qterm-clipboard-proof',status=200):
    boundary='qterm-clipboard-fixture'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="../name with spaces.txt"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    query=urllib.parse.urlencode(dict(sessionId=session,taskId=task))
    req=urllib.request.Request(f.origin+'/api/v1/terminal/clipboard?'+query,data=body,headers={'Origin':f.origin,'Cookie':f.cookie,'X-Qterm-Access':f.access_key,'X-Qterm-Client':f.client_id,'Content-Type':'multipart/form-data; boundary='+boundary})
    try:response=urllib.request.urlopen(req,timeout=30)
    except urllib.error.HTTPError as error:response=error
    data=response.read();assert response.status==status,(response.status,data)
    return json.loads(data)

async def verify(f,ssh):
    f.login()
    if ssh:
        import pwd
        live=module('live','test-server-live.py')
        rid=f.api('/vault/recovery','POST')['id'];f.api('/vault/recovery/'+rid)
        f.api('/vault/initialize','POST',dict(recoveryId=rid,masterPassword=secrets.token_urlsafe(24),savedRecovery=True))
        credential=f.api('/credentials/generate','POST',{'name':'Clipboard fixture'})['id']
        (f.directory/'authorized_keys').write_text(f.api('/credentials/'+credential+'/public-key')+'\n')
        profile=f.api('/profiles','POST',dict(name='Clipboard fixture',host='127.0.0.1',port=f.ssh_port,username=pwd.getpwuid(os.getuid()).pw_name,authPreference='privateKey',credentialId=credential,groupId=None,jumpProfileIds=[]))['id']
        ws,session,_=await live.connect(f,profile,credential)
    else:
        ws=await local.open_terminal(f)
        session=next(s['sessionId'] for s in f.api('/runtime/sessions') if s['kind']=='local')
    task=str(uuid.uuid4())
    f.api('/transfers/'+task+'/progress',status=404)
    result=upload(f,session,task)
    assert len(result['remotePaths'])==1
    path=result['remotePaths'][0]
    if not ssh:
        raw=path[1:-1] if f.windows else shlex.split(path)[0]
        assert f.api('/local/files/read','POST',dict(path=raw))['content']=='qterm-clipboard-proof'
    assert f.api('/transfers/'+task+'/progress')['transferredBytes']==len(b'qterm-clipboard-proof')
    command=('type ' if not ssh and f.windows else 'cat ')+path+(' & echo. & echo CLIPBOARD-READ-DONE\r' if not ssh and f.windows else '; printf "\\nCLIPBOARD-READ-DONE\\n"\n')
    await ws.send(command.encode())
    # On ConPTY, cursor movement can replace literal line breaks. File content
    # is absent from the input command, so matching it cannot pass on echo alone.
    pattern=b'qterm-clipboard-proof' if not ssh and f.windows else b'qterm-clipboard-proof[\r\n]+CLIPBOARD-READ-DONE'
    output=await local.output_until(ws,pattern)
    assert b'qterm-clipboard-proof' in output
    cancelled=str(uuid.uuid4());f.api('/transfers/'+cancelled+'/cancel','POST')
    upload(f,session,cancelled,status=400)
    upload(f,'missing-session',str(uuid.uuid4()),status=403)
    await ws.close()
    print('PASS: '+('SSH' if ssh else 'local')+' clipboard upload, safe target path, progress, terminal reads exact content, pre-cancel and unknown session rejection')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--ssh',action='store_true');parser.add_argument('--container',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='qterm-clipboard-test-') as directory:
        f=module('live','test-server-live.py').Fixture(directory) if args.ssh else local.Fixture(directory,args.container)
        try:asyncio.run(verify(f,args.ssh))
        finally:f.close()
