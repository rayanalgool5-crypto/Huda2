/**
 * صفحة "مواقيت الصلاة": تجلب المواقيت من واجهة AlAdhan المجانية (aladhan.com)
 * وتشغّل الأذان تلقائياً عند دخول كل وقت، وتتيح مقارنة أكثر من مدينة/بلد.
 */
(() => {
  const API_ROOT = 'https://api.aladhan.com/v1';
  const STORAGE = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE) || {
    PRAYER_LOCATION_KEY: 'huda_prayer_location',
    PRAYER_COMPARE_KEY: 'huda_prayer_compare',
    PRAYER_SETTINGS_KEY: 'huda_prayer_settings',
    PRAYER_PLAYED_KEY: 'huda_prayer_played',
  };

  const PRAYER_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const ADHAN_PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']; // لا يُؤذَّن لوقت الشروق
  const PRAYER_LABELS = {
    Imsak: 'الإمساك', Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر',
    Asr: 'العصر', Sunset: 'الغروب', Maghrib: 'المغرب', Isha: 'العشاء', Midnight: 'منتصف الليل',
  };

  const els = {
    form: document.getElementById('prayer-location-form'),
    country: document.getElementById('prayer-country'),
    city: document.getElementById('prayer-city'),
    method: document.getElementById('prayer-method'),
    useLocation: document.getElementById('prayer-use-location'),
    status: document.getElementById('prayer-location-status'),
    heroLocation: document.getElementById('prayer-hero-location'),
    heroDate: document.getElementById('prayer-hero-date'),
    heroHijri: document.getElementById('prayer-hero-hijri'),
    nextName: document.getElementById('prayer-next-name'),
    nextCountdown: document.getElementById('prayer-next-countdown'),
    grid: document.getElementById('prayer-times-grid'),
    adhanToggle: document.getElementById('prayer-adhan-toggle'),
    pushStatus: document.getElementById('prayer-push-status'),
    reciter: document.getElementById('prayer-reciter'),
    testAdhan: document.getElementById('prayer-test-adhan'),
    audio: document.getElementById('prayer-adhan-audio'),
    compareForm: document.getElementById('prayer-compare-form'),
    compareCountry: document.getElementById('prayer-compare-country'),
    compareCity: document.getElementById('prayer-compare-city'),
    compareList: document.getElementById('prayer-compare-list'),
  };

  if (!els.grid) return;

  let primaryTimings = null; // { timings, dateInfo }
  let countdownTimer = null;
  let watchTimer = null;
  let compareCache = {}; // key -> timings
  // آخر موقع تم عرض مواقيته بنجاح، نستخدمه عند تفعيل إشعارات Push الحقيقية
  // (حتى لو التطبيق مغلق) عشان السيرفر يعرف يحسب مواقيت الصلاة لنفس الموقع.
  let currentLocationParams = null; // { type: 'city', city, country, method } أو { type: 'coords', latitude, longitude, method }

  // ===== أدوات مساعدة =====

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(Number(number) || 0);

  function format12Hour(h, m) { const hour = ((Number(h) + 11) % 12) + 1; const suffix = Number(h) < 12 ? 'ص' : 'م'; return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`; }

  function cleanTime(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return { h: Number(match[1]), m: Number(match[2]) };
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  async function fetchTimingsByCity(city, country, method) {
    const url = `${API_ROOT}/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${encodeURIComponent(method)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('تعذّر جلب مواقيت الصلاة لهذه المدينة');
    const json = await response.json();
    if (!json?.data?.timings) throw new Error('لم يتم العثور على بيانات لهذا الموقع');
    return json.data;
  }

  async function fetchTimingsByCoords(lat, lon, method) {
    const timestamp = Math.floor(Date.now() / 1000);
    const url = `${API_ROOT}/timings/${timestamp}?latitude=${lat}&longitude=${lon}&method=${encodeURIComponent(method)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('تعذّر جلب مواقيت الصلاة لموقعك');
    const json = await response.json();
    if (!json?.data?.timings) throw new Error('لم يتم العثور على بيانات لهذا الموقع');
    return json.data;
  }

  function setStatus(message, type = 'info') {
    if (!els.status) return;
    if (!message) { els.status.hidden = true; return; }
    els.status.hidden = false;
    els.status.textContent = message;
    els.status.classList.toggle('mem-warning', type === 'error');
  }

  // ===== العرض الرئيسي =====

  function renderPrimary(data, label) {
    primaryTimings = data;
    els.heroLocation.textContent = label;

    const gregorian = data.date?.readable || '';
    const hijri = data.date?.hijri;
    els.heroDate.textContent = gregorian || 'اليوم';
    els.heroHijri.textContent = hijri
      ? `${arabicNumber(hijri.day)} ${hijri.month?.ar || hijri.month?.en || ''} ${arabicNumber(hijri.year)} هـ`
      : '';

    els.grid.replaceChildren();
    PRAYER_ORDER.forEach((key) => {
      const card = document.createElement('div');
      card.className = 'prayer-time-card';
      card.dataset.prayer = key;
      const label = document.createElement('span');
      label.textContent = PRAYER_LABELS[key] || key;
      const value = document.createElement('strong');
      const parsed = cleanTime(data.timings[key]);
      value.textContent = parsed ? format12Hour(parsed.h, parsed.m) : '—';
      card.append(label, value);
      els.grid.appendChild(card);
    });

    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function getPrayerMinutes(timings, key) {
    const parsed = cleanTime(timings[key]);
    return parsed ? parsed.h * 60 + parsed.m : null;
  }

  function nextPrayerInfo(timings) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    let best = null;
    ADHAN_PRAYERS.concat(['Sunrise']).forEach((key) => {
      const minutes = getPrayerMinutes(timings, key);
      if (minutes === null) return;
      let diff = minutes - nowMinutes;
      if (diff < 0) diff += 24 * 60;
      if (!best || diff < best.diff) best = { key, diff, minutes };
    });
    return best;
  }

  function updateCountdown() {
    if (!primaryTimings) return;
    const next = nextPrayerInfo(primaryTimings.timings);
    els.grid.querySelectorAll('.prayer-time-card').forEach((card) => {
      card.classList.toggle('is-next', next && card.dataset.prayer === next.key);
    });
    if (!next) {
      els.nextName.textContent = '—';
      els.nextCountdown.textContent = '—:—:—';
      return;
    }
    els.nextName.textContent = PRAYER_LABELS[next.key] || next.key;
    const totalSeconds = Math.round(next.diff * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    els.nextCountdown.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ===== الأذان التلقائي =====

  function playAdhan() {
    if (!els.audio || !els.reciter?.value) return;
    els.audio.src = els.reciter.value;
    els.audio.play().catch(() => {
      HudaUtils.showToast('اضغط في أي مكان بالصفحة لتفعيل تشغيل الصوت تلقائياً من المتصفح.', 'info', 4500);
    });
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function notifyPrayer(key) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(`حان الآن وقت أذان ${PRAYER_LABELS[key]} 🕌`, {
        body: primaryTimings ? `${els.heroLocation.textContent} — ${new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', hour12: true })}` : '',
        icon: '../assets/huda-icon.png',
        tag: `huda-adhan-${key}-${todayKey()}`,
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch (error) {
      console.warn('Notification error:', error);
    }
  }

  function checkAdhanTime() {
    if (!els.adhanToggle?.checked || !primaryTimings) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const nowLabel = `${hh}:${mm}`;

    ADHAN_PRAYERS.forEach((key) => {
      const parsed = cleanTime(primaryTimings.timings[key]);
      if (!parsed) return;
      const timeLabel = format12Hour(parsed.h, parsed.m);
      if (timeLabel !== nowLabel) return;

      const playedMap = HudaUtils.storage.get(STORAGE.PRAYER_PLAYED_KEY) || {};
      const dayKey = todayKey();
      const flagKey = `${dayKey}-${key}`;
      if (playedMap[flagKey]) return;

      playAdhan();
      notifyPrayer(key);
      HudaUtils.showToast(`حان الآن وقت أذان ${PRAYER_LABELS[key]} 🕌`, 'success', 6000);
      playedMap[flagKey] = true;
      HudaUtils.storage.set(STORAGE.PRAYER_PLAYED_KEY, playedMap);
    });
  }

  // ===== تحميل الموقع الرئيسي =====

  async function loadPrimary({ city, country, method, label }) {
    setStatus('جاري جلب المواقيت…');
    els.grid.replaceChildren(Object.assign(document.createElement('div'), { className: 'loading', textContent: 'جاري جلب مواقيت الصلاة…' }));
    try {
      const data = await fetchTimingsByCity(city, country, method);
      renderPrimary(data, label || `${city}، ${countryArabicName(country)}`);
      HudaUtils.storage.set(STORAGE.PRAYER_LOCATION_KEY, { city, country, method });
      currentLocationParams = { type: 'city', city, country, method };
      setStatus('');
    } catch (error) {
      setStatus(HudaUtils.getErrorMessage(error), 'error');
      els.grid.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty-state', textContent: 'تعذّر جلب المواقيت، تحقق من اسم المدينة والدولة.' }));
    }
  }

  async function loadPrimaryByCoords(lat, lon, method) {
    setStatus('جاري تحديد موقعك وجلب المواقيت…');
    try {
      const data = await fetchTimingsByCoords(lat, lon, method);
      renderPrimary(data, 'موقعك الحالي');
      currentLocationParams = { type: 'coords', latitude: lat, longitude: lon, method };
      setStatus('');
    } catch (error) {
      setStatus(HudaUtils.getErrorMessage(error), 'error');
    }
  }

  function countryArabicName(value) {
    const option = Array.from(els.country.options).find((opt) => opt.value === value);
    return option ? option.textContent : value;
  }

  // ===== أحداث الموقع الرئيسي =====

  els.country?.addEventListener('change', () => {
    const selected = els.country.selectedOptions[0];
    const method = selected?.dataset.method;
    if (method) els.method.value = method;
  });

  els.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const city = els.city.value.trim();
    const country = els.country.value;
    const method = els.method.value;
    if (!city) {
      setStatus('اكتب اسم المدينة أولاً.', 'error');
      return;
    }
    loadPrimary({ city, country, method });
  });

  els.useLocation?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      HudaUtils.showToast('متصفحك لا يدعم تحديد الموقع الجغرافي.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => loadPrimaryByCoords(position.coords.latitude, position.coords.longitude, els.method.value),
      () => HudaUtils.showToast('تعذّر الوصول لموقعك، تحقق من صلاحيات المتصفح.', 'error')
    );
  });

  els.testAdhan?.addEventListener('click', playAdhan);

  // ===== Push الحقيقي (يوصل حتى لو التطبيق مغلق) =====

  async function syncPushSubscription(enabled) {
    if (!window.HudaPush || !HudaPush.isSupported()) {
      if (enabled) setPushStatus('إشعارات Push الحقيقية غير مدعومة هون (تحتاج HTTPS)، رح تشتغل فقط والصفحة مفتوحة.', 'info');
      return;
    }
    if (!enabled) {
      setPushStatus('');
      try { await HudaPush.unsubscribe(); } catch { /* تجاهل */ }
      return;
    }
    if (!currentLocationParams) {
      setPushStatus('اجلب مواقيت مدينتك أولاً عشان نقدر نفعّل الإشعار حتى والتطبيق مغلق.', 'error');
      return;
    }
    try {
      setPushStatus('جاري تفعيل إشعارات الأذان حتى لو التطبيق مغلق…', 'info');
      await HudaPush.subscribe(currentLocationParams);
      setPushStatus('✅ مفعّلة: رح توصلك حتى لو سكّرت التطبيق تمامًا.', 'success');
    } catch (error) {
      // فشل تفعيل الـ Push الحقيقي لا يوقف إشعار المتصفح العادي (يبقى شغّال والصفحة مفتوحة).
      setPushStatus(error.message || 'تعذّر تفعيل الإشعارات حتى والتطبيق مغلق، بس رح تشتغل والصفحة مفتوحة.', 'error');
    }
  }

  function setPushStatus(message, type) {
    if (!els.pushStatus) return;
    if (!message) { els.pushStatus.hidden = true; return; }
    els.pushStatus.hidden = false;
    els.pushStatus.textContent = message;
    els.pushStatus.className = `prayer-push-status prayer-push-status--${type || 'info'}`;
  }

  els.adhanToggle?.addEventListener('change', () => {
    if (els.adhanToggle.checked) requestNotificationPermission();
    HudaUtils.storage.set(STORAGE.PRAYER_SETTINGS_KEY, {
      enabled: els.adhanToggle.checked,
      reciter: els.reciter.value,
    });
    syncPushSubscription(els.adhanToggle.checked);
  });

  els.reciter?.addEventListener('change', () => {
    HudaUtils.storage.set(STORAGE.PRAYER_SETTINGS_KEY, {
      enabled: els.adhanToggle.checked,
      reciter: els.reciter.value,
    });
  });

  // ===== مقارنة أكثر من بلد =====

  function getCompareList() {
    return HudaUtils.storage.get(STORAGE.PRAYER_COMPARE_KEY) || [];
  }

  function saveCompareList(list) {
    HudaUtils.storage.set(STORAGE.PRAYER_COMPARE_KEY, list);
  }

  async function renderCompareCard(entry) {
    const card = document.createElement('article');
    card.className = 'prayer-compare-card';
    card.innerHTML = `
      <button type="button" class="prayer-compare-remove" aria-label="إزالة">✕</button>
      <h3>${entry.city}، ${entry.country}</h3>
      <p class="prayer-compare-next">جاري التحميل…</p>
      <div class="prayer-compare-times"></div>`;

    card.querySelector('.prayer-compare-remove').addEventListener('click', () => {
      const list = getCompareList().filter((item) => !(item.city === entry.city && item.country === entry.country));
      saveCompareList(list);
      card.remove();
    });

    els.compareList.appendChild(card);

    try {
      const data = await fetchTimingsByCity(entry.city, entry.country, entry.method || 3);
      const cacheKey = `${entry.city}|${entry.country}`;
      compareCache[cacheKey] = data.timings;

      const timesWrap = card.querySelector('.prayer-compare-times');
      timesWrap.replaceChildren();
      ADHAN_PRAYERS.forEach((key) => {
        const parsed = cleanTime(data.timings[key]);
        const cell = document.createElement('div');
        cell.innerHTML = `<span>${PRAYER_LABELS[key]}</span><b>${parsed ? format12Hour(parsed.h, parsed.m) : '—'}</b>`;
        timesWrap.appendChild(cell);
      });

      const next = nextPrayerInfo(data.timings);
      const nextLabel = card.querySelector('.prayer-compare-next');
      if (next) {
        const h = Math.floor(next.diff / 60);
        const m = Math.round(next.diff % 60);
        nextLabel.textContent = `القادمة: ${PRAYER_LABELS[next.key]} — ${format12Hour(Math.floor(next.minutes / 60), next.minutes % 60)}`;
      } else {
        nextLabel.textContent = '';
      }
    } catch (error) {
      card.querySelector('.prayer-compare-next').textContent = 'تعذّر جلب مواقيت هذه المدينة.';
    }
  }

  function renderCompareList() {
    els.compareList.replaceChildren();
    getCompareList().forEach((entry) => renderCompareCard(entry));
  }

  els.compareForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const city = els.compareCity.value.trim();
    const country = els.compareCountry.value.trim();
    if (!city || !country) {
      HudaUtils.showToast('اكتب اسم المدينة والدولة للمقارنة.', 'error');
      return;
    }
    const list = getCompareList();
    if (list.some((item) => item.city.toLowerCase() === city.toLowerCase() && item.country.toLowerCase() === country.toLowerCase())) {
      HudaUtils.showToast('هذه المدينة مضافة بالفعل للمقارنة.', 'info');
      return;
    }
    const entry = { city, country, method: 3 };
    list.push(entry);
    saveCompareList(list);
    renderCompareCard(entry);
    els.compareCity.value = '';
    els.compareCountry.value = '';
  });

  // ===== التهيئة =====

  function init() {
    const savedSettings = HudaUtils.storage.get(STORAGE.PRAYER_SETTINGS_KEY);
    if (savedSettings) {
      els.adhanToggle.checked = Boolean(savedSettings.enabled);
      if (savedSettings.reciter) els.reciter.value = savedSettings.reciter;
      if (els.adhanToggle.checked) requestNotificationPermission();
    }

    const savedLocation = HudaUtils.storage.get(STORAGE.PRAYER_LOCATION_KEY);
    const primaryLoad = savedLocation
      ? (() => {
          els.country.value = savedLocation.country;
          els.city.value = savedLocation.city;
          els.method.value = savedLocation.method;
          return loadPrimary(savedLocation);
        })()
      : (() => {
          const selected = els.country.selectedOptions[0];
          if (selected?.dataset.method) els.method.value = selected.dataset.method;
          return loadPrimary({ city: els.city.value.trim(), country: els.country.value, method: els.method.value });
        })();

    // بعد ما تنجلب المواقيت (وتتحدد currentLocationParams)، إذا المفتاح كان
    // مفعّل من قبل نعيد مزامنة اشتراك الـ Push الحقيقي بنفس الموقع الحالي.
    if (savedSettings?.enabled) {
      primaryLoad.then(() => syncPushSubscription(true));
    }

    renderCompareList();

    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(checkAdhanTime, 15000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
