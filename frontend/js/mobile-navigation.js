(() => {
  'use strict';
  if (document.querySelector('.huda-bottom-nav')) return;

  const inPages = /\/pages\//.test(location.pathname);
  const base = inPages ? '../' : '';
  const page = (name) => `${base}pages/${name}`;
  const icon = (name) => {
    const common = 'viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
      home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
      quran: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20"/><path d="M9 7h7M9 10h7"/>',
      hadith: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M8 8h8M8 11h8M8 14h5"/>',
      prayer: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/><path d="M12 2v1M22 12h-1"/>',
      tasbeeh: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V1.8M8.5 12h.01M12 12h.01M15.5 12h.01M12 16h.01"/>',
      more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>'
    };
    return `<svg ${common}>${paths[name]}</svg>`;
  };

  const links = [
    { key: 'home', label: 'الرئيسية', icon: 'home', href: `${base}index.html`, match: ['index.html', ''] },
    { key: 'quran', label: 'القرآن', icon: 'quran', href: page('quran.html'), match: ['quran.html'] },
    { key: 'hadith', label: 'الحديث', icon: 'hadith', href: page('hadith.html'), match: ['hadith.html'] },
    { key: 'prayer', label: 'الصلاة', icon: 'prayer', href: page('prayer-times.html'), match: ['prayer-times.html'] },
    { key: 'tasbeeh', label: 'الأذكار', icon: 'tasbeeh', href: page('tasbeeh.html'), match: ['tasbeeh.html'] }
  ];

  const current = location.pathname.split('/').pop() || 'index.html';
  const nav = document.createElement('nav');
  nav.className = 'huda-bottom-nav';
  nav.setAttribute('aria-label', 'التنقل السفلي');
  nav.innerHTML = links.map((item) => `
    <a class="huda-bottom-link${item.match.includes(current) ? ' is-active' : ''}" href="${item.href}" ${item.match.includes(current) ? 'aria-current="page"' : ''}>
      <span class="huda-bottom-icon">${icon(item.icon)}</span><span>${item.label}</span>
    </a>`).join('') + `
    <button class="huda-bottom-link huda-more-trigger" type="button" aria-haspopup="dialog" aria-expanded="false">
      <span class="huda-bottom-icon">${icon('more')}</span><span>المزيد</span>
    </button>`;

  const overlay = document.createElement('div');
  overlay.className = 'huda-more-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="huda-more-sheet" role="dialog" aria-modal="true" aria-label="المزيد من صفحات هدى">
      <div class="huda-sheet-handle" aria-hidden="true"></div>
      <header><div><strong>المزيد من هُدى</strong><small>كل أدواتك في مكان واحد</small></div><button type="button" class="huda-sheet-close" aria-label="إغلاق">×</button></header>
      <div class="huda-more-grid">
        <a href="${page('stats.html')}"><span>▥</span>الإحصائيات والتقدم</a>
        <a href="${page('about.html')}"><span>◎</span>من أنا</a>
        <a href="${page('contact.html')}"><span>✉</span>تواصل معي</a>
        <a href="${page('game-studio.html')}"><span>✧</span>فعاليات هُدى</a>
        <a href="${page('download.html')}"><span>⇩</span>تنزيل التطبيق</a>
        <a class="huda-more-muslim" href="${page('muslim.html')}"><span>✦</span><b>مسلم</b></a>
        <a class="huda-auth-link" href="${page('login.html')}"><span class="huda-auth-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg></span><span class="huda-auth-label">تسجيل الدخول</span></a>
      </div>
    </section>`;
  document.body.append(nav, overlay);

  const trigger = nav.querySelector('.huda-more-trigger');
  const close = () => {
    overlay.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('huda-sheet-open');
  };
  const open = () => {
    overlay.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('huda-sheet-open');
  };
  trigger.addEventListener('click', open);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.huda-sheet-close')) close();
  });
  overlay.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) close();
  });

  // The same More-menu action changes between login and account based on session.
  const authLink = overlay.querySelector('.huda-auth-link');
  const updateAuthLink = (user) => {
    if (!authLink) return;
    const loggedIn = Boolean(user);
    authLink.href = page(loggedIn ? 'account.html' : 'login.html');
    const label = authLink.querySelector('.huda-auth-label');
    const iconNode = authLink.querySelector('.huda-auth-icon');
    if (label) label.textContent = loggedIn ? 'حسابي' : 'تسجيل الدخول';
    if (iconNode) iconNode.innerHTML = loggedIn
      ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
  };
  document.addEventListener('huda-auth-ready', (event) => updateAuthLink(event.detail?.user || null));

  // Keep desktop navigation and add Muslim there if it is not already present.
  const desktopNav = document.querySelector('.main-nav');
  if (desktopNav && !desktopNav.querySelector('a[href*="muslim.html"]')) {
    const link = document.createElement('a');
    link.href = page('muslim.html');
    link.textContent = 'مسلم';
    if (current === 'muslim.html') link.classList.add('active');
    desktopNav.appendChild(link);
  }
})();