/**
 * عميل واجهات الحفظ والإحصائيات.
 * كل الدوال هنا تتطلب جلسة مسجّلة؛ ولا يوجد أي تخزين محلي للتقدّم —
 * قاعدة بيانات المستخدم هي المصدر الوحيد لحالة الحفظ.
 */

const HudaMemorization = (() => {
  const BASE = CONFIG.API.BASE_URL;

  class AuthRequiredError extends Error {
    constructor() {
      super('يجب تسجيل الدخول لحفظ تقدّمك.');
      this.name = 'AuthRequiredError';
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options,
    });

    if (response.status === 401) throw new AuthRequiredError();

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'تعذّر تنفيذ الطلب.');
    return data;
  }

  const listSurahProgress = () => request('/memorization/surahs');
  const getSurahProgress = (surahNumber) => request(`/memorization/surahs/${surahNumber}`);

  const recordAttempt = (payload) =>
    request('/memorization/attempts', { method: 'POST', body: JSON.stringify(payload) });

  const recordSurahReview = (surahNumber, success = true) =>
    request(`/memorization/surahs/${surahNumber}/review`, {
      method: 'POST',
      body: JSON.stringify({ success }),
    });

  const getDueReviews = () => request('/memorization/due');

  const getQuickReview = (limit = 10, surahNumber) =>
    request(`/memorization/quick-review?limit=${limit}${surahNumber ? `&surah=${surahNumber}` : ''}`);

  const getStats = () => request('/stats');

  return {
    AuthRequiredError,
    listSurahProgress,
    getSurahProgress,
    recordAttempt,
    recordSurahReview,
    getDueReviews,
    getQuickReview,
    getStats,
  };
})();

if (typeof window !== 'undefined') {
  window.HudaMemorization = HudaMemorization;
}
