/**
 * Service Worker خاص بإشعارات الأذان الحقيقية (Web Push).
 * يشتغل بالخلفية من طرف المتصفح نفسه — حتى لو تطبيق هُدى مسكّر تمامًا —
 * ويستلم أي Push يبعته سيرفرنا (backend/lib/prayer-push-scheduler.js) ويعرضه
 * كإشعار نظام حقيقي.
 *
 * لازم يكون هذا الملف بجذر الموقع (frontend/sw.js → https://YOUR-DOMAIN/sw.js)
 * عشان يغطي كل صفحات الموقع (Service Worker scope = المسار اللي هو موجود فيه).
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'حان الآن وقت الصلاة 🕌', body: '', url: '/pages/prayer-times.html' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/assets/logo.png',
      badge: '/assets/logo.png',
      tag: payload.tag || 'huda-adhan',
      data: { url: payload.url || '/pages/prayer-times.html' },
      dir: 'rtl',
      lang: 'ar',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/pages/prayer-times.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
