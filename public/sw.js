/* Holm Parlay service worker.
 * Caches the last successful copy of the week data and the static icons, and shows Web Push alerts.
 * HTML and Next chunks are network-first so a new deploy is not stuck behind an old shell. */
const CACHE = 'holm-shell-v3';
const PRECACHE = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon-48.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function cacheable(url) {
  if (url.pathname === '/api/weeks') return true;
  if (url.pathname === '/api/pick') return true;
  if (url.pathname === '/league-lore.json' || url.pathname === '/parlay-history.json') return true;
  if (url.pathname === '/manifest.webmanifest') return true;
  if (url.pathname.startsWith('/icon') || url.pathname.startsWith('/emblem') || url.pathname.startsWith('/apple-touch') || url.pathname.startsWith('/favicon')) return true;
  return false;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const week = await cache.match('/week');
      if (week) return week;
    }
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' || cacheable(url)) event.respondWith(networkFirst(request));
});

self.addEventListener('push', (event) => {
  let data = { title: 'Holm Parlay', body: 'The ticket moved.', url: '/week', tag: 'holm' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) { /* keep the fallback copy */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/favicon-48.png',
    tag: data.tag || data.title,
    data: { url: data.url || '/week' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/week', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  }));
});
