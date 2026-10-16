(() => {
  const TREE = (typeof window !== 'undefined' && window.AZKAR_TREE) || [];

  const countEl = document.getElementById('tasbeeh-count'), totalEl = document.getElementById('daily-total'),
    soundEl = document.getElementById('sound-toggle'), vibrationEl = document.getElementById('vibration-toggle');
  const browserEl = document.getElementById('azkar-browser');
  const GUEST_PROGRESS_KEY = 'huda_guest_tasbeeh';
  const ADVANCE_DELAY = 700; // مهلة قصيرة قبل الانتقال التلقائي للذكر التالي بعد إتمامه (مللي ثانية)

  // ===== الحالة =====
  // state.azkar مفتاحها "فئة.فئة_فرعية.رقم_العنصر" وقيمتها عدد المرات المُنجزة لهذا الذكر
  let state = { count: 0, total: 0, azkar: {}, sound: false, vibration: false };
  let saveTimer = null;

  // حالة التصفح (لا تُحفظ في الخادم، محلية للجلسة الحالية فقط)
  let nav = { view: 'categories', catId: null, subId: null, index: 0 };

  // ===== أدوات مساعدة على الشجرة =====
  const findCategory = (catId) => TREE.find(c => c.id === catId);
  const findSubcategory = (catId, subId) => findCategory(catId)?.subcategories.find(s => s.id === subId);
  const itemId = (catId, subId, idx) => `${catId}.${subId}.${idx}`;
  const itemProgress = (catId, subId, idx, item) => Math.min(item.count, state.azkar[itemId(catId, subId, idx)] || 0);
  const isItemDone = (catId, subId, idx, item) => itemProgress(catId, subId, idx, item) >= item.count;

  function subStats(catId, sub) {
    let done = 0;
    sub.items.forEach((item, idx) => { if (isItemDone(catId, sub.id, idx, item)) done++; });
    return { done, total: sub.items.length };
  }

  function catStats(cat) {
    let done = 0, total = 0;
    cat.subcategories.forEach(sub => {
      const s = subStats(cat.id, sub);
      done += s.done; total += s.total;
    });
    return { done, total };
  }

  function firstIncompleteIndex(catId, sub) {
    for (let i = 0; i < sub.items.length; i++) {
      if (!isItemDone(catId, sub.id, i, sub.items[i])) return i;
    }
    return 0; // كلها منجزة — نبدأ استعراضاً من أول عنصر
  }

  // ===== الحفظ =====
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const user = await Huda.getSession();
      if (!user) {
        HudaUtils.storage.set(GUEST_PROGRESS_KEY, state);
        return;
      }
      try { await Huda.apiPut('/progress/tasbeeh', state); } catch { /* سيُعاد المحاولة عند أي تفاعل لاحق */ }
    }, 400);
  }

  const renderCounter = () => {
    countEl.value = countEl.textContent = state.count.toLocaleString('ar-EG');
    totalEl.textContent = state.total.toLocaleString('ar-EG');
    soundEl.checked = state.sound;
    vibrationEl.checked = state.vibration;
  };

  const beep = () => {
    if (!state.sound) return;
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)(), oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = 620; gain.gain.setValueAtTime(.025, context.currentTime);
      oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .045);
    } catch { /* الصوت غير متاح في هذا المتصفح */ }
  };

  const buzz = (ms) => { if (state.vibration && navigator.vibrate) navigator.vibrate(ms); };

  function increment() {
    state.count++; state.total++;
    renderCounter(); beep(); scheduleSave();
    buzz(16);
  }

  // ===== عرض المتصفح الشجري =====
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function progressBarHTML(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="azkar-progress"><div class="azkar-progress-bar"><span style="width:${pct}%"></span></div><small>${done.toLocaleString('ar-EG')}/${total.toLocaleString('ar-EG')}</small></div>`;
  }

  function renderCategories() {
    browserEl.innerHTML = `<div class="azkar-cat-grid">${TREE.map(cat => {
      const stats = catStats(cat);
      const complete = stats.total > 0 && stats.done === stats.total;
      return `<button class="azkar-cat-card ${complete ? 'complete' : ''}" data-open-cat="${cat.id}">
        <span class="azkar-cat-icon">${cat.icon}</span>
        <h3>${esc(cat.title)}</h3>
        <p>${esc(cat.description || '')}</p>
        ${progressBarHTML(stats.done, stats.total)}
        ${complete ? '<span class="azkar-complete-badge">✔ مكتمل</span>' : ''}
      </button>`;
    }).join('')}</div>`;
  }

  function renderSubcategories(catId) {
    const cat = findCategory(catId);
    if (!cat) { nav.view = 'categories'; return renderCategories(); }
    browserEl.innerHTML = `
      <nav class="azkar-breadcrumb"><button data-nav-root>الأقسام</button><span>‹</span><b>${esc(cat.title)}</b></nav>
      <div class="azkar-cat-grid">${cat.subcategories.map(sub => {
        const stats = subStats(catId, sub);
        const complete = stats.total > 0 && stats.done === stats.total;
        return `<button class="azkar-cat-card azkar-sub-card ${complete ? 'complete' : ''}" data-open-sub="${sub.id}">
          <span class="azkar-cat-icon">${sub.icon || cat.icon}</span>
          <h3>${esc(sub.title)}</h3>
          <p>${esc(sub.description || '')}</p>
          ${progressBarHTML(stats.done, stats.total)}
          ${complete ? '<span class="azkar-complete-badge">✔ مكتمل</span>' : ''}
        </button>`;
      }).join('')}</div>`;
  }

  function renderSession(catId, subId, index) {
    const cat = findCategory(catId), sub = findSubcategory(catId, subId);
    if (!cat || !sub) { nav.view = 'categories'; return renderCategories(); }
    if (index < 0) index = 0;
    if (index >= sub.items.length) { nav.view = 'done'; return renderDone(catId, subId); }

    const item = sub.items[index];
    const done = itemProgress(catId, subId, index, item);
    const target = item.count;
    const isDone = done >= target;
    const stats = subStats(catId, sub);

    browserEl.innerHTML = `
      <nav class="azkar-breadcrumb">
        <button data-nav-root>الأقسام</button><span>‹</span>
        <button data-open-cat="${cat.id}">${esc(cat.title)}</button><span>‹</span>
        <b>${esc(sub.title)}</b>
      </nav>
      ${progressBarHTML(stats.done, stats.total)}
      <div class="azkar-session ${isDone ? 'is-done' : ''}">
        <span class="azkar-session-index">الذكر ${index + 1} من ${sub.items.length}</span>
        <p class="azkar-session-text">${esc(item.text)}</p>
        ${item.note ? `<p class="azkar-session-note">${esc(item.note)}</p>` : ''}
        <button class="azkar-session-button" data-tap-item aria-label="عدّ هذا الذكر">
          <span>${done.toLocaleString('ar-EG')}</span>
          <small>من ${target.toLocaleString('ar-EG')}</small>
        </button>
        ${isDone ? '<p class="azkar-session-check">✔ أُنجز — ' + (index + 1 < sub.items.length ? 'ننتقل للذكر التالي…' : 'أوشكت على الانتهاء…') + '</p>' : ''}
        <div class="azkar-session-nav">
          <button class="text-button" data-prev-item ${index === 0 ? 'disabled' : ''}>‹ السابق</button>
          <button class="text-button" data-reset-item>إعادة هذا الذكر</button>
          <button class="text-button" data-next-item>تخطي للتالي ›</button>
        </div>
      </div>`;
  }

  function renderDone(catId, subId) {
    const cat = findCategory(catId), sub = findSubcategory(catId, subId);
    browserEl.innerHTML = `
      <nav class="azkar-breadcrumb"><button data-nav-root>الأقسام</button><span>‹</span><button data-open-cat="${cat.id}">${esc(cat.title)}</button></nav>
      <div class="azkar-done">
        <span class="azkar-cat-icon">🎉</span>
        <h3>أتممتَ ${esc(sub.title)}</h3>
        <p>تقبّل الله منك ذكرك، جعله في ميزان حسناتك.</p>
        <div class="azkar-done-actions">
          <button class="button button-secondary" data-restart-sub>إعادة من البداية</button>
          <button class="button button-primary" data-open-sub-of="${cat.id}" data-target-sub="${sub.id}">رجوع للأقسام الفرعية</button>
        </div>
      </div>`;
  }

  function render() {
    if (nav.view === 'categories') return renderCategories();
    if (nav.view === 'subcategories') return renderSubcategories(nav.catId);
    if (nav.view === 'session') return renderSession(nav.catId, nav.subId, nav.index);
    if (nav.view === 'done') return renderDone(nav.catId, nav.subId);
  }

  function openCategory(catId) {
    nav = { view: 'subcategories', catId, subId: null, index: 0 };
    render();
  }

  function openSubcategory(catId, subId) {
    const sub = findSubcategory(catId, subId);
    if (!sub) return;
    const startIndex = firstIncompleteIndex(catId, sub);
    const stats = subStats(catId, sub);
    nav = { view: stats.done === stats.total ? 'done' : 'session', catId, subId, index: startIndex };
    render();
  }

  function tapCurrentItem() {
    const { catId, subId, index } = nav;
    const sub = findSubcategory(catId, subId);
    if (!sub) return;
    const item = sub.items[index];
    const id = itemId(catId, subId, index);
    const current = state.azkar[id] || 0;
    if (current >= item.count) return; // مكتمل أصلاً، لا نزيد أكثر

    state.azkar[id] = current + 1;
    state.total++;
    scheduleSave(); beep(); buzz(12);
    renderCounter();
    render();

    if (state.azkar[id] >= item.count) {
      buzz(35);
      setTimeout(() => {
        // تأكد أننا ما زلنا في نفس الذكر قبل الانتقال (تحسباً لتنقل يدوي أثناء المهلة)
        if (nav.view === 'session' && nav.catId === catId && nav.subId === subId && nav.index === index) {
          nav.index = index + 1;
          render();
        }
      }, ADVANCE_DELAY);
    }
  }

  function goPrevItem() { if (nav.index > 0) { nav.index--; render(); } }
  function goNextItem() { nav.index++; render(); }
  function resetCurrentItem() {
    const id = itemId(nav.catId, nav.subId, nav.index);
    delete state.azkar[id];
    scheduleSave(); render();
  }
  function restartSubcategory() {
    const sub = findSubcategory(nav.catId, nav.subId);
    if (!sub) return;
    sub.items.forEach((_, idx) => { delete state.azkar[itemId(nav.catId, nav.subId, idx)]; });
    scheduleSave();
    nav.view = 'session'; nav.index = 0;
    render();
  }

  // ===== أحداث العداد الحر =====
  document.getElementById('tasbeeh-button').addEventListener('click', increment);
  document.getElementById('reset-counter').addEventListener('click', () => { state.count = 0; renderCounter(); scheduleSave(); });
  soundEl.addEventListener('change', () => { state.sound = soundEl.checked; scheduleSave(); });
  vibrationEl.addEventListener('change', () => { state.vibration = vibrationEl.checked; scheduleSave(); });

  // ===== أحداث متصفح الأذكار الشجري (تفويض واحد لكل الأزرار) =====
  browserEl.addEventListener('click', (event) => {
    const el = event.target.closest('button');
    if (!el) return;

    if (el.hasAttribute('data-nav-root')) { nav = { view: 'categories', catId: null, subId: null, index: 0 }; return render(); }
    if (el.dataset.openCat) { return openCategory(el.dataset.openCat); }
    if (el.dataset.openSub) { return openSubcategory(nav.catId, el.dataset.openSub); }
    if (el.dataset.openSubOf) { return openSubcategory(el.dataset.openSubOf, el.dataset.targetSub); }
    if (el.hasAttribute('data-tap-item')) { return tapCurrentItem(); }
    if (el.hasAttribute('data-prev-item')) { return goPrevItem(); }
    if (el.hasAttribute('data-next-item')) { return goNextItem(); }
    if (el.hasAttribute('data-reset-item')) { return resetCurrentItem(); }
    if (el.hasAttribute('data-restart-sub')) { return restartSubcategory(); }
  });

  // ===== التحميل الأولي =====
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Huda.getSession();
    if (user) {
      try {
        const remote = await Huda.apiGet('/progress/tasbeeh');
        state = { count: remote.count, total: remote.total, azkar: remote.azkar, sound: remote.sound, vibration: remote.vibration };
      } catch { /* تعذّر الجلب؛ نبدأ بحالة فارغة ويُعاد الحفظ عند أول تفاعل */ }
    } else {
      const local = HudaUtils.storage.get(GUEST_PROGRESS_KEY);
      if (local && typeof local === 'object') {
        state = { ...state, ...local, azkar: local.azkar && typeof local.azkar === 'object' ? local.azkar : {} };
      }
    }
    renderCounter();
    render();
  });
})();
