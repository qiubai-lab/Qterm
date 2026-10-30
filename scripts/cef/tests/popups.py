"""Native popup POST/opener/context policy; no fallback URL replay."""
import time

def run(app, add):
    app.send(op='network-gate',profile='A',enabled=False);app.wait('gate-changed')
    blocked=app.evaluate('a',"try{await fetch('/echo?closed-gate');return false}catch{return true}")
    worker=app.evaluate('a',"return await new Promise(resolve=>{const u=URL.createObjectURL(new Blob([`fetch('http://localhost:3000/echo?worker-closed-gate').then(()=>postMessage(false),()=>postMessage(true))`],{type:'text/javascript'}));const w=new Worker(u);w.onmessage=e=>{w.terminate();URL.revokeObjectURL(u);resolve(e.data)}})")
    b=app.evaluate('b',"return await fetch('/echo').then(r=>r.json())")
    add('closed native network gate rejects page and worker requests while B survives',blocked and worker and b['profile']=='B',dict(page=blocked,worker=worker,B=b))
    app.send(op='network-gate',profile='A',enabled=True);app.wait('gate-changed')
    restored=app.evaluate('a',"return await fetch('/echo').then(r=>r.json())")
    add('native network gate admits requests after binding without changing origin',restored['profile']=='A' and restored['host']=='localhost:3000',restored)
    def gesture(script):
        app.send(op='eval',id='a',tag='gesture',gesture=True,script=script)
        result=app.wait('result',id='a')['result']
        if 'error' in result: raise RuntimeError(result)
        return result.get('value')
    blocked=app.evaluate('a', "return window.open('/echo','automatic')===null")
    add('automatic non-gesture popup is blocked',blocked)
    created=gesture("window.postPopup=window.open('about:blank','post-target'); const f=document.createElement('form');f.method='POST';f.action='/echo';f.target='post-target';const i=document.createElement('input');i.name='payload';i.value='popup-body';f.append(i);document.body.append(f);f.submit();f.remove();return !!window.postPopup")
    add('user gesture opens a native popup',created)
    value=None
    for _ in range(60):
        value=app.evaluate('a', "const p=window.postPopup; if(!p||p.closed)return null;try{return {href:p.location.href,text:p.document.body?.innerText,opener:p.opener===window,cookie:p.document.cookie}}catch{return null}")
        if value and value['href'].endswith('/echo') and value.get('text','').startswith('{'):break
        time.sleep(.1)
    import json
    record=json.loads(value['text']) if value else {}
    add('popup retains POST body and window.opener', value and value['opener'] and record.get('body')=='payload=popup-body',value)
    add('popup inherits A Cookie and SSH route',record.get('profile')=='A' and 'session=A' in record.get('cookie','') and 'session=B' not in record.get('cookie',''),record)
    b=app.evaluate('b',"return await fetch('/echo').then(r=>r.json())")
    add('independent B remains isolated while A popup is open',b['profile']=='B' and 'session=B' in b['cookie'] and 'session=A' not in b['cookie'],b)
    app.send(op='popup-info',id='a');info=app.wait('popup-info')['popups']
    add('macOS popup retains Alloy native runtime',bool(info) and all(not p['chrome'] for p in info),info)
    # Leave the popup open: the existing lifecycle closes its source and final
    # retirement requires the native pool's live-browser set to reach zero.
