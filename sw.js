/* Gen Z Studio — service worker (offline app + font cache + share target) */
const VER = 'gzs-1d545937c1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const FONT_CACHE = 'gzs-fonts-v1';
const SHARE_CACHE = 'gzs-share';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gzs-') && k !== VER && k !== FONT_CACHE && k !== SHARE_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromCache(req) {
  const c = await caches.open(VER);
  return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html'));
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // share target: files shared from other apps (gallery, recorder, WhatsApp…)
  if (req.method === 'POST' && url.searchParams.get('do') === 'share') {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const c = await caches.open(SHARE_CACHE);
        let i = 0;
        for (const f of fd.getAll('media')) {
          if (!f || !f.name) continue;
          await c.put('./__share/' + (i++) + '/' + encodeURIComponent(f.name), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name) } }));
        }
      } catch (err) {}
      return Response.redirect('./?do=share-recv', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Google Fonts: keep a copy so fonts work offline after the first visit
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(FONT_CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(fromCache(req).then(r => r || fetch(req))); return; }
  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (err) { return hit || Response.error(); }
  })());
});
