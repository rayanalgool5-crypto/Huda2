/**
 * Huda - Main Application Module
 * Handles authentication, session management, and global app state
 */

const Huda = (() => {
  const API_BASE = CONFIG.API.BASE_URL;
  const STORAGE = CONFIG.STORAGE;

  let cachedUser = null;
  let sessionChecked = false;

  // ===== SESSION MANAGEMENT =====

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // يحاول عدة مرات لأن Render (الخطة المجانية) ممكن يكون نايم ويحتاج ~30-60 ثانية ليصحى.
  // مهم: ما نعتبر الجلسة "مفحوصة" إلا إذا رد السيرفر فعلاً — فشل الشبكة ≠ "غير مسجّل".
  async function fetchSession() {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${API_BASE}/auth/session`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!response.ok) {
          if (response.status >= 500 && attempt < maxAttempts) { await sleep(1500 * attempt); continue; }
          console.error('Session check failed:', response.status);
          cachedUser = null;
          break;
        }

        const data = await response.json();
        cachedUser = data.authenticated ? data.user : null;

        if (cachedUser) {
          HudaUtils.storage.set(STORAGE.USER_KEY, cachedUser);
        } else {
          HudaUtils.storage.remove(STORAGE.USER_KEY);
          window.HudaToken?.set(null); // توكن قديم/منتهي
        }
        sessionChecked = true;
        document.dispatchEvent(new CustomEvent('huda-auth-ready', { detail: { user: cachedUser } }));
        return cachedUser;
      } catch (error) {
        clearTimeout(timer);
        console.error('Session fetch error (attempt ' + attempt + '):', error);
        if (attempt < maxAttempts) { await sleep(1500 * attempt); continue; }
        cachedUser = null;
      }
    }
    // فشل نهائي: لا نعلّم sessionChecked حتى تُعاد المحاولة بالطلب القادم.
    document.dispatchEvent(new CustomEvent('huda-auth-ready', { detail: { user: cachedUser } }));
    return cachedUser;
  }

  async function getSession() {
    if (!sessionChecked || !cachedUser) await fetchSession();
    return cachedUser;
  }

  // ===== AUTHENTICATION METHODS =====

  async function login(email, password) {
    try {
      // Validation
      if (!HudaUtils.validateEmail(email)) {
        return { ok: false, data: { message: 'البريد الإلكتروني غير صحيح' } };
      }
      if (!HudaUtils.validatePassword(password)) {
        return { ok: false, data: { message: 'كلمة المرور يجب أن تكون 8-128 حرفاً' } };
      }

      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        cachedUser = data.user; sessionChecked = true; HudaUtils.storage.set(STORAGE.USER_KEY, cachedUser);
      }

      return { ok: response.ok, data };
    } catch (error) {
      console.error('Login error:', error);
      return { ok: false, data: { message: 'خطأ في الاتصال بالخادم' } };
    }
  }

  async function register(name, email, password, passwordConfirm) {
    try {
      // Validation
      if (!name || name.trim().length < 2) {
        return { ok: false, data: { message: 'الاسم يجب أن يكون على الأقل حرفين' } };
      }
      if (!HudaUtils.validateEmail(email)) {
        return { ok: false, data: { message: 'البريد الإلكتروني غير صحيح' } };
      }
      if (!HudaUtils.validatePassword(password)) {
        return { ok: false, data: { message: 'كلمة المرور يجب أن تكون 8-128 حرفاً' } };
      }
      if (password !== passwordConfirm) {
        return { ok: false, data: { message: 'كلمات المرور غير متطابقة' } };
      }

      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        cachedUser = data.user; sessionChecked = true; HudaUtils.storage.set(STORAGE.USER_KEY, cachedUser);
      }

      return { ok: response.ok, data };
    } catch (error) {
      console.error('Register error:', error);
      return { ok: false, data: { message: 'خطأ في الاتصال بالخادم' } };
    }
  }

  async function logout() {
    try {
      const response = await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn('Logout API call failed:', response.status);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      cachedUser = null;
      sessionChecked = true;
      HudaUtils.storage.remove(STORAGE.USER_KEY);
      document.dispatchEvent(new CustomEvent('huda-auth-ready', { detail: { user: null } }));
    }
  }

  // ===== ROUTE GUARDS =====

  async function requireAuth(redirectUrl) {
    const user = await getSession();
    if (!user) {
      window.location.replace(redirectUrl);
      return null;
    }
    return user;
  }

  async function redirectIfAuthenticated(redirectUrl) {
    const user = await getSession();
    if (user) {
      window.location.replace(redirectUrl);
    }
    return user;
  }

  // ===== API HELPERS =====

  async function apiGet(path) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (response.status === 401) {
        // Session expired
        cachedUser = null;
        sessionChecked = false;
        throw new Error('جلستك انتهت، يرجى تسجيل الدخول مجدداً');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'فشل الطلب');
      }

      return await response.json();
    } catch (error) {
      console.error('API GET error:', error);
      throw error;
    }
  }

  async function apiPut(path, body) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        cachedUser = null;
        sessionChecked = false;
        throw new Error('جلستك انتهت، يرجى تسجيل الدخول مجدداً');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'فشل الطلب');
      }

      return await response.json();
    } catch (error) {
      console.error('API PUT error:', error);
      throw error;
    }
  }

  // ===== UI INITIALIZATION =====

  const initTheme = () => {
    const stored = HudaUtils.storage.get(STORAGE.THEME_KEY);
    // الوضع الفاتح هو الوضع الأساسي دائمًا ما لم يفعّل المستخدم الوضع الداكن يدويًا من قبل
    const prefersDark = stored === 'dark';

    const applyTheme = (isDark) => {
      document.body.classList.toggle('dark', isDark);
      const button = document.querySelector('.theme-toggle');
      if (button) {
        button.textContent = isDark ? '☀' : '☾';
        button.setAttribute('aria-label', isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
      }
    };

    applyTheme(prefersDark);

    const button = document.querySelector('.theme-toggle');
    button?.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark');
      const newTheme = !isDark;
      HudaUtils.storage.set(STORAGE.THEME_KEY, newTheme ? 'dark' : 'light');
      applyTheme(newTheme);
    });
  };

  const initNavigation = () => {
    const trigger = document.querySelector('.nav-trigger');
    const nav = document.querySelector('.main-nav');

    trigger?.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
      trigger.textContent = isOpen ? '×' : '☰';
    });

    // Close menu when clicking on a link
    nav?.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
        trigger.textContent = '☰';
      });
    });
  };

  const initApp = async () => {
    initTheme();
    initNavigation();

    // Check if backend is available
    try {
      const healthCheck = await fetch(`${API_BASE}/health`, { 
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!healthCheck.ok) {
        console.warn('Backend returned non-OK status:', healthCheck.status);
      }
    } catch (error) {
      console.error('Backend server is not running:', error);
      HudaUtils.showToast(
        'وضع الضيف متاح، لكن حفظ التقدم بين الأجهزة يحتاج تشغيل الخادم.',
        'info',
        4500
      );
    }

    const user = await getSession();

    // Update user name display
    document.querySelectorAll('[data-user-name]').forEach(node => {
      node.textContent = user?.name || 'ضيفنا';
    });

    // The main hero action follows the same authentication state.
    document.querySelectorAll('[data-auth-action], #hero-account-action').forEach(link => {
      if (!user) {
        link.textContent = 'سجل الدخول';
        link.href = location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html';
      } else {
        link.textContent = 'الحساب';
        link.href = location.pathname.includes('/pages/') ? 'account.html' : 'pages/account.html';
      }
    });

    // The same header button changes between "تسجيل الدخول" and "الحساب".
    // A dedicated logout button can still be used inside the account page.
    document.querySelectorAll('.logout-button:not([data-account-logout])').forEach(button => {
      const loginPath = location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html';
      const accountPath = location.pathname.includes('/pages/') ? 'account.html' : 'pages/account.html';

      button.replaceWith(button.cloneNode(true));
      const freshButton = document.querySelector('.logout-button:not([data-account-logout])');
      if (!freshButton) return;

      const loggedIn = Boolean(user);
      const icon = loggedIn
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
      freshButton.innerHTML = `${icon}<span>${loggedIn ? 'حسابي' : 'تسجيل الدخول'}</span>`;
      freshButton.setAttribute('aria-label', loggedIn ? `فتح حساب ${user.name || 'المستخدم'}` : 'تسجيل الدخول لحفظ التقدم ومزامنته');
      freshButton.title = loggedIn ? 'حسابي' : 'تسجيل الدخول';
      freshButton.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.assign(loggedIn ? accountPath : loginPath);
      });
    });

    // Let protected pages react when authentication state is known.
    document.dispatchEvent(new CustomEvent('huda-auth-ready', { detail: { user } }));
  };

  return {
    getSession,
    refreshSession: fetchSession,
    login,
    register,
    logout,
    requireAuth,
    redirectIfAuthenticated,
    initApp,
    apiGet,
    apiPut
  };
})();

// ===== APP STARTUP =====

document.addEventListener('DOMContentLoaded', () => {
  Huda.initApp();
});


// الوصول المخفي للإدارة: 15 ضغطة متتالية على شعار هُدى.
// يُحفظ العداد في sessionStorage حتى لا تؤدي إعادة تحميل الصفحة بسبب رابط الشعار إلى تصفيره.
document.addEventListener('DOMContentLoaded', () => {
  const brand = document.querySelector('.brand');
  if (!brand) return;
  brand.addEventListener('click', event => {
    try {
      const now = Date.now();
      const previousAt = Number(sessionStorage.getItem('huda_admin_click_at') || 0);
      let count = Number(sessionStorage.getItem('huda_admin_click_count') || 0);
      if (!previousAt || now - previousAt > 3000) count = 0;
      count += 1;
      sessionStorage.setItem('huda_admin_click_count', String(count));
      sessionStorage.setItem('huda_admin_click_at', String(now));
      const isHomePage = /(?:^|\/)(?:index\.html)?$/.test(window.location.pathname);
      // على الرئيسية، منع إعادة التحميل لا يغيّر وظيفة الرابط (المستخدم موجود أصلاً في وجهته).
      if (isHomePage) event.preventDefault();
      if (count >= 15) {
        sessionStorage.removeItem('huda_admin_click_count');
        sessionStorage.removeItem('huda_admin_click_at');
        event.preventDefault();
        const inPages = /\/pages\//.test(window.location.pathname);
        window.location.href = inPages ? 'admin-login.html' : 'pages/admin-login.html';
      }
    } catch (error) {
      // عدم توفر sessionStorage لا يعطل وظيفة رابط الشعار الأصلية.
    }
  });
});
