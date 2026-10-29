"""Zero-failure traffic while native windows share their connection context."""
START = """
window.continuity={http:[],messages:[],closed:[],errors:[],stop:false};
const c=window.continuity;
c.socket=new WebSocket('ws://localhost:3000/context-continuity');
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('socket start timeout')),5000);
 c.socket.onmessage=e=>{clearTimeout(timer);c.identity=JSON.parse(e.data);resolve()};
 c.socket.onerror=()=>reject(Error('socket start failed'));
});
c.socket.onmessage=e=>c.messages.push(e.data);
c.socket.onclose=e=>c.closed.push({code:e.code,clean:e.wasClean});
c.socket.onerror=()=>c.errors.push('socket error');
let sequence=0;
c.timer=setInterval(()=>{if(c.socket.readyState===1)c.socket.send('echo-'+(++sequence))},50);
c.loop=(async()=>{while(!c.stop){
 try{c.http.push(await fetch('/context-continuity',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()))}
 catch(e){c.http.push({error:String(e)})}
 await new Promise(r=>setTimeout(r,5));
}})();
await new Promise(r=>setTimeout(r,150));return c.identity;
"""
STOP = """
const c=window.continuity;c.stop=true;await c.loop;clearInterval(c.timer);
await new Promise(r=>setTimeout(r,100));
const result={http:c.http,messages:c.messages,closed:c.closed,errors:c.errors,identity:c.identity,state:c.socket.readyState};
c.socket.close(1000,'finished');return result;
"""


def run(app, gateways, add):
    # A connection's route is immutable while owned; reject before creating a context.
    app.send(op='open', id='wrong-route', profile='A', port=gateways['B'].server_address[1], path='/')
    rejected = app.wait('error')
    add('same connection rejects a different SSH gateway before window creation',
        'binding cannot change' in rejected['error'], rejected)
    app.send(op='eval', id='wrong-route', tag='absent', script='return true')
    absent = app.wait('error')
    add('rejected route creates no window', 'unknown window' in absent['error'], absent)
    for name in ('A', 'B'):
        app.evaluate(name.lower(), START)
    for index in range(6):
        for name in ('A', 'B'):
            label=f'reuse-{name.lower()}-{index}'
            app.open(label, name, gateways[name])
            native=app.contexts[label]
            add(label+': identical native RequestContext and isolated other connection',
                native.get('context_reused') is True and native.get('native_identity_verified') is True
                and native.get('other_contexts_isolated') is True, native)
            state=app.evaluate(label, "return {echo:await fetch('/echo').then(r=>r.json()),storage:localStorage.getItem('profile')}")
            add(label+': Cookie and localStorage retain connection identity',
                state['echo']['profile']==name and 'session='+name in state['echo']['cookie'] and state['storage']==name, state)
            app.close_window(label)
    for name in ('A', 'B'):
        result=app.evaluate(name.lower(), STOP)
        add(name+': opening and closing 12 windows causes zero HTTP failures',
            len(result['http'])>=10 and all(r.get('profile')==name and 'session='+name in r.get('cookie','') for r in result['http']),result['http'])
        add(name+': original WebSocket stays open without reconnect across window churn',
            result['state']==1 and not result['closed'] and not result['errors'] and len(result['messages'])>=3
            and result['messages']==['echo-'+str(i+1) for i in range(len(result['messages']))]
            and result['identity']['profile']==name and 'session='+name in result['identity']['cookie'],
            {k:v for k,v in result.items() if k!='http'})


def close_creator(app, gateway, add):
    app.open('a-survivor', 'A', gateway)
    app.evaluate('a-survivor', START)
    app.close_window('a')
    app.open('a-after-creator', 'A', gateway)
    app.close_window('a-after-creator')
    result = app.evaluate('a-survivor', STOP)
    add('closing original creator and opening another window preserves survivor HTTP',
        len(result['http'])>=5 and all(r.get('profile')=='A' and 'session=A' in r.get('cookie','') for r in result['http']), result['http'])
    add('surviving window WebSocket remains open after original creator closes',
        result['state']==1 and not result['closed'] and not result['errors'] and len(result['messages'])>=3,
        {k:v for k,v in result.items() if k!='http'})
    app.close_window('a-survivor')
