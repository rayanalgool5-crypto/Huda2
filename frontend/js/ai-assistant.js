/* The legacy floating Muslim chat bubble was retired.
   Muslim is available through its dedicated page: /pages/muslim.html.
   Keep this file as a harmless compatibility stub for existing script tags. */
(() => {
  'use strict';
  const removeLegacyWidget = () => {
    document.getElementById('huda-ai-fab')?.remove();
    document.querySelector('.huda-ai-panel')?.remove();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeLegacyWidget, { once: true });
  } else {
    removeLegacyWidget();
  }
})();
