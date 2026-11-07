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
    vibrate: d.urgent ? [600, 200, 600, 200, 600, 200, 1200] : [180, 80, 180], // Android; iPhones buzz by your Settings → Notifications → Crewdesk choices
    requireInteraction: !!d.urgent, // safety alerts stay on screen until someone deals with them
    silent: false,
    timestamp: Date.now(),
    data: { link: d.link || '#/home', cid: d.cid || '', session: d.session || '', kind: d.kind || '' },
  };
  // Stay safe: check in straight from the notification (Android shows these buttons, even on the lock screen).
  if (d.kind === 'checkin' && d.session && d.cid) opts.actions = [{ action: 'checkin', title: '✓ Check in' }, { action: 'open', title: 'Open' }];
  const jobs = [self.registration.showNotification(title, opts)];
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : self.navigator.clearAppBadge().catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { link = '#/home', cid = '', session = '' } = e.notification.data || {};
  if (e.action === 'checkin' && cid && session) {
    e.waitUntil((async () => {
      try {
        const r = await fetch(`/api/c/${encodeURIComponent(cid)}/lone/${encodeURIComponent(session)}/checkin`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Crewdesk': '1' }, body: '{}' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'failed');
        await self.registration.showNotification('Checked in ✓', { body: 'Stay safe. Your next check-in has been set.', icon: '/icon-192.png', badge: '/favicon-32.png', tag: 'lone-ok', silent: true });
      } catch (err) {
        await self.registration.showNotification('Couldn’t check in', { body: 'Tap to open Crewdesk and check in.', icon: '/icon-192.png', tag: 'lone-due', requireInteraction: true, data: { link: '#/lone/checkin', cid } });
      }
    })());
    return;
  }
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
