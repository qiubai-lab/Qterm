#!/usr/bin/env python3
"""Isolated acceptance for Web file, Git and network block services."""
import argparse, importlib.util, io, json, tempfile, urllib.request, urllib.parse, uuid, tarfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('test-server-local.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def upload(f, relative, content=b'block-transfer', directory=False, status=200, session="local", base=None):
    query=urllib.parse.urlencode(dict(sessionId=session,path=base or f.cwd,taskId=str(uuid.uuid4()),relativePath=relative,directory=str(directory).lower()))
    boundary='qterm-fixture-boundary'
    data=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="file"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    req=urllib.request.Request(f.origin+'/api/v1/transfers/upload?'+query,data=data,headers={'Origin':f.origin,'Cookie':f.cookie,'X-Qterm-Access':f.access_key,'X-Qterm-Client':f.client_id,'Content-Type':'multipart/form-data; boundary='+boundary})
    try:response=urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:response=e
    assert response.status==status,(response.status,response.read())

def verify_files(f):
    f.login()
    if f.cwd.startswith('/'):
        upload(f,f.cwd.strip('/')+'/root-proof.txt',base='/')
        assert f.api('/local/files/read','POST',dict(path=f.cwd+'/root-proof.txt'))['content']=='block-transfer'
    upload(f,'folder/nested/file.txt')
    upload(f,'folder/empty',b'',True)
    upload(f,'../escape',status=400)
    if not f.container and not f.windows:
        link=f.directory/'upload-link'
        link.symlink_to(f.directory/'folder',target_is_directory=True)
        upload(f,'upload-link/rejected.txt',status=400)
        assert not (f.directory/'folder/rejected.txt').exists()
    doc=f.api('/local/files/read','POST',{'path':f.cwd+'/folder/nested/file.txt'})
    assert doc['content']=='block-transfer'
    for directory,path in [(False,'folder/nested/file.txt'),(True,'folder')]:
        reply=f.api('/transfers/download','POST',dict(sessionId='local',path=f.cwd+'/'+path,taskId=str(uuid.uuid4()),directory=directory))
        data=f.api('/downloads/'+reply['id'])
        if directory:
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                assert archive.extractfile('files/nested/file.txt').read()==b'block-transfer'
                assert archive.getmember('files/empty').isdir()
        else:assert data==b'block-transfer'
        f.api('/downloads/'+reply['id'],status=400)
    for index in range(70):
        upload(f,f'many/{index}.txt',b'x')
    assert len(f.api('/local/files/list','POST',dict(path=f.cwd+'/many'))['entries'])==70
    print('PASS: local nested upload, empty directories, traversal rejection, file and directory downloads, one-use tickets')

def verify_git(f):
    assert f.api('/git/available')
    repo=f.cwd+'/repo'
    f.api('/local/files/create','POST',dict(directory=f.cwd,name='repo',isDirectory=True))
    snap=f.api('/git/initialize','POST',dict(path=repo)); assert snap['head']['unborn']
    config=f.api('/local/files/read','POST',dict(path=repo+'/.git/config'))
    f.api('/local/files/write','POST',dict(path=repo+'/.git/config',content=config['content']+'\n[user]\n name = Qterm Fixture\n email = fixture@example.invalid\n',expectedRevision=config['revision']))
    upload(f,'repo/test.txt',b'git block proof\n')
    snap=f.api('/git/snapshot','POST',dict(path=repo)); assert any(c['path']=='test.txt' for c in snap['changes'])
    f.api('/git/stage','POST',dict(repository=repo,paths=['test.txt']))
    diff=f.api('/git/change_diff','POST',dict(repository=repo,path='test.txt',staged=True)); assert diff['after']['content']=='git block proof\n'
    snap=f.api('/git/commit','POST',dict(repository=repo,message='fixture commit')); assert snap['head']['oid'] and not snap['changes']
    files=f.api('/git/commit_files','POST',dict(repository=repo,oid=snap['head']['oid'])); assert files[0]['path']=='test.txt'
    f.api('/git/create_branch','POST',dict(repository=repo,name='fixture-branch'))
    snap=f.api('/git/switch_branch','POST',dict(repository=repo,name='fixture-branch')); assert snap['head']['name']=='fixture-branch'
    f.api('/git/snapshot','POST',dict(path=repo,command='forbidden'),status=422)
    print('PASS: Git availability/init/status/stage/diff/commit/history/branches and closed request validation')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--container',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='qterm-blocks-') as directory:
        f=m.Fixture(directory,args.container)
        try:
            verify_files(f)
            verify_git(f)
        finally:f.close()
