"""Close the real main window with live SSH pages, sockets and native descendants."""
import socket
import subprocess
import time

from measure import process_tree
from popup_teardown import nested_popup


def run(app, gateways, add):
    for name in ('A', 'B'):
        label = 'exit-' + name
        app.open(label, name, gateways[name])
        result = app.evaluate(label, "return await new Promise((resolve,reject)=>{window.exitSocket=new WebSocket('ws://localhost:3000/ws');exitSocket.onmessage=e=>resolve(JSON.parse(e.data));exitSocket.onerror=()=>reject(Error('exit socket failed'))})")
        add(name + ': live WebSocket exists before main-window exit', result['profile'] == name, result)
    app.send(op='eval', id='exit-A', tag='exit-popup', gesture=True,
             script="window.child=window.open('/echo','exit-child');return !!window.child")
    if app.wait('result', id='exit-A')['result'].get('value') is not True:
        raise RuntimeError('exit popup failed')
    for _ in range(60):
        if app.evaluate('exit-A', "try{return child.document.body?.innerText.startsWith('{') ?? false}catch{return false}"):
            break
        time.sleep(.025)
    else:
        raise RuntimeError('exit popup did not load')
    nested_popup(app, 'exit-A')
    app.send(op='counts')
    before = app.wait('counts')
    add('exit starts with two owned contexts and native nested popups', before['environments'] == before['pooledContexts'] == 2, before)
    processes = process_tree(app.process.pid)
    # Use the same API as the actual titlebar, allowing the frontend flush and
    # web_shutdown handler to run. Do not use the harness's explicit quit path.
    app.evaluate('main', "setTimeout(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'}),150);return true")
    app.process.wait(timeout=30)
    app.reader.join(timeout=3)
    add('main-window close exits normally with live resources', app.process.returncode == 0, app.process.returncode)
    completed = [event for event in app.history if event.get('event') == 'shutdown-complete']
    add('main-window exit acknowledges empty guests, environments and native pool',
        bool(completed) and all(event['guests'] == event['environments'] == event['pooledContexts'] == 0 for event in completed), completed)
    ports_closed = True
    for port in before['gatewayPorts']:
        with socket.socket() as sock:
            sock.settimeout(.5)
            ports_closed &= sock.connect_ex(('127.0.0.1', port)) != 0
    add('main-window exit releases every owned gateway listener', ports_closed)
    descendants = {process['pid'] for process in processes}
    remaining = descendants
    for _ in range(50):
        live = set(map(int, subprocess.check_output(['ps', '-axo', 'pid='], text=True).split()))
        remaining = live & descendants
        if not remaining:
            break
        time.sleep(.1)
    add('main-window exit leaves no captured CEF helper processes', not remaining, sorted(remaining))
