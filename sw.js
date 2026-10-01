const CACHE = 'firecraft-v1';
const STATIC = [
  '/',
  '/index.html',
  '/features.html',
  '/rules.html',
  '/faq.html',
  '/css/style.css',
  '/js/app.js',
  '/js/ads.js',
  '/js/bg.js',
  '/images/logo-192.png',
  '/images/logo-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

/* ── Push notification handler ── */
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'FireCraft SMP 🌿';
  const options = {
    body: data.body || 'Check what\'s new on FireCraft SMP!',
    icon: '/images/logo-192.png',
    badge: '/images/logo-192.png',
    image: data.image || undefined,
    data: { url: data.url || 'https://www.firecraft.fun' },
    actions: [
      { action: 'open', title: 'Open Website' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
    tag: data.tag || 'firecraft-notif',
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = (e.notification.data && e.notification.data.url) || 'https://www.firecraft.fun';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) {
      if (c.url === url && 'focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
