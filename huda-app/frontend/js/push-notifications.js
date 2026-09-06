/**
 * HudaPush: يدير تسجيل Service Worker والاشتراك/إلغاء الاشتراك في إشعارات
 * الأذان الحقيقية (Web Push) — التي تصل حتى لو التطبيق مسكّر تمامًا.
 *
 * الفرق عن Notification API العادية (المستخدمة بـ prayer-times.js):
 * - Notification API: تشتغل بس والصفحة مفتوحة (ولو بتبويب ثاني).
 * - Web Push (هذا الملف): تحتاج تسجيل دخول + HTTPS، وتوصل حتى والتطبيق مغلق.
 */

const HudaPush = (() => {
  const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.API?.BASE_URL) || '/api';

  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function registerServiceWorker() {
    if (!isSupported()) return null;
    // scope الافتراضي = مسار الملف نفسه؛ بما إن sw.js بجذر الموقع فهو يغطي كل الصفحات.
    return navigator.serviceWorker.register('/sw.js');
  }

  async function getVapidPublicKey() {
    const response = await fetch(`${API_BASE}/push/vapid-public-key`);
    if (!response.ok) throw new Error('إشعارات Push غير مفعّلة على السيرفر حالياً.');
    const json = await response.json();
    return json.publicKey;
  }

  /**
   * يفعّل الاشتراك: يطلب إذن الإشعارات، يسجل Service Worker، يبني اشتراك
   * PushManager، ويبعته للباك اند مع بيانات موقع المستخدم.
   * location: { type: 'city', city, country, method } أو { type: 'coords', latitude, longitude, method }
   * يرمي Error برسالة عربية واضحة عند أي فشل (يُستحسن التقاطها بـ try/catch بالمستدعي).
   */
  async function subscribe(location) {
    if (!isSupported()) {
      throw new Error('متصفحك أو الاتصال الحالي لا يدعم إشعارات Push الحقيقية (يحتاج HTTPS).');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('لازم توافق على إذن الإشعارات من المتصفح عشان تفعّل هذه الميزة.');
    }

    const registration = await registerServiceWorker();
    if (!registration) throw new Error('تعذّر تسجيل Service Worker.');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await getVapidPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const response = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subscription, location }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('سجّل الدخول أولاً عشان تفعّل إشعارات الأذان حتى لو التطبيق مغلق.');
      }
      throw new Error(err.message || 'تعذّر تفعيل الاشتراك، حاول مرة أخرى.');
    }

    return true;
  }

  async function unsubscribe() {
    if (!isSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    try {
      await fetch(`${API_BASE}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } finally {
      await subscription.unsubscribe();
    }
  }

  async function isSubscribed() {
    if (!isSupported()) return false;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  }

  return { isSupported, subscribe, unsubscribe, isSubscribed, registerServiceWorker };
})();

if (typeof window !== 'undefined') window.HudaPush = HudaPush;
