/* Kill-switch service worker.
   The previous offline app-shell SW caused stale content in development (HMR
   changes chunk names). This version does the opposite: it purges all caches,
   unregisters itself, and reloads any open tab — so every device that ever
   registered a service worker recovers automatically on its next visit.
   Nothing is served from cache here (plain network pass-through).

   Offline note: content still survives outages while the board is running
   (board-data.js caches content in localStorage and images/music in IndexedDB).
   A production-only, versioned offline app-shell can be re-added later. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        try {
          c.navigate(c.url);
        } catch {
          /* ignore */
        }
      });
    })(),
  );
});

// No fetch handler that serves cache → everything goes straight to the network.
