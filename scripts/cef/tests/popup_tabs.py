"""Adopt real CEF popups into Block guest slots without navigation replay."""
import json
import time
import uuid


def run(app, root, other, add):
    def gesture(label, script):
        app.send(op='eval', id=label, tag='popup-tabs', gesture=True, script=script)
        result = app.wait('result', id=label)['result']
        if 'error' in result: raise RuntimeError(result)
        return result.get('value')
    def adopt(source):
        request = app.wait('popup-request', source=source)
        id = str(uuid.uuid4())
        app.send(op='popup-accept', id=id, request=request['request'])
        label = app.wait('popup-accepted')['id']
        return id, label, request
    def wait_document(label):
        for _ in range(100):
            value = app.evaluate(label, 'return {url:location.href,ready:document.readyState,text:document.body?.innerText}')
            if value['ready']=='complete' and value.get('text','').startswith('{'): return value
            time.sleep(.05)
        raise RuntimeError(value)
    for name, source in (('A', root), ('B', other)):
        socket=app.evaluate(source,"return await new Promise((resolve,reject)=>{window.tabSocket=new WebSocket('ws://'+location.host+'/ws');window.tabPings=0;tabSocket.onmessage=e=>{const identity=JSON.parse(e.data);tabSocket.onmessage=()=>tabPings++;resolve(identity)};window.tabPingTimer=setInterval(()=>{if(tabSocket.readyState===WebSocket.OPEN)tabSocket.send('tab-ping')},500);tabSocket.onerror=()=>reject(Error('socket failed'));window.tabHttp={ok:0,failed:0};window.tabPoll=setInterval(()=>fetch('/echo?popup-continuity').then(r=>{if(!r.ok)throw Error(r.status);tabHttp.ok++}).catch(()=>tabHttp.failed++),100)})")
        add(name+': popup adoption starts with live SSH WebSocket',socket['profile']==name,socket)
    gesture(root, "window.tabPost=window.open('about:blank','block-post');const f=document.createElement('form');f.target='block-post';f.method='POST';f.action='/echo';const input=document.createElement('input');input.name='body';input.value='native-tab-post';f.append(input);document.body.append(f);f.submit();f.remove();return !!tabPost")
    id,label,request = adopt(root)
    doc = wait_document(label)
    record = json.loads(doc['text'])
    add('adopted Block tab preserves native POST body and source Cookie',record['body']=='body=native-tab-post' and record['profile']=='A' and 'real=A' in record['cookie'] and 'real=B' not in record['cookie'],record)
    add('adopted Block tab preserves window.opener',app.evaluate(root,'return tabPost.opener===window && !tabPost.closed'))
    app.send(op='popup-surface', id=label, root=root)
    add('adopted popup shares root NSWindow instead of opening an extra window',app.wait('popup-surface')['info']=={'sameWindow':True,'valid':True})
    app.send(op='browser-observe',id=id)
    observed=app.wait('observed')
    add('adopted tab supports bounds visibility metrics and PNG preview',observed['metrics'] is not None and observed['snapshotBytes']>100,observed)
    # Real browser-level named-target reuse must not emit another tab request.
    original_requests=len([e for e in app.history if e.get('event')=='popup-request' and e.get('source')==root])
    gesture(root,"return window.open('/echo?reuse','block-post')===tabPost")
    time.sleep(.2)
    add('named target reuses adopted browser without another tab',len([e for e in app.history if e.get('event')=='popup-request' and e.get('source')==root])==original_requests)
    gesture(label,"window.child=window.open('/echo?nested','block-child');return !!child")
    nested_id,nested,nested_request=adopt(label)
    wait_document(nested)
    app.send(op='popup-surface', id=nested, root=root)
    add('nested popup is another embedded tab in the same window',app.wait('popup-surface')['info']['sameWindow'])
    app.close_window(nested)
    add('closing nested tab preserves opener tab and main window',app.evaluate(label,'return child.closed && !window.closed') and app.process.poll() is None)
    # Closing through JS must notify the trusted tab owner as well.
    app.send(op='eval',id=label,tag='close-script',script='setTimeout(()=>window.close(),100);return true')
    app.wait('result',id=label)
    app.wait('popup-closed',id=label)
    add('window.close closes its adopted tab without closing the shared main window',app.evaluate(root,'return tabPost.closed') and app.process.poll() is None)
    survivor=app.evaluate(other,"return await fetch('/echo').then(r=>r.json())")
    add('B connection stays isolated after embedded tab and nested close',survivor['profile']=='B' and 'real=B' in survivor['cookie'] and 'real=A' not in survivor['cookie'],survivor)
    gesture(root,"window.rejected=window.open('/echo?reject','reject-tab');return !!rejected")
    pending=app.wait('popup-request',source=root)
    app.send(op='popup-reject',request=pending['request']);app.wait('popup-rejected')
    add('rejected popup releases actual native browser',app.evaluate(root,'return rejected.closed'))
    # HTML _blank implies noopener in modern Chromium. Still route to source Block.
    gesture(root,"const a=document.createElement('a');a.href='/echo?blank';a.target='_blank';document.body.append(a);a.click();a.remove();return true")
    _,blank,_=adopt(root)
    wait_document(blank)
    add('target blank anchor becomes embedded tab and retains noopener',app.evaluate(blank,'return window.opener===null'))
    app.send(op='popup-surface',id=blank,root=root)
    add('noopener blank tab also has no extra NSWindow',app.wait('popup-surface')['info']['sameWindow'])
    app.close_window(blank)
    # Replay of a consumed token cannot create another browser/tab.
    app.send(op='popup-accept',id=str(uuid.uuid4()),request=request['request'])
    add('popup adoption request is one use', '已失效' in app.wait('error')['error'])

    gesture(root,"window.expiring=window.open('/echo?expire','expired-tab');return !!expiring")
    expiring=app.wait('popup-request',source=root)
    deadline=time.monotonic()+35
    expired=False
    while time.monotonic()<deadline:
        expired=app.evaluate(root,'return expiring.closed')
        if expired:break
        time.sleep(.3)
    add('unclaimed popup expires and closes its native child',expired)
    app.send(op='popup-accept',id=str(uuid.uuid4()),request=expiring['request'])
    add('expired popup request cannot be adopted', '已失效' in app.wait('error')['error'])
    for name, source in (('A', root), ('B', other)):
        continuity=app.evaluate(source,"clearInterval(tabPoll);clearInterval(tabPingTimer);const result={...tabHttp,pings:tabPings,socketOpen:tabSocket.readyState===WebSocket.OPEN};tabSocket.close();return result")
        add(name+': HTTP and original WebSocket survive popup adoption and teardown',continuity['failed']==0 and continuity['ok']>10 and continuity['pings']>10 and continuity['socketOpen'],continuity)

    # Leave adopted descendants alive for the production owner's disconnect.
    gesture(root,"window.retireTab=window.open('/echo?retire-parent','retire-tab');return !!retireTab")
    _,retiring,_=adopt(root)
    wait_document(retiring)
    gesture(retiring,"window.retireChild=window.open('/echo?retire-child','retire-child');return !!retireChild")
    _,retiring_child,_=adopt(retiring)
    wait_document(retiring_child)
    add('connection teardown begins with two adopted nested tab guests',True)
