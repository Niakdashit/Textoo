// minimal offline shell (optional)
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('hmw-v1').then(c => c.addAll(['/site/index.html'])));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
