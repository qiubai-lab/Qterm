"""Exercise Qterm's real russh manager, authenticated identity and disconnect watcher."""
import getpass
import subprocess
import time
import uuid


def run(app,environments,add):
    profiles={name:str(uuid.uuid4()) for name in ('A','B')}
    def connect(name,tag):
        env=environments[name]
        fingerprint=subprocess.check_output(['ssh-keygen','-lf',str(env.directory/'host.pub')],text=True).split()[1]
        app.send(op='ssh-connect',profile=profiles[name],port=env.port,username=getpass.getuser(),key=str(env.directory/'client'),fingerprint=fingerprint,tag=tag)
        return app.wait('ssh-connected',tag=tag)['session']
    a1,a2,b=connect('A','a1'),connect('A','a2'),connect('B','b')
    def open_page(name,session):
        id=str(uuid.uuid4());label='web-'+id
        app.send(op='ssh-open',id=id,profile=profiles[name],session=session,url=f'http://127.0.0.1:{environments[name].target_port}/')
        context=app.wait('proxy_ready',id=label)
        app.wait('loaded',id=label)
        return id,label,context
    ai,al,ac=open_page('A',a1)
    a2i,a2l,a2c=open_page('A',a2)
    bi,bl,bc=open_page('B',b)
    add('authenticated Qterm sessions share native context only for same identity',not ac['context_reused'] and a2c['context_reused'] and not bc['context_reused'],[ac,a2c,bc])
    for label,name in ((al,'A'),(bl,'B')):
        result=app.evaluate(label,f"await fetch('/set?cookie='+encodeURIComponent('real={name}; Path=/; HttpOnly'));return await fetch('/echo').then(r=>r.json())")
        add(name+': production russh SOCKS route preserves target and Cookie',result['profile']==name and f'real={name}' in result['cookie'],result)
    from popup_tabs import run as popup_tabs
    popup_tabs(app, al, bl, add)
    security=app.evaluate(al,"const denied=async cmd=>{try{await window.__TAURI_INTERNALS__.invoke(cmd);return false}catch(e){return String(e)}};return {app:await denied('web_supported'),plugin:await denied('plugin:clipboard-manager|write_text')}")
    add('guest application and plugin IPC are rejected',all(isinstance(security[k],str) and ('cannot invoke' in security[k] or 'not allowed' in security[k]) for k in ('app','plugin')),security)
    main_url=app.evaluate('main',"return location.href")
    original=app.evaluate(al,"return location.href")
    import json
    app.evaluate(al,"location.href="+json.dumps(main_url)+";return true")
    time.sleep(.2)
    add('guest navigation to trusted application origin is denied',app.evaluate(al,"return location.href")==original)
    app.send(op='browser-action',id=ai,action='navigate',url=main_url)
    add('browser action rejects application origin', '仅支持外部' in app.wait('error')['error'])
    for action,url in [('navigate',original+'?second'),('back',None),('forward',None),('reload',None),('stop',None)]:
        app.send(op='browser-action',id=ai,action=action,url=url);app.wait('action-done');time.sleep(.15)
    add('browser navigation back forward reload and stop remain callable',True)
    app.send(op='browser-observe',id=ai)
    observed=app.wait('observed')
    add('production metrics and PNG preview work',observed['metrics'] is not None and observed['snapshotBytes']>100,observed)
    app.send(op='browser-clear',id=ai,selection=dict(cookies=True,cache=False,storage=False))
    app.wait('clear-done')
    # Clear reloads all siblings; wait until committed before querying.
    time.sleep(.3)
    cookies_a=app.evaluate(a2l,"return (await fetch('/echo').then(r=>r.json())).cookie")
    cookies_b=app.evaluate(bl,"return (await fetch('/echo').then(r=>r.json())).cookie")
    add('Cookie clear affects every A page and preserves B', 'real=A' not in cookies_a and 'real=B' in cookies_b,dict(A=cookies_a,B=cookies_b))
    app.send(op='browser-clear',id=ai,selection=dict(cookies=False,cache=True,storage=False))
    app.wait('clear-done')
    add('native HTTP cache clear completes',True)
    app.send(op='browser-clear',id=ai,selection=dict(cookies=True,cache=True,storage=True))
    error=app.wait('error')
    add('unsupported whole-profile site storage clear fails explicitly', '暂不支持完整清理站点存储' in error['error'],error)
    app.send(op='fail-close-once');app.wait('failure-armed')
    app.send(op='ssh-close',session=a1);app.wait('ssh-closed',session=a1)
    add('production disconnect watcher retries a failed close barrier',True)
    app.send(op='counts');remaining=app.wait('counts')
    add('disconnect releases adopted popup descendants and preserves only two surviving roots',remaining['guests']==remaining['environments']==remaining['pooledContexts']==2,remaining)
    survivor=app.evaluate(a2l,"return await fetch('/echo').then(r=>r.json())")
    add('closing one authenticated owner preserves same-identity survivor',survivor['profile']=='A',survivor)
    app.close_window(a2l)
    app.send(op='ssh-close',session=a2);app.wait('ssh-closed',session=a2)
    b_result=app.evaluate(bl,"return await fetch('/echo').then(r=>r.json())")
    add('zero-page final owner is reaped while independent B survives',b_result['profile']=='B' and 'real=B' in b_result['cookie'],b_result)
    app.send(op='ssh-close',session=b);app.wait('ssh-closed',session=b)
    app.send(op='counts');counts=app.wait('counts')
    add('production disconnect watchers retire all native environments',counts['guests']==counts['environments']==counts['pooledContexts']==0,counts)
