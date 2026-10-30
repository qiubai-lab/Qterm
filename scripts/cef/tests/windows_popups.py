"""Native Windows child popup ownership and navigation semantics."""
import json
import uuid


def run(app, root, add, until):
    def gesture(source, script):
        app.send(op='eval',id=source,tag='windows-popup',gesture=True,script=script)
        result=app.wait('result',id=source)['result']
        if 'error' in result:raise RuntimeError(result)
        return result.get('value')
    def adopt(source):
        request=app.wait('popup-request',source=source)
        app.send(op='popup-accept',id=str(uuid.uuid4()),request=request['request'])
        label=app.wait('popup-accepted')['id']
        until(lambda:app.evaluate(label,'return document.readyState==="complete" && document.body?.innerText.startsWith("{")'),bool)
        app.send(op='popup-surface',id=label,root=root)
        surface=app.wait('popup-surface')['info']
        add('popup shares the application HWND tree',surface==dict(sameWindow=True,valid=True),surface)
        return label
    gesture(root,"document.cookie='native=Windows;path=/';window.p=window.open('about:blank','post');const f=document.createElement('form');f.target='post';f.method='POST';f.action='/echo';const i=document.createElement('input');i.name='body';i.value='native-post';f.append(i);document.body.append(f);f.submit();f.remove();return !!p")
    popup=adopt(root)
    record=json.loads(app.evaluate(popup,'return document.body.innerText'))
    add('embedded Windows popup preserves native POST and cookies',record['body']=='body=native-post' and 'native=Windows' in record['cookie'],record)
    add('embedded Windows popup preserves opener',app.evaluate(root,'return p.opener===window && !p.closed'))
    add('named target reuses the adopted browser',gesture(root,"return window.open('/echo?reuse','post')===p"))
    gesture(popup,"window.child=window.open('/echo?nested','nested');return !!child")
    nested=adopt(popup)
    app.close_window(nested)
    add('closing nested popup keeps opener and main alive',until(lambda:app.evaluate(popup,'return child.closed && !window.closed'),bool) and app.process.poll() is None)
    app.evaluate(popup,'setTimeout(()=>window.close(),100);return true')
    app.wait('popup-closed',id=popup)
    add('window.close destroys only its child HWND',until(lambda:app.evaluate(root,'return p.closed'),bool) and app.process.poll() is None)
    gesture(root,"const a=document.createElement('a');a.href='/echo?blank';a.target='_blank';document.body.append(a);a.click();a.remove();return true")
    blank=adopt(root)
    add('target blank retains noopener',app.evaluate(blank,'return opener===null'))
    app.close_window(blank)
