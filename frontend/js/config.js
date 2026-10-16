/**
 * Configuration constants for Huda frontend
 * These values are used across the application
 */


const PRODUCTION_API_BASE_URL = 'https://huda0.onrender.com/api';

const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const resolvedApiBaseUrl = isLocalDev ? '/api' : PRODUCTION_API_BASE_URL;

const CONFIG = {
  // API Configuration
  API: {
    BASE_URL: resolvedApiBaseUrl,
    ENDPOINTS: {
      AUTH: '/auth',
      PROGRESS: '/progress',
      HEALTH: '/health'
    },
    TIMEOUT: 10000, // ms
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000 // ms
  },

  // Session & Storage
  STORAGE: {
    USER_KEY: 'huda_user',
    THEME_KEY: 'huda_theme',
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    PRAYER_LOCATION_KEY: 'huda_prayer_location',
    PRAYER_COMPARE_KEY: 'huda_prayer_compare',
    PRAYER_SETTINGS_KEY: 'huda_prayer_settings',
    PRAYER_PLAYED_KEY: 'huda_prayer_played'
  },

  // UI & UX
  UI: {
    ANIMATION_DURATION: 300, // ms
    TOAST_DURATION: 3000, // ms
    MAX_RETRIES: 3
  },

  // Validation Rules
  VALIDATION: {
    NAME: {
      MIN: 2,
      MAX: 50
    },
    EMAIL: {
      PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    PASSWORD: {
      MIN: 8,
      MAX: 128
    }
  }
};

// ===== بديل كوكي الطرف الثالث =====
// الفرونت (Netlify) والباك (Render) على نطاقين مختلفين، وبعض المتصفحات (Safari/Brave/Firefox)
// بتحجب كوكي الجلسة بينهم. فبنخزّن توكن الجلسة اللي بيرجعه السيرفر عند الدخول/التسجيل
// وبنرسله بهيدر Authorization مع كل طلب للـAPI (نفس الـAPI ونفس الروابط بدون تغيير).
(function () {
  if (typeof window === 'undefined' || !window.fetch || window.__hudaFetchPatched) return;
  window.__hudaFetchPatched = true;
  const TOKEN_KEY = 'huda_auth_token';
  const base = resolvedApiBaseUrl;
  const origFetch = window.fetch.bind(window);
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
  window.HudaToken = { get: getToken, set: setToken };

  window.fetch = function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch {}
    if (!url.startsWith(base)) return origFetch(input, init);

    const token = getToken();
    if (token) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || undefined);
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
      init.headers = headers;
    }

    return origFetch(input, init).then((res) => {
      try {
        if (/\/auth\/(login|register)(\?|$)/.test(url) && res.ok) {
          res.clone().json().then((d) => { if (d && d.token) setToken(d.token); }).catch(() => {});
        } else if (/\/auth\/(logout)(\?|$)/.test(url)) {
          setToken(null);
        }
      } catch {}
      return res;
    });
  };
})();

// Make CONFIG available globally
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// For module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
