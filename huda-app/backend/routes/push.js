// مسارات إشعارات الأذان الحقيقية (Web Push).
// الفرق عن Notification API العادية: هاي بتوصل حتى لو المستخدم مسكّر
// التبويب/المتصفح تمامًا، لأنها بتمر عبر متصفح المستخدم نفسه (Push Service)
// مش عبر صفحة مفتوحة عندنا.

const express = require('express');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const { getVapidPublicKey } = require('../lib/push-service');

const router = express.Router();

// عام (بدون تسجيل دخول) — الفرونت اند يحتاجه قبل الاشتراك عشان يبني الاشتراك بالمتصفح.
router.get('/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ message: 'إشعارات Push غير مُهيّأة على السيرفر بعد (VAPID keys ناقصة).' });
  }
  res.json({ publicKey: key });
});

// كل ما بعد هيك يحتاج تسجيل دخول — الاشتراك مربوط بحساب المستخدم.
router.use(requireAuth);

function normalizeLocation(body) {
  const location = body.location || {};
  if (location.type === 'coords' && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
    return {
      location_type: 'coords',
      city: null,
      country: null,
      method: String(location.method || '3'),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  }
  if (!location.city || !location.country) return null;
  return {
    location_type: 'city',
    city: String(location.city).trim(),
    country: String(location.country).trim(),
    method: String(location.method || '3'),
    latitude: null,
    longitude: null,
  };
}

// تسجيل/تحديث اشتراك: الفرونت اند بيبعت subscription object من PushManager
// بالإضافة لموقع المستخدم المفضّل لحساب مواقيت الصلاة.
router.post('/subscribe', (req, res) => {
  try {
    const userId = req.session.userId;
    const { subscription } = req.body || {};

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'بيانات الاشتراك ناقصة.' });
    }

    const loc = normalizeLocation(req.body || {});
    if (!loc) {
      return res.status(400).json({ message: 'حدّد موقعك (مدينة ودولة، أو موقعك الجغرافي) أولاً.' });
    }

    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(subscription.endpoint);

    if (existing) {
      db.prepare(
        `UPDATE push_subscriptions
         SET user_id = ?, p256dh = ?, auth = ?, location_type = ?, city = ?, country = ?, method = ?,
             latitude = ?, longitude = ?, last_notified_date = NULL, last_notified_prayers = '[]',
             updated_at = datetime('now')
         WHERE endpoint = ?`
      ).run(
        userId, subscription.keys.p256dh, subscription.keys.auth,
        loc.location_type, loc.city, loc.country, loc.method, loc.latitude, loc.longitude,
        subscription.endpoint
      );
    } else {
      db.prepare(
        `INSERT INTO push_subscriptions
         (user_id, endpoint, p256dh, auth, location_type, city, country, method, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth,
        loc.location_type, loc.city, loc.country, loc.method, loc.latitude, loc.longitude
      );
    }

    res.json({ message: 'تم تفعيل إشعارات الأذان حتى لو التطبيق مغلق.' });
  } catch (error) {
    console.error('push/subscribe error:', error);
    res.status(500).json({ message: 'تعذّر تفعيل الاشتراك، حاول مرة أخرى.' });
  }
});

// إلغاء الاشتراك (عند تعطيل المفتاح من الإعدادات).
router.post('/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: 'endpoint مطلوب.' });
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.session.userId);
    res.json({ message: 'تم إلغاء تفعيل إشعارات الأذان.' });
  } catch (error) {
    console.error('push/unsubscribe error:', error);
    res.status(500).json({ message: 'تعذّر إلغاء الاشتراك.' });
  }
});

// يخبر الفرونت اند إذا في اشتراك فعّال أصلاً لهاي البيانات (لعرض حالة المفتاح بعد تسجيل الدخول من جهاز آخر).
router.get('/status', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT id, city, country, location_type FROM push_subscriptions WHERE user_id = ?')
      .all(req.session.userId);
    res.json({ subscriptions: rows });
  } catch (error) {
    res.status(500).json({ message: 'تعذّر جلب حالة الاشتراك.' });
  }
});

module.exports = router;
