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

  async function fetchSession() {
    try {
      const response = await fetch(`${API_BASE}/auth/session`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.error('Session check failed:', response.status);
        cachedUser = null;
        return null;
      }

      const data = await response.json();
      cachedUser = data.authenticated ? data.user : null;

      // Update localStorage for quick access
      if (cachedUser) {
        HudaUtils.storage.set(STORAGE.USER_KEY, cachedUser);
      } else {
        HudaUtils.storage.remove(STORAGE.USER_KEY);
      }

      // Protected pages (stats/memorization) can render as soon as the
      // authoritative session check has finished.
      document.dispatchEvent(new CustomEvent('huda-auth-ready', {
        detail: { user: cachedUser }
      }));

      return cachedUser;
    } catch (error) {
      console.error('Session fetch error:', error);
      // Local storage is only a convenience cache, never proof of authentication.
      cachedUser = null;
      document.dispatchEvent(new CustomEvent('huda-auth-ready', {
        detail: { user: null }
      }));
      return null;
    } finally {
      sessionChecked = true;
    }
  }

  async function getSession() {
    if (!sessionChecked) {
      await fetchSession();
    }
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

      if (response.ok && data.success && !data.requiresVerification) {
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

      if (response.ok && data.success && !data.requiresVerification) {
        cachedUser = data.user; sessionChecked = true; HudaUtils.storage.set(STORAGE.USER_KEY, cachedUser);
      }

      return { ok: response.ok, data };
    } catch (error) {
      console.error('Register error:', error);
      return { ok: false, data: { message: 'خطأ في الاتصال بالخادم' } };
    }
  }

  async function resendVerification(email) {
    try {
      const response = await fetch(`${API_BASE}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data };
    } catch (error) { return { ok: false, data: { message: 'خطأ في الاتصال بالخادم' } }; }
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
    const prefersDark = stored ? stored === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;

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

      if (!user) {
        freshButton.textContent = 'تسجيل الدخول';
        freshButton.setAttribute('aria-label', 'تسجيل الدخول لحفظ التقدم ومزامنته');
        freshButton.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.assign(loginPath);
        });
      } else {
        freshButton.textContent = 'الحساب';
        freshButton.setAttribute('aria-label', `فتح حساب ${user.name || 'المستخدم'}`);
        freshButton.title = 'فتح حسابي';
        freshButton.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.assign(accountPath);
        });
      }
    });

    // Let protected pages react when authentication state is known.
    document.dispatchEvent(new CustomEvent('huda-auth-ready', { detail: { user } }));
  };

  return {
    getSession,
    refreshSession: fetchSession,
    login,
    register,
    resendVerification,
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
