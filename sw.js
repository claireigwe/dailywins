const CACHE = 'dailywins-v7';
const ASSETS = ['/dailywins/', '/dailywins/index.html', '/dailywins/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/dailywins/index.html')))
  );
});

// ── ALARM via message (best-effort — works when app is open or recently used)
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_ALARM') scheduleAlarm(e.data.time, e.data.label);
  if (e.data.type === 'CANCEL_ALARM') { if (self._alarmTimer) { clearTimeout(self._alarmTimer); self._alarmTimer = null; } }
});

function scheduleAlarm(timeStr, label) {
  if (self._alarmTimer) clearTimeout(self._alarmTimer);
  if (!timeStr) return;
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;
  // Only schedule if within 12 hours (SW may be killed beyond that)
  if (delay > 12 * 60 * 60 * 1000) return;
  self._alarmTimer = setTimeout(() => {
    self.registration.showNotification('Wake up! — Daily Wins', {
      body: 'Time to rise and win the day! Open Daily Wins to log your habits.',
      icon: '/dailywins/icons/icon-192.png',
      badge: '/dailywins/icons/icon-192.png',
      tag: 'wake-alarm',
      renotify: true,
      requireInteraction: true,
    });
    scheduleAlarm(timeStr, label);
  }, delay);
}

// ── Periodic sync (fires when phone is online, even if app is closed)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-alarm-check') {
    e.waitUntil(self.clients.matchAll().then(clients => {
      // Wake up a client to check alarm
      if (clients.length > 0) clients[0].postMessage({ type: 'ALARM_CHECK' });
    }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if (c.url && 'focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('/dailywins/');
  }));
});
