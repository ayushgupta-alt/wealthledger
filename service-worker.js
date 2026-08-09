/* ===================== WEALTH LEDGER — SERVICE WORKER =====================
   Update workflow (see plan section 7):
   - Bump CACHE_VERSION on every deploy. That's the ONLY thing that needs to
     change to ship an update — it invalidates the old cache and triggers the
     in-app "Update available" prompt on next launch/foreground.
   - The new SW installs and sits in "waiting" state; it does NOT activate
     automatically (no self.skipWaiting() on install). The page detects the
     waiting worker and shows a toast. Only when the user taps "Reload" does
     the page tell this SW to skip waiting and take over — so an update never
     interrupts an active session (e.g. mid transaction-entry).
   - User data lives in localStorage/IndexedDB, untouched by cache changes.
   ========================================================================= */

const CACHE_VERSION = 'v13';
const CACHE_NAME = `wealth-ledger-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Deliberately no self.skipWaiting() here — see update workflow note above.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Page sends this once the user taps "Reload" on the update toast.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // App shell (same-origin): cache-first, so the app opens instantly and
  // works fully offline on the last installed version.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Cross-origin (Google Fonts etc.): stale-while-revalidate — serve cached
  // copy immediately if present, refresh in the background for next time.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
