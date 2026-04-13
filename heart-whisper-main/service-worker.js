const CACHE_NAME = 'heart-whisper-v2.2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/bible-reader.js',
  '/js/storage.js',
  '/js/audio.js',
  '/js/library.js',
  '/js/gacha.js',
  '/app-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Cache first, fallback to network
      return response || fetch(event.request);
    }).catch(() => {
      // Fallback
    })
  );
});
