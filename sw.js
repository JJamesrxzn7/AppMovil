/**
 * Service Worker para GeoLive (PWA - Progressive Web App)
 * Garantiza funcionamiento offline y carga instantánea sin conexión a internet
 */

const CACHE_NAME = 'geolive-pwa-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/gps-tracker.js',
  './js/map-monitor.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

// 1. Instalación del Service Worker y precacheo de recursos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-cacheando assets de la aplicación');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activación y limpieza de caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando cache antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia de respuesta a peticiones
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // No interceptar peticiones de Firebase Firestore o Google Maps API (deben fluir a la red)
  if (
    requestUrl.origin.includes('firestore.googleapis.com') ||
    requestUrl.origin.includes('firebaseio.com') ||
    requestUrl.origin.includes('google.com') ||
    requestUrl.origin.includes('googleapis.com')
  ) {
    return;
  }

  // Estrategia Network-First con fallback a Cache para recursos locales
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si la respuesta es válida, clonar en cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si se corta el internet, servir desde la Cache local
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback final a index.html para navegación SPA
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
