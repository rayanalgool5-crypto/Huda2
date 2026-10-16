(() => {
  const QURAN_API = 'https://api.alquran.cloud/v1';
  const PAGE_KEY = 'huda_quran_read_last_page';
  const FONT_SIZE_KEY = 'huda_quran_read_font_size';
  const TOTAL_PAGES = 604;

  const elements = {
    panel: document.getElementById('tab-read'),
    surahSelect: document.getElementById('read-surah-select'),
    pageInput: document.getElementById('read-page-input'),
    pageSlider: document.getElementById('read-page-slider'),
    prevPage: document.getElementById('read-prev-page'),
    nextPage: document.getElementById('read-next-page'),
    content: document.getElementById('mushaf-content'),
    pageLabel: document.getElementById('read-page-label'),
    juzLabel: document.getElementById('read-juz-label'),
    increaseFont: document.getElementById('read-increase-font'),
    decreaseFont: document.getElementById('read-decrease-font'),
    fontSizeLabel: document.getElementById('read-font-size-label'),
  };

  if (!elements.panel) return;

  let surahs = [];
  let currentPage = Number(HudaUtils.storage.get(PAGE_KEY)) || 1;
  let fontSize = Number(HudaUtils.storage.get(FONT_SIZE_KEY)) || 26;
  let requestNumber = 0;
  let loaded = false;

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(number);

  function applyFontSize() {
    fontSize = Math.min(40, Math.max(18, fontSize));
    elements.content.style.setProperty('--mushaf-font-size', `${fontSize}px`);
    elements.fontSizeLabel.textContent = arabicNumber(fontSize);
    HudaUtils.storage.set(FONT_SIZE_KEY, fontSize);
  }

  function createOption(surah) {
    const option = document.createElement('option');
    option.value = String(surah.number);
    option.textContent = `${arabicNumber(surah.number)} — ${surah.name}`;
    return option;
  }

  async function loadSurahList() {
    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب قائمة السور');
      const data = await response.json();
      surahs = Array.isArray(data.data) ? data.data : [];
      elements.surahSelect.replaceChildren(...surahs.map(createOption));
    } catch (error) {
      elements.surahSelect.innerHTML = '<option>تعذّر تحميل السور</option>';
    }
  }

  function setSurahSelectForPage(pageAyahs) {
    const firstAyah = pageAyahs[0];
    if (firstAyah && elements.surahSelect.value !== String(firstAyah.surah.number)) {
      elements.surahSelect.value = String(firstAyah.surah.number);
    }
  }

  function renderPage(pageData) {
    const ayahs = pageData.ayahs || [];
    const fragment = document.createDocumentFragment();
    let lastSurahNumber = null;

    ayahs.forEach((ayah) => {
      if (ayah.surah.number !== lastSurahNumber) {
        lastSurahNumber = ayah.surah.number;
        const banner = document.createElement('div');
        banner.className = 'mushaf-surah-banner';
        const bannerSpan = document.createElement('span');
        bannerSpan.textContent = `سورة ${ayah.surah.name}`;
        banner.appendChild(bannerSpan);
        fragment.appendChild(banner);

        if (ayah.surah.number !== 1 && ayah.surah.number !== 9) {
          const basmala = document.createElement('p');
          basmala.className = 'mushaf-basmala';
          basmala.textContent = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
          fragment.appendChild(basmala);
        }
      }

      const textNode = document.createTextNode(`${ayah.text} `);
      fragment.appendChild(textNode);

      const marker = document.createElement('span');
      marker.className = 'mushaf-ayah-marker';
      marker.textContent = arabicNumber(ayah.numberInSurah);
      fragment.appendChild(marker);
      fragment.appendChild(document.createTextNode(' '));
    });

    elements.content.replaceChildren(fragment);
    setSurahSelectForPage(ayahs);

    const firstAyah = ayahs[0];
    if (firstAyah) {
      elements.juzLabel.textContent = `الجزء ${arabicNumber(firstAyah.juz)}`;
    }
    elements.pageLabel.textContent = `صفحة ${arabicNumber(pageData.number || currentPage)}`;
  }

  async function loadPage(pageNumber) {
    const target = Math.min(TOTAL_PAGES, Math.max(1, Number(pageNumber) || 1));
    currentPage = target;
    elements.pageInput.value = String(target);
    elements.pageSlider.value = String(target);
    HudaUtils.storage.set(PAGE_KEY, target);
    history.replaceState(null, '', `#read-page-${target}`);

    const loadId = ++requestNumber;
    elements.content.innerHTML = '<div class="loading">جاري تحميل صفحة المصحف…</div>';

    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/page/${target}/quran-uthmani`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب الصفحة');
      const data = await response.json();
      if (loadId !== requestNumber) return;
      renderPage(data.data);
    } catch (error) {
      if (loadId !== requestNumber) return;
      elements.content.innerHTML = '<div class="empty-state">تعذّر تحميل هذه الصفحة. تحقق من اتصال الإنترنت ثم أعد المحاولة.</div>';
    }
  }

  async function jumpToSurah(surahNumber) {
    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/ayah/${surahNumber}:1/quran-uthmani`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر تحديد صفحة السورة');
      const data = await response.json();
      loadPage(data.data.page);
    } catch (error) {
      HudaUtils.showToast('تعذّر الانتقال إلى هذه السورة حالياً.', 'error');
    }
  }

  elements.nextPage.addEventListener('click', () => loadPage(currentPage + 1));
  elements.prevPage.addEventListener('click', () => loadPage(currentPage - 1));
  elements.pageInput.addEventListener('change', () => loadPage(elements.pageInput.value));
  elements.pageSlider.addEventListener('input', () => loadPage(elements.pageSlider.value));
  elements.surahSelect.addEventListener('change', (event) => jumpToSurah(event.target.value));
  elements.increaseFont.addEventListener('click', () => { fontSize += 2; applyFontSize(); });
  elements.decreaseFont.addEventListener('click', () => { fontSize -= 2; applyFontSize(); });

  async function init() {
    if (loaded) return;
    loaded = true;
    console.log('[هُدى] بدء تحميل قسم القراءة (صفحات المصحف)...');
    applyFontSize();
    await loadSurahList();

    const fromHash = Number(location.hash.replace('#read-page-', ''));
    const startPage = Number.isInteger(fromHash) && fromHash >= 1 && fromHash <= TOTAL_PAGES ? fromHash : currentPage;
    loadPage(startPage);
  }

  document.addEventListener('quran-tab-activated', (event) => {
    if (event.detail.tab === 'read') init();
  });
})();
