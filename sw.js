const V = 'msy-1.0.0';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'fonts/Lora.ttf', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== 'msy-data').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (u.pathname.includes('/data/')) { // kitap verisi: önce ağ, yoksa önbellek
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open('msy-data').then((c) => c.put(u.pathname, cp)); } return res; }).catch(() => caches.open('msy-data').then((c) => c.match(u.pathname)).then((m) => m || new Response('', { status: 504 }))));
    return;
  }
  if (r.mode === 'navigate') { e.respondWith(caches.match('index.html').then((m) => m || fetch(r))); return; }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); } return res; })));
});
