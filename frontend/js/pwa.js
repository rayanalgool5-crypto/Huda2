/**
 * PWA: تسجيل الـ Service Worker (نفس الملف sw.js الحالي، بدون أي تعديل عليه)
 * + التقاط حدث beforeinstallprompt عشان زر "ثبّت هُدى على الكمبيوتر"
 *   في صفحة تنزيل التطبيق يقدر يفتح نافذة التثبيت الأصلية للمتصفح.
 *
 * هذا الملف إضافي بالكامل ولا يغيّر أي سلوك موجود (الإشعارات، الحساب، إلخ).
 */
(function () {
  // تسجيل الـ Service Worker بأقرب وقت ممكن حتى يعتبر المتصفح الموقع "قابل للتثبيت"
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // فشل التسجيل لا يجب أن يوقف باقي الموقع
      });
    });
  }

  var deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    var btn = document.getElementById('pwa-install-btn');
    if (btn) {
      btn.hidden = false;
    }
  });

  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    var btn = document.getElementById('pwa-install-btn');
    if (btn) {
      btn.hidden = true;
    }
    var note = document.getElementById('pwa-installed-note');
    if (note) {
      note.hidden = false;
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('pwa-install-btn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btn.hidden = true;
    });
  });
})();
