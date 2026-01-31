const CACHE_VERSION = 'v1.0.3'; // Increment this when deploying
const CACHE_NAME = `pwa-cache-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients...');
      return self.clients.claim();
    })
  );
});

// Helper function to determine cache strategy
function shouldUseNetworkFirst(url) {
  const pathname = url.pathname;
  
  // Network-first for: JS, WASM, and HTML files
  // These are your app bundles that need to be fresh
  return pathname.endsWith('.js') || 
         pathname.endsWith('.wasm') || 
         pathname.endsWith('.html') ||
         pathname.endsWith('/') ||
         pathname.includes('yapp'); // Your app name
}

// Fetch event - Use network-first for app bundles, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle same-origin HTTP(S) requests
  if (!url.protocol.startsWith('http') || url.origin !== location.origin) {
    return;
  }

  // NETWORK-FIRST strategy for app bundles (JS/WASM/HTML)
  if (shouldUseNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh version
          if (networkResponse && networkResponse.status === 200) {
            console.log('[SW] ⟳ Network-first (updating cache):', url.pathname);
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          // Fallback to cache if offline
          console.log('[SW] ⚠ Network failed, trying cache:', url.pathname);
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] ✓ Cache fallback hit:', url.pathname);
              return cachedResponse;
            }
            // No cache - return offline page
            return getOfflinePage();
          });
        })
    );
    return;
  }

  // CACHE-FIRST strategy for static assets (CSS, images, fonts, etc.)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] ✓ Cache-first hit:', url.pathname);
          return cachedResponse;
        }
        
        console.log('[SW] ⟳ Cache miss, fetching:', url.pathname);
        // Not in cache - fetch from network
        return fetch(event.request).then((networkResponse) => {
          // Only cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            console.log('[SW] ✓ Caching:', url.pathname);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((error) => {
          console.error('[SW] ✗ Fetch failed:', url.pathname, error);
          return getOfflinePage();
        });
      });
    })
  );
});

// Helper function for offline page
function getOfflinePage() {
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          max-width: 400px;
        }
        h1 { color: #ff9800; margin: 0 0 20px 0; }
        p { color: #666; margin: 10px 0; }
        button {
          margin-top: 20px;
          padding: 12px 24px;
          background: #4a90e2;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
        }
        button:hover { background: #357abd; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📵 You're Offline</h1>
        <p>This page isn't cached yet.</p>
        <p>Please connect to the internet and visit this page once to enable offline access.</p>
        <button onclick="location.reload()">Try Again</button>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html' }
    }
  );
}

// Message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
