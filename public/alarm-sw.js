// Shows alarm pushes sent by /api/alarms through Firebase Cloud Messaging.
//
// No Firebase SDK here on purpose: a plain push listener always displays a
// notification, including while the app is open. iOS revokes push permission
// from a site whose pushes arrive without one.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || payload.notification || {};
  const title = data.title || 'Alarm';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/trade-tracker-icon-transparent.png',
      badge: '/trade-tracker-icon-transparent.png',
      // A distinct tag per push so back-to-back alarms each get their own banner.
      tag: `alarm-${Date.now()}`,
      requireInteraction: true,
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const appWindow = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (appWindow) return appWindow.focus();
      return self.clients.openWindow(destination);
    })
  );
});
