"""Observable isolation and failure behaviour, beyond the per-page cookie/WS suite."""
import time
from context_continuity import close_creator

SOCKET = """
return await new Promise(resolve=>{
 const s=new WebSocket('ws://localhost:3000/ws');
 const timer=setTimeout(()=>{s.close();resolve({error:'timeout'})},5000);
 s.onmessage=e=>{clearTimeout(timer);s.close(1000);resolve(JSON.parse(e.data))};
 s.onerror=()=>{clearTimeout(timer);resolve({error:'failed'})};
});
"""


def run(app, gateways, environments, add):
    app.evaluate('a', """
    window.trafficStop=false;window.traffic=[];
    window.trafficPromise=(async()=>{while(!window.trafficStop){
      try{traffic.push(await fetch('/context-open-probe',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()))}
      catch(e){traffic.push({error:String(e)})}
      await new Promise(r=>setTimeout(r,5));
    }})();
    await new Promise(r=>setTimeout(r,100));return true;
    """)
    app.open('a2', 'A', gateways['A'])
    traffic = app.evaluate('a', 'window.trafficStop=true;await window.trafficPromise;return window.traffic')
    add('same-profile tab creation never redirects active A traffic',
        bool(traffic) and any(r.get('profile') == 'A' for r in traffic)
        and all(r.get('profile') == 'A' and 'session=A' in r.get('cookie', '') for r in traffic), traffic)
    shared = app.evaluate('a2', "return {cookie:await fetch('/echo').then(r=>r.json()),storage:localStorage.getItem('profile')}")
    add('same connection tabs share native Cookie and localStorage',
        'session=A' in shared['cookie']['cookie'] and shared['storage'] == 'A', shared)
    app.open('csp', 'B', gateways['B'], '/csp')
    csp = app.evaluate('csp', SOCKET)
    add('strict self CSP allows native localhost WebSocket', csp.get('profile') == 'B', csp)
    app.close_window('csp')
    app.close_window('a2')

    # Cookie deletion is a server logout, not a claim to clear all browser storage.
    app.evaluate('a', "await fetch('/set?cookie='+encodeURIComponent('session=; Path=/; Max-Age=0; HttpOnly'));return true")
    state_a = app.evaluate('a', "return await fetch('/echo').then(r=>r.json())")
    state_b = app.evaluate('b', "return await fetch('/echo').then(r=>r.json())")
    add('logout A does not clear B cookies', 'session=' not in state_a['cookie'] and 'session=B' in state_b['cookie'], [state_a, state_b])
    app.evaluate('a', "await fetch('/set?cookie='+encodeURIComponent('session=A; Path=/; HttpOnly'));return true")

    held = app.evaluate('a', """
    window.heldClose=null;window.held=new WebSocket('ws://localhost:3000/held');
    held.onclose=e=>{window.heldClose={code:e.code,clean:e.wasClean}};
    return await new Promise(resolve=>{held.onmessage=e=>resolve(JSON.parse(e.data));held.onerror=()=>resolve({error:'failed'})});
    """)
    add('open socket belongs to A before disconnect', held.get('profile') == 'A', held)
    environments['A'].cut()
    closed = None
    for _ in range(30):
        closed = app.evaluate('a', 'return window.heldClose')
        if closed:
            break
        time.sleep(.1)
    add('SSH cut closes existing WebSocket abnormally', closed and closed['code'] == 1006 and not closed['clean'], closed)
    failed = app.evaluate('a', "try{await fetch('/after-cut',{signal:AbortSignal.timeout(4000)});return false}catch(e){return true}")
    socket = app.evaluate('a', SOCKET)
    b = app.evaluate('b', SOCKET)
    add('disconnected A HTTP and new WebSocket fail closed', failed and socket.get('error') == 'failed', [failed, socket])
    add('B WebSocket stays usable while A disconnected', b.get('profile') == 'B' and 'session=B' in b.get('cookie', ''), b)
    environments['A'].restore()
    recovered = app.evaluate('a', SOCKET)
    add('SSH restore keeps original origin and A Cookie', recovered.get('profile') == 'A' and recovered.get('origin') == 'http://localhost:3000' and 'session=A' in recovered.get('cookie', ''), recovered)

    # The context belongs to the connection, not its first or last browser window.
    close_creator(app, gateways['A'], add)
    app.open('a3', 'A', gateways['A'])
    add('closing every A window retains the identical connection-owned context',
        app.contexts['a3'].get('context_reused') is True and app.contexts['a3'].get('native_identity_verified') is True,
        app.contexts['a3'])
    state = app.evaluate('a3', "return {cookie:await fetch('/echo').then(r=>r.json()),storage:localStorage.getItem('profile')}")
    add('reopened connection restores its own storage', state['cookie']['profile'] == 'A' and 'session=A' in state['cookie']['cookie'] and state['storage'] == 'A', state)
    app.close_window('a3')
    app.close_window('b')
