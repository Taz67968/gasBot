// GasBot Agent PWA - Service Worker
// Uses Workbox for robust offline support

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

if (workbox) {
  console.log('[SW] Workbox loaded successfully');

  // Cache the application shell (index.html + critical assets)
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // CacheFirst for static assets (images, fonts, css, js bundles)
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'style' ||
                     request.destination === 'script' ||
                     request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'static-assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
      ],
    })
  );

  // NetworkFirst for API calls (payments, offers, etc.) - fresh data when possible
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/api/') ||
                 url.pathname.includes('payments') ||
                 url.pathname.includes('agents'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'api-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 5 * 60, // 5 minutes
        }),
        new workbox.backgroundSync.BackgroundSyncPlugin('api-queue', {
          maxRetentionTime: 24 * 60, // Retry for up to 24 hours
        }),
      ],
    })
  );

  // Default fallback for navigation
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
        }),
      ],
    })
  );

  // Background Sync for payment confirmations (critical for offline use)
  self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-payments') {
      console.log('[SW] Background sync triggered for payments');
      event.waitUntil(syncPendingPayments());
    }
  });

  async function syncPendingPayments() {
    // In a real implementation, this would open IndexedDB directly in the SW
    // and attempt to POST queued records to the backend.
    // For this demo we post a message to all clients so the main thread can flush.
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'SYNC_PAYMENTS' });
    });
  }

  // Handle messages from the client (e.g. manual flush requests)
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

} else {
  console.warn('[SW] Workbox failed to load. Falling back to basic caching.');
}

// Basic offline fallback for the shell
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
  }
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
