/* ============================================================
   Service worker del dashboard Flopilove.
   Estrategia network-first: siempre intenta traer lo último y,
   sin conexión, sirve la copia en caché (la app sigue abriendo
   offline; la generación con IA necesita red, obviamente).
   Sube la versión del caché al cambiar archivos del app shell.
   ============================================================ */

const CACHE = 'flopilove-v2';
const APP_SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'providers.js',
  'airtable.js',
  'db.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'studio/',
  'studio/index.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (!res.ok) {
          // El servidor respondió con error: mejor la copia buena en caché, si existe
          return caches.match(req, { ignoreSearch: true }).then((hit) => hit || res);
        }
        // No se cachean URLs con parámetros (p. ej. studio/?prompt=...) para no crecer sin límite
        if (!new URL(req.url).search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
