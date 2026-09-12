// طبقة رفيعة فوق مكتبة web-push: تهيئة مفاتيح VAPID مرة وحدة، وإرسال إشعار واحد
// مع تنظيف الاشتراكات المنتهية/الملغاة تلقائياً (410 Gone / 404 Not Found).

const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
// لازم يكون mailto: أو رابط https — Push Services (مثل Google/Mozilla) بتستخدمه
// للتواصل معك إذا صار في إساءة استخدام لسيرفرك.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:apphuda1@gmail.com';

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
} else {
  console.warn(
    '⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY غير موجودة بـ .env — إشعارات الأذان الحقيقية (Push) لن تعمل.\n' +
    '    ولّدها بأمر: node backend/scripts/generate-vapid-keys.js'
  );
}

function getVapidPublicKey() {
  return configured ? VAPID_PUBLIC_KEY : null;
}

function isConfigured() {
  return configured;
}

// يبعت إشعار Push واحد لاشتراك واحد. يرجع true لو نجح.
// عند 404/410 (الاشتراك انتهى أو المستخدم ألغى إذن الإشعارات من متصفحه) نحذفه
// تلقائياً من القاعدة عشان ما نضل نحاول عليه كل دقيقة بلا فايدة.
async function sendPushNotification(subscriptionRow, payload) {
  if (!configured) return false;

  const pushSubscription = {
    endpoint: subscriptionRow.endpoint,
    keys: { p256dh: subscriptionRow.p256dh, auth: subscriptionRow.auth },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    const statusCode = error?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscriptionRow.id);
      console.log(`🗑️  حذف اشتراك Push منتهي (id=${subscriptionRow.id})`);
    } else {
      console.error('push send error:', statusCode, error?.body || error?.message);
    }
    return false;
  }
}

module.exports = { getVapidPublicKey, isConfigured, sendPushNotification };
