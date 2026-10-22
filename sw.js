/* Кэш для работы без сети. Сначала берём свежую версию из сети (3 секунды на ответ), без сети — сохранённую. */
const CACHE = 'zal-v6';
const V = '6';
const FILES = ['./', 'index.html', 'data.js?v=' + V, 'videos.js?v=' + V, 'app.js?v=' + V, 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  if (u.origin !== location.origin || req.method !== 'GET') return;
  const key = req.mode === 'navigate' ? './' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}).then(r => { if (r.ok) cache.put(key, r.clone()); return r; });
    const timeout = new Promise(res => setTimeout(res, 3000));
    try {
      const r = await Promise.race([net, timeout]);
      if (r) return r;
    } catch (err) {}
    const hit = await cache.match(key);
    return hit || net;
  })());
});
