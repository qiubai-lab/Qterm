const checks = [];
function check(name, pass, detail) { checks.push({name, pass: !!pass, detail}); }
const echo = (path='/echo', options={}) => fetch(path, options).then(r=>r.json());
const set = (cookie, options={}) => fetch('/set?cookie='+encodeURIComponent(cookie), options);
localStorage.setItem('profile',profile);
check('original origin and secure context', location.origin==='http://localhost:3000' && isSecureContext, location.href);
let record = await echo('/echo', {method:'POST',body:'post-'+profile});
check('HTTP SSH identity Host Origin POST', record.profile===profile && record.host==='localhost:3000' && record.origin===location.origin && record.body==='post-'+profile, record);
await set('session='+profile+'; Path=/; HttpOnly; SameSite=Lax');
await set('visible='+profile+'; Path=/');
await set('scoped=yes; Path=/scope');
await set('secret=secure; Path=/; Secure');
await set('foreign=bad; Domain=example.com; Path=/');
record = await echo();
check('HttpOnly round trip hidden from JS', record.cookie.includes('session='+profile) && !document.cookie.includes('session='), record.cookie);
check('native Cookie visible in DOM', document.cookie.includes('visible='+profile), document.cookie);
check('Secure Cookie works on trusted localhost', record.cookie.includes('secret=secure'), record.cookie);
check('foreign and path Cookie excluded', !record.cookie.includes('foreign=') && !record.cookie.includes('scoped='), record.cookie);
record = await echo('/scope/echo');
check('Cookie path included', record.cookie.includes('scoped=yes'), record.cookie);
record = await echo('/scope-other');
check('Cookie path boundary excluded', !record.cookie.includes('scoped='), record.cookie);
document.cookie='javascript='+profile+'; Path=/';
record = await echo();
check('JS Cookie reaches HTTP', record.cookie.includes('javascript='+profile), record.cookie);
record = await echo('/echo',{credentials:'omit'});
check('credentials omit sends no Cookie', !record.cookie, record.cookie);
await set('omitted=bad; Path=/',{credentials:'omit'});
record = await echo();
check('credentials omit ignores Set-Cookie', !record.cookie.includes('omitted='), record.cookie);
await fetch('/set?cookie='+encodeURIComponent('multi1=one; Path=/')+'&cookie='+encodeURIComponent('multi2=two; Path=/'));
record = await echo();
check('multiple Set-Cookie headers', record.cookie.includes('multi1=one') && record.cookie.includes('multi2=two'), record.cookie);
await set('expired=bad; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/');
record = await echo();
check('expired Cookie excluded',!record.cookie.includes('expired='),record.cookie);
check('other connection Cookie absent', !record.cookie.includes('session='+(profile==='A'?'B':'A')),record.cookie);
check('localStorage connection identity',localStorage.getItem('profile')===profile,localStorage.getItem('profile'));
await set('visible=gone; Path=/; Max-Age=0');
record = await echo();
check('Cookie deletion', !record.cookie.includes('visible='), record.cookie);
const socketResult = await new Promise(resolve=>{
  const s=new WebSocket('ws://localhost:3000/ws'); s.binaryType='arraybuffer';
  let stage=0, identity, text=false, binary=false;
  const timer=setTimeout(()=>{s.close();resolve({error:'timeout'})},6000);
  s.onmessage=e=>{
    if(stage++===0){identity=JSON.parse(e.data);s.send('echo-'+profile)}
    else if(stage===2){text=e.data==='echo-'+profile;s.send(new Uint8Array([1,2,255]))}
    else {binary=Array.from(new Uint8Array(e.data)).join(',')==='1,2,255';s.close(1000,'done')}
  };
  s.onclose=e=>{clearTimeout(timer);resolve({identity,text,binary,code:e.code,reason:e.reason})};
  s.onerror=()=>{clearTimeout(timer);resolve({error:'socket failure'})};
});
check('page WebSocket identity Host Origin Cookie', socketResult.identity?.profile===profile && socketResult.identity.host==='localhost:3000' && socketResult.identity.origin===location.origin && socketResult.identity.cookie.includes('session='+profile) && socketResult.identity.cookie.includes('javascript='+profile), socketResult);
check('WebSocket text binary close', socketResult.text && socketResult.binary && socketResult.code===1000 && socketResult.reason==='done', socketResult);
for (const type of ['classic','module']) {
  const result=await new Promise(resolve=>{
    const w=new Worker('/worker.js',{type});
    const timer=setTimeout(()=>{w.terminate();resolve({error:'timeout'})},6000);
    w.onmessage=e=>{clearTimeout(timer);w.terminate();resolve(e.data)};
    w.onerror=e=>{clearTimeout(timer);w.terminate();resolve({error:e.message})};
  });
  check(type+' Worker HTTP and WebSocket', result.origin===location.origin && result.response?.profile===profile && result.response.body==='worker-post' && result.socket?.profile===profile && result.socket.origin===location.origin && result.socket.cookie.includes('session='+profile), result);
}
const blobResult=await new Promise(resolve=>{
  const source="const s=new WebSocket('ws://localhost:3000/blob');s.onmessage=e=>{s.close(1000);postMessage(JSON.parse(e.data))};s.onerror=()=>postMessage({error:'socket failed'})";
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const w=new Worker(url);
  const timer=setTimeout(()=>{w.terminate();URL.revokeObjectURL(url);resolve({error:'timeout'})},6000);
  w.onmessage=e=>{clearTimeout(timer);w.terminate();URL.revokeObjectURL(url);resolve(e.data)};
});
check('blob Worker native WebSocket over SSH',blobResult.profile===profile && blobResult.origin===location.origin && blobResult.cookie.includes('session='+profile),blobResult);
const parallel=await Promise.all(Array.from({length:16},(_,i)=>echo('/parallel-'+i,{method:'POST',body:profile+'-'+i})));
check('16 concurrent HTTP requests remain on their SSH connection', parallel.every((r,i)=>r.profile===profile && r.body===profile+'-'+i && r.cookie.includes('session='+profile)),parallel.length);
return checks;
