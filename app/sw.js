// JournalScape phone app: offline shell. App files are served from the cache (refreshed in the background); Google
// sign-in and Drive requests always go to the network and are never cached. Bump VERSION when files change.
const VERSION='gk-phone-mw1k90nn',SHELL=['./','index.html','style.css','app.mjs','logic.mjs','drive.mjs','sync.mjs','sync-stamps.mjs','groceries.mjs','journal.mjs','config.mjs','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin)return;
 e.respondWith(caches.open(VERSION).then(async cache=>{const hit=await cache.match(e.request);const fresh=fetch(e.request).then(r=>{if(r.ok)cache.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||fresh;}));
});
