const CACHE_NAME = 'el-aw-v1';
const assets = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png'
];

// تثبيت الـ Service Worker وحفظ الملفات
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// جلب البيانات (عشان يفتح حتى لو النت فصل)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
