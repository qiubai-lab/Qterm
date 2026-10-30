"""Repeated parent teardown with both committed and in-flight native popups."""
import time


def run(app, gateways, add):
    for index in range(40):
        label=f'popup-parent-{index}'
        app.open(label,'A',gateways['A'])
        app.send(op='eval',id=label,tag='popup-race',gesture=True,
                 script="window.child=window.open('/echo','child');return !!window.child")
        result=app.wait('result',id=label)['result']
        if result.get('value') is not True: raise RuntimeError(result)
        if index%2:
            for _ in range(40):
                loaded=app.evaluate(label,"try{return window.child.document.body?.innerText.startsWith('{') ?? false}catch{return false}")
                if loaded:break
                time.sleep(.025)
            else: raise RuntimeError('popup document did not finish loading')
        if index % 4 == 3:
            nested_popup(app,label)
            if index % 8 == 3:
                app.evaluate(label,"window.child.close();return true")
                for _ in range(50):
                    if app.evaluate(label,"return window.child.closed && window.grandchild.closed"):break
                    time.sleep(.02)
                else: raise RuntimeError('intermediate popup did not close its descendants')
                root=app.evaluate(label,"return await fetch('/echo').then(r=>r.json())")
                if root['profile']!='A': raise RuntimeError('closing intermediate popup affected root')
        app.close_window(label)
    alive=app.evaluate('b',"return await fetch('/echo').then(r=>r.json())")
    add('40 native popup parent closes complete, including in-flight and nested creation',alive['profile']=='B',{'iterations':40,'B':alive})


def nested_popup(app,label):
    app.send(op='popup-info',id=label)
    popups=app.wait('popup-info')['popups']
    if len(popups)!=1: raise RuntimeError(f'expected one intermediate popup: {popups}')
    app.send(op='popup-eval',id=label,popup=popups[0]['id'],
             script="window.opener.grandchild=window.open('/echo','grandchild')")
    app.wait('popup-dispatched')
    for _ in range(60):
        if app.evaluate(label,"return !!window.grandchild && !window.grandchild.closed"):break
        time.sleep(.025)
    else: raise RuntimeError('nested popup was not created')
