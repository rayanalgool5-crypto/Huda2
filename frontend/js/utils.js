/**
 * Utility functions for Huda frontend
 */

const HudaUtils = (() => {
  // Fetch with timeout and retry
  async function fetchWithRetry(url, options = {}, retries = 3) {
    const { timeout = 10000, ...fetchOptions } = options;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // Show toast notification
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    // Add styles if not already in CSS
    if (!document.querySelector('style[data-toast-styles]')) {
      const style = document.createElement('style');
      style.setAttribute('data-toast-styles', '');
      style.textContent = `
        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #333;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          opacity: 0;
          transition: opacity 0.3s;
          max-width: 300px;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .toast.show {
          opacity: 1;
        }
        .toast-success {
          background: #4caf50;
        }
        .toast-error {
          background: #f44336;
        }
        .toast-warning {
          background: #ff9800;
        }
        .toast-info {
          background: #2196f3;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Validate email
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Validate password
  function validatePassword(password) {
    return password && password.length >= 8 && password.length <= 128;
  }

  // Get human-readable error message
  function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.response?.data?.message) return error.response.data.message;
    return 'حدث خطأ غير متوقع';
  }

  // Format date to Arabic locale
  function formatDate(date) {
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Debounce function
  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  // Throttle function
  function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // Safe localStorage access
  const storage = {
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('Storage error:', e);
        return false;
      }
    },
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        console.warn('Storage error:', e);
        return null;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.warn('Storage error:', e);
        return false;
      }
    }
  };

  return {
    fetchWithRetry,
    showToast,
    validateEmail,
    validatePassword,
    getErrorMessage,
    formatDate,
    debounce,
    throttle,
    storage
  };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.HudaUtils = HudaUtils;
}
