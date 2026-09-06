/**
 * Configuration constants for Huda frontend
 * These values are used across the application
 */



const PRODUCTION_API_BASE_URL = 'https://huda-backend-70x4.onrender.com/api';


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

// Make CONFIG available globally
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// For module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
