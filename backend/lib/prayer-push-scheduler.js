// المجدول المسؤول عن إشعارات الأذان الحقيقية (Push): يشتغل كل دقيقة طول ما
// السيرفر شغّال، يحسب مواقيت الصلاة لموقع كل مشترك عبر AlAdhan API (نفس مصدر
// الفرونت اند)، ويبعت إشعار Push بالضبط لحظة دخول كل وقت صلاة (فجر/ظهر/عصر/
// مغرب/عشاء) — حتى لو المستخدم مسكّر التطبيق تمامًا.
//
// ⚠️ مهم عند النشر: هاي الميزة تحتاج السيرفر يضل شغّال بشكل دائم (Always-On).
// بعض منصات الاستضافة المجانية (مثل خطة Render المجانية) توقف السيرفر تلقائياً
// بعد فترة عدم استخدام، وبهالحالة رح تفوت أوقات إشعارات. للاستخدام الجدّي لازم
// خطة "Always-On" أو خدمة "keep-alive" ping تحافظ على السيرفر صاحي.

const db = require('../db');
const { isConfigured, sendPushNotification } = require('./push-service');

const ALADHAN_API_ROOT = 'https://api.aladhan.com/v1';
const ADHAN_PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_LABELS_AR = {
  Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء',
};

const CHECK_INTERVAL_MS = 60 * 1000; // كل دقيقة

// كاش مواقيت اليوم لكل موقع، عشان ما نضرب AlAdhan API لكل مشترك لحاله كل دقيقة.
// المفتاح: توقيع الموقع (مدينة/دولة/طريقة أو إحداثيات) + تاريخ اليوم بتقويم UTC كتقريب.
// القيمة: { timings, timezone, fetchedAt }
const timingsCache = new Map();

function locationSignature(sub) {
  return sub.location_type === 'coords'
    ? `coords:${sub.latitude},${sub.longitude},${sub.method}`
    : `city:${sub.city}|${sub.country}|${sub.method}`;
}

function todayUtcKey() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTimings(sub) {
  const url =
    sub.location_type === 'coords'
      ? `${ALADHAN_API_ROOT}/timings/${Math.floor(Date.now() / 1000)}?latitude=${sub.latitude}&longitude=${sub.longitude}&method=${encodeURIComponent(sub.method)}`
      : `${ALADHAN_API_ROOT}/timingsByCity?city=${encodeURIComponent(sub.city)}&country=${encodeURIComponent(sub.country)}&method=${encodeURIComponent(sub.method)}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`AlAdhan API error: ${response.status}`);
  const json = await response.json();
  const timings = json?.data?.timings;
  const timezone = json?.data?.meta?.timezone;
  if (!timings || !timezone) throw new Error('استجابة AlAdhan ناقصة (timings/timezone)');
  return { timings, timezone };
}

async function getTimingsCached(sub) {
  const key = `${locationSignature(sub)}::${todayUtcKey()}`;
  const cached = timingsCache.get(key);
  if (cached) return cached;

  const data = await fetchTimings(sub);
  timingsCache.set(key, data);
  // تنظيف الكاش القديم بين حين وآخر عشان ما يكبر بلا حدود.
  if (timingsCache.size > 5000) timingsCache.clear();
  return data;
}

// "الآن" بصيغة HH:mm داخل منطقة زمنية معيّنة (منطقة موقع المستخدم، مش منطقة السيرفر).
function nowHHmmInTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date()); // "HH:mm"
  } catch {
    return null;
  }
}

function localDateKeyInTimezone(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); // "YYYY-MM-DD"
  } catch {
    return todayUtcKey();
  }
}

function cleanTime(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

async function checkSubscription(sub) {
  let timingsData;
  try {
    timingsData = await getTimingsCached(sub);
  } catch (error) {
    console.warn(`تعذّر جلب مواقيت الصلاة لاشتراك id=${sub.id}:`, error.message);
    return;
  }

  const { timings, timezone } = timingsData;
  const nowLabel = nowHHmmInTimezone(timezone);
  if (!nowLabel) return;

  const localDateKey = localDateKeyInTimezone(timezone);
  const alreadySentToday = sub.last_notified_date === localDateKey;
  const sentPrayers = alreadySentToday ? JSON.parse(sub.last_notified_prayers || '[]') : [];

  for (const key of ADHAN_PRAYERS) {
    const prayerTime = cleanTime(timings[key]);
    if (!prayerTime || prayerTime !== nowLabel) continue;
    if (sentPrayers.includes(key)) continue; // انبعت أصلاً هاليوم

    const sent = await sendPushNotification(sub, {
      title: `حان الآن وقت أذان ${PRAYER_LABELS_AR[key]} 🕌`,
      body: sub.city ? `${sub.city}، ${sub.country}` : 'حسب موقعك الحالي',
      tag: `huda-adhan-${key}-${localDateKey}`,
      url: '/pages/prayer-times.html',
    });

    if (sent) {
      sentPrayers.push(key);
      db.prepare(
        `UPDATE push_subscriptions SET last_notified_date = ?, last_notified_prayers = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(localDateKey, JSON.stringify(sentPrayers), sub.id);
    }
  }
}

async function runCheck() {
  if (!isConfigured()) return; // ما في مفاتيح VAPID → ما في شي نعمله

  let subscriptions;
  try {
    subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
  } catch (error) {
    console.error('تعذّر قراءة اشتراكات Push من القاعدة:', error);
    return;
  }
  if (subscriptions.length === 0) return;

  // نعالج الاشتراكات بالتوازي (مع حد أقصى بسيط) بدل تسلسلي، لأن عدد المشتركين
  // ممكن يكبر، وكل واحد فيه استدعاء شبكة (AlAdhan/web-push).
  const BATCH_SIZE = 25;
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((sub) => checkSubscription(sub).catch((err) => console.error('checkSubscription error:', err))));
  }
}

let intervalHandle = null;

function start() {
  if (intervalHandle) return; // لا تبدأ مرتين
  if (!isConfigured()) {
    console.warn('⏸️  مجدول إشعارات الأذان (Push) متوقف: مفاتيح VAPID غير مُهيّأة.');
    return;
  }
  console.log('✓ مجدول إشعارات الأذان (Push) شغّال — يفحص كل دقيقة.');
  // نفحص فوراً عند الإقلاع، وبعدين كل دقيقة.
  runCheck().catch((err) => console.error('prayer-push-scheduler initial run error:', err));
  intervalHandle = setInterval(() => {
    runCheck().catch((err) => console.error('prayer-push-scheduler run error:', err));
  }, CHECK_INTERVAL_MS);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop };
