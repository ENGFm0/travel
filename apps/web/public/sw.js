// BoardingPass service worker — offline shell for the PWA (US-014).
// HTML navigations are network-first (so updated markup + icon refs propagate
// without a hard refresh, falling back to cache offline); other same-origin GETs
// are stale-while-revalidate (hashed assets are safe to cache).
const CACHE = 'bp-cache-v22';

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

      // HTML navigations: network-first so a new deploy is picked up promptly.
      if (req.mode === 'navigation') {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          const shell = await cache.match(self.registration.scope);
          if (shell) return shell;
          return Response.error();
        }
      }

      // Other assets: stale-while-revalidate.
      const cached = await cache.match(req);
      if (cached) {
        fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
