/**
 * تذكيرات المراجعة الدورية: تفحص ما استحقّ المراجعة في حساب المستخدم
 * وتعرض تنبيه "وقت مراجعة سورة [اسم السورة]" داخل التطبيق وعبر إشعار المتصفح.
 */

(() => {
  const CHECK_INTERVAL = 30 * 60 * 1000; // كل نصف ساعة
  const LAST_NOTICE_KEY = 'huda_last_review_notice';
  const NOTICE_COOLDOWN = 6 * 60 * 60 * 1000; // لا نزعج المستخدم أكثر من مرة كل ٦ ساعات

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(number);
  const quranPath = () => (location.pathname.includes('/pages/') ? 'quran.html#memorize' : 'pages/quran.html#memorize');

  function recentlyNotified() {
    const last = Number(HudaUtils.storage.get(LAST_NOTICE_KEY)) || 0;
    return Date.now() - last < NOTICE_COOLDOWN;
  }

  function markNotified() {
    HudaUtils.storage.set(LAST_NOTICE_KEY, Date.now());
  }

  function showBanner(message) {
    const banner = document.getElementById('review-reminder');
    if (!banner) return;
    const link = banner.querySelector('a');
    banner.querySelector('span').textContent = message;
    if (link) link.href = quranPath();
    banner.hidden = false;
  }

  function pushNotification(message) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('هُدى — وقت المراجعة', { body: message, icon: '/assets/logo.png' });
  }

  function buildMessage(due) {
    const surah = due.surahs[0];
    if (surah) {
      const extra = due.surahs.length > 1 ? ` و${arabicNumber(due.surahs.length - 1)} سورة أخرى` : '';
      return `وقت مراجعة سورة ${surah.surahName || arabicNumber(surah.surahNumber)}${extra}`;
    }
    return `لديك ${arabicNumber(due.ayahs.length)} آية بحاجة إلى مراجعة اليوم`;
  }

  async function checkDueReviews() {
    try {
      const user = await Huda.getSession();
      if (!user) return;

      const due = await HudaMemorization.getDueReviews();
      if (!due.surahs.length && !due.ayahs.length) return;

      const message = buildMessage(due);
      showBanner(message);

      if (!recentlyNotified()) {
        markNotified();
        HudaUtils.showToast(`${message} — افتح "مراجعة سريعة" لتثبيت حفظك.`, 'info', 6000);
        pushNotification(message);
      }
    } catch (error) {
      if (!(error instanceof HudaMemorization.AuthRequiredError)) {
        console.warn('Review reminder check failed:', error);
      }
    }
  }

  // إذن الإشعارات يُطلب عند تفاعل المستخدم فقط (سياسة المتصفحات).
  function wireNotificationOptIn() {
    const button = document.getElementById('enable-review-notifications');
    if (!button || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      button.hidden = true;
      return;
    }

    button.addEventListener('click', async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        button.hidden = true;
        HudaUtils.showToast('سنذكّرك بمواعيد المراجعة إن شاء الله.', 'success');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireNotificationOptIn();
    checkDueReviews();
    window.setInterval(checkDueReviews, CHECK_INTERVAL);
  });
})();
