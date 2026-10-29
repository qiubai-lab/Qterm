await navigator.serviceWorker.register('/sw.js');
await navigator.serviceWorker.ready;
if (!navigator.serviceWorker.controller) {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Service Worker control timeout')),5000);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()},{once:true});
  });
}
const sw=await fetch('/sw-identity').then(r=>r.text());
const cache=await caches.open('same-name');
const cached=await cache.match('/cache-value');
const before=cached ? await cached.text() : null;
await cache.put('/cache-value',new Response(profile));
const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('same-database',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('same-store');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
const previous=await new Promise((resolve,reject)=>{
  const request=db.transaction('same-store').objectStore('same-store').get('identity');
  request.onsuccess=()=>resolve(request.result ?? null);
  request.onerror=()=>reject(request.error);
});
await new Promise((resolve,reject)=>{
  const tx=db.transaction('same-store','readwrite');
  tx.objectStore('same-store').put(profile,'identity');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
});
db.close();
return {sw,cacheBefore:before,indexedDBBefore:previous,local:localStorage.getItem('profile')};
