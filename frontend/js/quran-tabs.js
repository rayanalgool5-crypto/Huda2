(() => {
  const buttons = Array.from(document.querySelectorAll('.quran-tab'));
  const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  if (!buttons.length || !panels.length) return;

  const initialized = new Set();

  function activate(tabName) {
    buttons.forEach((button) => {
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    panels.forEach((panel) => {
      const isActivePanel = panel.dataset.tabPanel === tabName;
      panel.hidden = !isActivePanel;
      // فرض الإخفاء/الإظهار مباشرة عبر inline style كضمان إضافي،
      // بحيث ما تأثر بأي تعارض أو نسخة قديمة محفوظة من ملف CSS بالكاش.
      panel.style.display = isActivePanel ? '' : 'none';
    });

    if (!initialized.has(tabName)) {
      initialized.add(tabName);
      document.dispatchEvent(new CustomEvent('quran-tab-activated', { detail: { tab: tabName } }));
    }

    history.replaceState(null, '', `#${tabName}`);
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => activate(button.dataset.tab));
  });

  const startTab = ['listen', 'read', 'memorize'].includes(location.hash.replace('#', ''))
    ? location.hash.replace('#', '')
    : 'listen';
  activate(startTab);
})();
