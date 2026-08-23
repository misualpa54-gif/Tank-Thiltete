// Tank Realms service worker — the game registers this automatically when served
// over https (see the inline PWA block at the end of the game HTML).
// Pages are NETWORK-FIRST (a fresh open always gets the latest build; an open
// session is never interrupted). Assets are cache-first. Fully playable offline.
const CACHE = 'tank-realms-v28.6';
const GAME = encodeURI('./tank_realms_v28.6.html');
const ASSETS = ['./', './index.html', GAME, './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;      // cross-origin: leave to the browser
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    // network-first for pages, offline falls back to cache (then the game itself)
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
          return r;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match(GAME)))
    );
    return;
  }

  // cache-first for assets
  e.respondWith(
    caches.match(e.request).then((m) =>
      m || fetch(e.request).then((r) => {
        if (r.ok) {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
        }
        return r;
      })
    )
  );
});
