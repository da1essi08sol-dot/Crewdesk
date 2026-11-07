/* Crewdesk background worker: shows lock-screen notifications (with a buzz) and opens the right page when one is tapped.
   It doesn't cache anything — the app always loads fresh from the server. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.company ? `${d.title || 'Crewdesk'} — ${d.company}` : d.title || 'Crewdesk';
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: d.tag || undefined,
    renotify: !!d.tag, // a new message in the same chat still buzzes
    vibrate: [180, 80, 180], // Android; iPhones buzz by your Settings → Notifications → Crewdesk choices
    timestamp: Date.now(),
    data: { link: d.link || '#/home', cid: d.cid || '' },
  };
  const jobs = [self.registration.showNotification(title, opts)];
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : self.navigator.clearAppBadge().catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { link = '#/home', cid = '' } = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      w.postMessage({ type: 'open', link, cid });
      return w.focus();
    }
    return self.clients.openWindow((cid ? '/?cid=' + encodeURIComponent(cid) : '/') + link);
  })());
});

// The browser renewed this device's notification address: tell the server the new one.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const r = await fetch('/api/push/key', { credentials: 'same-origin' }); const { key } = await r.json();
      const pad = '='.repeat((4 - (key.length % 4)) % 4); const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await fetch('/api/push', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Crewdesk': '1' }, body: JSON.stringify(sub.toJSON()) });
    } catch (_) {}
  })());
});
