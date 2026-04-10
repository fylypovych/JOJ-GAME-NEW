const CACHE_NAME = 'joj-game-v1';
const CARD_IMAGE_CACHE_NAME = 'joj-card-images-v1';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this is a card image request
  const isCardImage = CARD_IMAGE_PATTERNS.some((pattern) => url.pathname.startsWith(pattern));

  if (isCardImage) {
    event.respondWith(
      caches.open(CARD_IMAGE_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) {
            return response;
          }

          return fetch(event.request).then((response) => {
            // Clone the response before caching
            const responseToCache = response.clone();
            
            // Cache the image for 1 year
            cache.put(event.request, responseToCache);
            
            return response;
          });
        });
      })
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== CARD_IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
