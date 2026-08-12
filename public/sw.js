const JOJ_CACHE_PREFIXES = ['joj-game-', 'joj-card-images-', 'joj-api-'];

const clearLegacyCaches = async () => {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) =>
        JOJ_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix)),
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clearLegacyCaches().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_JOJ_CACHES') return;
  event.waitUntil(clearLegacyCaches());
});
