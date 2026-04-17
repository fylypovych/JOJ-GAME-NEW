const CACHE_VERSION = 'v2';
const CACHE_NAME = `joj-game-${CACHE_VERSION}`;
const CARD_IMAGE_CACHE_NAME = `joj-card-images-${CACHE_VERSION}`;
const API_CACHE_NAME = `joj-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/ui-theme-day.png',
  '/ui-theme-night.png',
];

const CARD_IMAGE_PATTERNS = [
  '/cards/',
  '/card-assets/',
  '/resource-icons/',
  '/admin-icons/',
];

const API_PATTERNS = ['/api/'];

// Cache strategy: Cache First for static assets
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache First failed:', error);
    throw error;
  }
}

// Cache strategy: Network First for API
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Cache strategy: Stale While Revalidate for card images
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.error('Stale while revalidate failed:', error);
    return cachedResponse;
  });

  return cachedResponse ? cachedResponse : fetchPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Check if this is a card image request
  const isCardImage = CARD_IMAGE_PATTERNS.some((pattern) => url.pathname.startsWith(pattern));
  
  // Check if this is an API request
  const isApiRequest = API_PATTERNS.some((pattern) => url.pathname.startsWith(pattern));

  if (isCardImage) {
    event.respondWith(staleWhileRevalidate(event.request, CARD_IMAGE_CACHE_NAME));
    return;
  }

  if (isApiRequest) {
    event.respondWith(networkFirst(event.request, API_CACHE_NAME));
    return;
  }

  // Default to cache first for other static assets
  event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.includes(CACHE_VERSION)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })
  );
  self.clients.claim();
});
