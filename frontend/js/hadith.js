(() => {
  const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.API && CONFIG.API.BASE_URL) || '';

  const list = document.getElementById('hadith-list');
  const status = document.getElementById('hadith-status');
  const search = document.getElementById('hadith-search');
  const chipsWrap = document.getElementById('hadith-categories');
  const modal = document.getElementById('hadith-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalText = document.getElementById('modal-text');
  const explainBtn = document.getElementById('add-explanation-btn');
  let activeHadith = null;

  let collection = 'bukhari';
  let activeCategory = 'all';
  let searchTimer = null;
  let categories = [];
  let currentHadiths = [];

  const sourceName = () => (collection === 'bukhari' ? 'صحيح البخاري' : 'صحيح مسلم');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'request failed');
    return data;
  }

  async function loadCategories() {
    try {
      const data = await fetchJson(`/hadith/categories?book=${collection}`);
      categories = data.categories || [];
    } catch {
      categories = [];
    }
    renderChips();
  }

  function renderChips() {
    if (!chipsWrap) return;
    const total = categories.reduce((sum, c) => sum + c.count, 0);
    const chips = [{ id: 'all', name: 'الكل', count: total }, ...categories];
    chipsWrap.innerHTML = chips
      .filter((c) => c.id === 'all' || c.count > 0)
      .map((c) => `<button class="category-chip${c.id === activeCategory ? ' active' : ''}" data-category="${c.id}">${escapeHtml(c.name)} <span>${c.count}</span></button>`)
      .join('');
  }

  function cardHtml(h, index) {
    const badge = h.agreed ? '<span class="agreed-badge">متفق عليه</span>' : '';
    const numberLabel = h.hadithnumber ? `حديث رقم ${h.hadithnumber}` : sourceName();
    return `<article class="hadith-card">
      <span class="card-label">${escapeHtml(numberLabel)} ${badge}</span>
      <blockquote>« ${escapeHtml(h.text)} »</blockquote>
      <footer>
        <span>${escapeHtml(h.narrator || '')}</span>
        <button data-insight="${index}">إضاءة وشرح</button>
      </footer>
    </article>`;
  }

  function render() {
    list.innerHTML = currentHadiths.length
      ? currentHadiths.slice(0, 100).map((h, i) => cardHtml(h, i)).join('')
      : '<div class="empty-state">لا توجد أحاديث مطابقة، جرّب كلمة بحث مختلفة أو تصنيفاً آخر.</div>';
  }

  async function loadHadiths() {
    status.textContent = `جاري التحميل من ${sourceName()}…`;
    list.innerHTML = '';
    const params = new URLSearchParams({ book: collection });
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (search.value.trim()) params.set('q', search.value.trim());
    try {
      const data = await fetchJson(`/hadith?${params.toString()}`);
      currentHadiths = data.hadiths || [];
      status.textContent = search.value.trim()
        ? `${currentHadiths.length} نتيجة بحث عن "${search.value.trim()}" في ${sourceName()}`
        : `${currentHadiths.length} حديثاً في ${sourceName()}`;
    } catch {
      currentHadiths = [];
      status.textContent = 'تعذر الوصول للخادم حالياً، حاول لاحقاً.';
    }
    render();
  }

  document.querySelector('.collection-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-collection]');
    if (!tab || tab.dataset.collection === collection) return;
    collection = tab.dataset.collection;
    document.querySelectorAll('.tab').forEach((button) => {
      const active = button === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    loadCategories();
    loadHadiths();
  });

  if (chipsWrap) {
    chipsWrap.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-category]');
      if (!chip || chip.dataset.category === activeCategory) return;
      activeCategory = chip.dataset.category;
      renderChips();
      loadHadiths();
    });
  }

  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadHadiths, 350); // بحث فوري لكن بدون إرهاق الخادم أثناء الكتابة
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-insight]');
    if (!button) return;
    const hadith = currentHadiths[Number(button.dataset.insight)];
    if (!hadith) return;
    activeHadith = hadith;
    const cat = categories.find((c) => c.id === hadith.category);
    modalTitle.textContent = cat ? `شرح الحديث — من باب: ${cat.name}` : 'شرح الحديث';
    const source = hadith.explanationSource || 'المصدر: بيانات الحديث المعتمدة في المشروع';
    modalText.textContent = hadith.explanation
      ? hadith.explanation
      : `رواه ${hadith.narrator || ''} في ${hadith.book === 'bukhari' ? 'صحيح البخاري' : 'صحيح مسلم'}${hadith.agreed ? ' (متفق عليه)' : ''}.\n\nلم يُضف شرحٌ موسّع لهذا الحديث في قاعدة البيانات بعد.`;
    const note = modal.querySelector('.modal-note');
    if (note) note.textContent = source;
    if (explainBtn) {
      explainBtn.hidden = Boolean(hadith.explanation);
      explainBtn.disabled = false;
      explainBtn.textContent = 'إضافة شرح';
    }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  });

  if (explainBtn) {
    explainBtn.addEventListener('click', async () => {
      if (!activeHadith) return;
      explainBtn.disabled = true;
      explainBtn.textContent = 'جاري توليد الشرح…';
      try {
        const data = await fetchJson(`/hadith/${activeHadith.id}/explain`, { method: 'POST' });
        modalText.textContent = data.explanation;
        const note = modal.querySelector('.modal-note');
        if (note) note.textContent = data.source || 'شرح مولَّد بواسطة الذكاء الاصطناعي — راجع المصادر العلمية للتفصيل';
        explainBtn.hidden = true;
      } catch (error) {
        explainBtn.disabled = false;
        explainBtn.textContent = 'إضافة شرح';
        HudaUtils?.showToast?.(error.message || 'تعذّر توليد الشرح الآن. حاول لاحقاً.', 'error');
      }
    });
  }

  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) {
      modal.hidden = true;
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      modal.hidden = true;
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    loadHadiths();
  });
})();
