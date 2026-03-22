const CACHE = 'dailywins-v2';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
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
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

// ── ALARM: fires a notification at the scheduled wake-up time
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_ALARM') {
    const { time, label } = e.data;
    scheduleAlarm(time, label);
  }
  if (e.data && e.data.type === 'CANCEL_ALARM') {
    if (self._alarmTimer) { clearTimeout(self._alarmTimer); self._alarmTimer = null; }
  }
});

function scheduleAlarm(timeStr, label) {
  if (self._alarmTimer) clearTimeout(self._alarmTimer);
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // schedule for tomorrow if already passed
  const delay = target - now;
  self._alarmTimer = setTimeout(() => {
    self.registration.showNotification('⏰ ' + (label || 'Wake up!'), {
      body: 'Time to rise and win the day 🌅 Open Daily Wins to log your habits.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'wake-alarm',
      renotify: true,
      requireInteraction: true,
      actions: [{ action: 'open', title: 'Open App' }]
    });
    // Reschedule for tomorrow
    scheduleAlarm(timeStr, label);
  }, delay);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if (c.url && 'focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
