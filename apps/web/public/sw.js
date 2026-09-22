// BoardingPass service worker — minimal offline shell for the PWA (US-014).
// Runtime cache-first for same-origin GET (hashed assets are safe to cache);
// navigations fall back to the cached app shell when offline.
const CACHE = 'bp-cache-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // stale-while-revalidate
        fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        if (req.mode === 'navigation') {
          const shell = await cache.match(self.registration.scope);
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
