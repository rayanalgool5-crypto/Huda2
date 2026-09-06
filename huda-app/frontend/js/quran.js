(() => {
  const QURAN_API = 'https://api.alquran.cloud/v1';
  const COMPLETION_KEY = 'huda_quran_completed_ayahs';
  const LAST_SURAH_KEY = 'huda_quran_last_surah';
  const FONT_SIZE_KEY = 'huda_quran_font_size';

  const elements = {
    list: document.getElementById('surah-list'),
    select: document.getElementById('surah-select'),
    title: document.getElementById('surah-title'),
    meta: document.getElementById('surah-meta'),
    verses: document.getElementById('verses'),
    surahSearch: document.getElementById('surah-search'),
    verseSearch: document.getElementById('verse-search'),
    audio: document.getElementById('quran-audio'),
    play: document.getElementById('play-pause'),
    previous: document.getElementById('prev-verse'),
    next: document.getElementById('next-verse'),
    reciter: document.getElementById('reciter'),
    repeat: document.getElementById('repeat-verse'),
    nowPlaying: document.getElementById('now-playing'),
    audioProgress: document.getElementById('audio-progress'),
    audioTime: document.getElementById('audio-time'),
    increaseFont: document.getElementById('increase-font'),
    decreaseFont: document.getElementById('decrease-font'),
    fontSizeLabel: document.getElementById('font-size-label'),
    readingProgress: document.getElementById('reading-progress'),
    readingProgressValue: document.getElementById('reading-progress-value'),
    completionStatus: document.getElementById('completion-status'),
  };

  let surahs = [];
  let currentSurah = null;
  let verses = [];
  let currentVerseIndex = -1;
  let completedAyahs = new Set();
  let memorizationProgress = new Map();
  let requestNumber = 0;
  let fontSize = Number(HudaUtils.storage.get(FONT_SIZE_KEY)) || 28;

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(number);
  const audioUrl = (ayah) => `https://everyayah.com/data/${elements.reciter.value}/${String(currentSurah.number).padStart(3, '0')}${String(ayah.numberInSurah).padStart(3, '0')}.mp3`;

  function setStatus(message) {
    elements.completionStatus.textContent = message;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '٠:٠٠';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${arabicNumber(minutes)}:${arabicNumber(remainder).padStart(2, '٠')}`;
  }

  function updateAudioTimeline() {
    const duration = elements.audio.duration;
    const current = elements.audio.currentTime;
    const percent = Number.isFinite(duration) && duration > 0 ? (current / duration) * 100 : 0;
    elements.audioProgress.value = String(percent);
    elements.audioTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  function applyFontSize() {
    fontSize = Math.min(42, Math.max(21, fontSize));
    elements.verses.style.setProperty('--quran-font-size', `${fontSize}px`);
    elements.fontSizeLabel.textContent = arabicNumber(fontSize);
    HudaUtils.storage.set(FONT_SIZE_KEY, fontSize);
  }

  function getCompletedSurahs() {
    const saved = HudaUtils.storage.get(COMPLETION_KEY);
    return saved && typeof saved === 'object' ? saved : {};
  }

  function restoreCompletion(surahNumber) {
    const saved = getCompletedSurahs();
    const ayahs = Array.isArray(saved[surahNumber]) ? saved[surahNumber] : [];
    completedAyahs = new Set(ayahs.filter(Number.isInteger));
  }

  function saveCompletion() {
    if (!currentSurah) return;
    const saved = getCompletedSurahs();
    saved[currentSurah.number] = [...completedAyahs];
    HudaUtils.storage.set(COMPLETION_KEY, saved);
  }

  function renderCompletion() {
    const total = verses.length;
    const completed = [...completedAyahs].filter((ayahNumber) => verses.some((ayah) => ayah.numberInSurah === ayahNumber)).length;
    const percentage = total ? Math.round((completed / total) * 100) : 0;

    elements.readingProgress.style.setProperty('--progress', percentage);
    elements.readingProgressValue.textContent = `${arabicNumber(percentage)}٪`;
    elements.readingProgress.setAttribute('aria-label', `تم إكمال ${arabicNumber(completed)} من ${arabicNumber(total)} آية، بنسبة ${arabicNumber(percentage)} بالمئة`);
    setStatus(total ? `تم إكمال ${arabicNumber(completed)} من ${arabicNumber(total)} آية في هذه السورة.` : 'استمع إلى الآيات، وسيزداد مؤشر الإنجاز عند اكتمال كل آية.');
  }

  function markCurrentVerseComplete() {
    const current = verses[currentVerseIndex];
    if (!current || completedAyahs.has(current.numberInSurah)) return;
    completedAyahs.add(current.numberInSurah);
    saveCompletion();
    renderCompletion();
    renderVerses(elements.verseSearch.value);
  }

  function createOption(surah) {
    const option = document.createElement('option');
    option.value = String(surah.number);
    option.textContent = `${arabicNumber(surah.number)} — ${surah.name}`;
    return option;
  }

  function renderSurahSelect() {
    elements.select.replaceChildren(...surahs.map(createOption));
  }

  function renderSurahs(filter = '') {
    const query = filter.trim().toLowerCase();
    const matches = surahs.filter((surah) => (
      surah.name.includes(query)
      || surah.englishName.toLowerCase().includes(query)
      || String(surah.number).includes(query)
    ));

    if (!matches.length) {
      elements.list.innerHTML = '<div class="empty-state">لا توجد سورة مطابقة.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    matches.forEach((surah) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `surah-item ${currentSurah?.number === surah.number ? 'active' : ''}`;
      button.dataset.surah = String(surah.number);

      const number = document.createElement('span');
      number.className = 'surah-number';
      number.textContent = arabicNumber(surah.number);
      const name = document.createElement('strong');
      name.textContent = surah.name;
      const ayahs = document.createElement('small');
      ayahs.textContent = `${arabicNumber(surah.numberOfAyahs)} آيات`;
      button.append(number, name, ayahs);

      const progress = memorizationProgress.get(surah.number);
      if (progress?.completed) {
        button.classList.add('memorized');
        const badge = document.createElement('span');
        badge.className = 'surah-memorized-badge';
        badge.textContent = `✓ محفوظة — ${arabicNumber(progress.accuracy)}٪ صح`;
        button.appendChild(badge);
      } else if (progress?.memorizedAyahs) {
        const badge = document.createElement('span');
        badge.className = 'surah-memorized-badge partial';
        badge.textContent = `حفظت ${arabicNumber(progress.memorizedAyahs)}/${arabicNumber(progress.totalAyahs || surah.numberOfAyahs)}`;
        button.appendChild(badge);
      }
      fragment.appendChild(button);
    });
    elements.list.replaceChildren(fragment);
  }

  function renderVerses(filter = '') {
    const query = filter.trim();
    const shown = verses.filter((ayah) => ayah.text.includes(query) || String(ayah.numberInSurah).includes(query));

    if (!shown.length) {
      elements.verses.innerHTML = '<div class="empty-state">لا توجد آيات مطابقة للبحث.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    shown.forEach((ayah) => {
      const index = verses.indexOf(ayah);
      const article = document.createElement('article');
      article.id = `verse-${ayah.numberInSurah}`;
      article.className = `verse ${currentVerseIndex === index ? 'active' : ''} ${completedAyahs.has(ayah.numberInSurah) ? 'completed' : ''}`;

      const number = document.createElement('span');
      number.className = 'verse-number';
      number.textContent = arabicNumber(ayah.numberInSurah);
      const text = document.createElement('p');
      text.className = 'verse-text';
      text.textContent = ayah.text;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `listen-verse ${currentVerseIndex === index ? 'active' : ''}`;
      button.dataset.verse = String(ayah.numberInSurah);
      button.setAttribute('aria-label', `استمع إلى الآية ${arabicNumber(ayah.numberInSurah)}`);
      button.textContent = currentVerseIndex === index ? '❚❚' : '▶';
      article.append(number, text, button);
      fragment.appendChild(article);
    });
    elements.verses.replaceChildren(fragment);
  }

  async function saveReadingProgress(surah, verse) {
    const user = await Huda.getSession();
    if (!user) {
      HudaUtils.storage.set(LAST_SURAH_KEY, { surah, verse });
      return;
    }
    Huda.apiPut('/progress/reading', { surah, verse }).catch(() => {});
  }

  function resetPlayer() {
    elements.audio.pause();
    elements.audio.removeAttribute('src');
    elements.audio.load();
    elements.audioProgress.value = '0';
    elements.audioTime.textContent = '٠:٠٠ / ٠:٠٠';
    elements.play.textContent = '▶';
    elements.play.setAttribute('aria-label', 'تشغيل');
    elements.nowPlaying.textContent = 'اختر آية للاستماع';
  }

  async function loadSurah(number) {
    const selectedNumber = Number(number);
    const loadId = ++requestNumber;
    elements.verses.innerHTML = '<div class="loading">جاري تحميل الآيات بالرسم العثماني…</div>';
    elements.select.value = String(selectedNumber);

    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah/${selectedNumber}/quran-uthmani`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب السورة');
      const data = await response.json();
      if (loadId !== requestNumber) return;

      currentSurah = data.data;
      verses = currentSurah.ayahs || [];
      currentVerseIndex = -1;
      restoreCompletion(selectedNumber);
      resetPlayer();
      elements.title.textContent = currentSurah.name;
      elements.meta.textContent = `${currentSurah.englishName} • ${arabicNumber(currentSurah.numberOfAyahs)} آيات`;
      elements.verseSearch.value = '';
      history.replaceState(null, '', `#surah-${selectedNumber}`);
      renderSurahs(elements.surahSearch.value);
      renderVerses();
      renderCompletion();
      saveReadingProgress(selectedNumber, null);
    } catch (error) {
      if (loadId !== requestNumber) return;
      elements.verses.innerHTML = '<div class="empty-state">تعذّر تحميل الآيات حالياً. تحقق من اتصال الإنترنت ثم أعد المحاولة.</div>';
      setStatus('تعذّر تحديث مؤشر الإنجاز حتى يتم تحميل السورة.');
    }
  }

  function updateNowPlaying(ayah) {
    elements.nowPlaying.textContent = `${currentSurah.name} — الآية ${arabicNumber(ayah.numberInSurah)}`;
  }

  function playVerse(index) {
    const ayah = verses[index];
    if (!ayah || !currentSurah) return;

    const changedVerse = currentVerseIndex !== index;
    currentVerseIndex = index;
    const url = audioUrl(ayah);
    if (changedVerse || elements.audio.src !== url) {
      elements.audio.src = url;
      elements.audio.load();
    }

    updateNowPlaying(ayah);
    elements.play.textContent = '❚❚';
    elements.play.setAttribute('aria-label', 'إيقاف مؤقت');
    renderVerses(elements.verseSearch.value);
    document.getElementById(`verse-${ayah.numberInSurah}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    saveReadingProgress(currentSurah.number, ayah.numberInSurah);
    elements.audio.play().catch(() => setStatus('اضغط زر التشغيل للسماح للمتصفح ببدء التلاوة.'));
  }

  async function getStartSurah() {
    const fromHash = Number(location.hash.replace('#surah-', ''));
    if (surahs.some((surah) => surah.number === fromHash)) return fromHash;

    const user = await Huda.getSession();
    if (user) {
      try {
        const saved = await Huda.apiGet('/progress/reading');
        if (saved.lastSurah && surahs.some((surah) => surah.number === saved.lastSurah)) return saved.lastSurah;
      } catch { /* نعتمد آخر سورة محفوظة محلياً إن تعذّرت المزامنة */ }
    }

    const local = HudaUtils.storage.get(LAST_SURAH_KEY);
    return local?.surah && surahs.some((surah) => surah.number === local.surah) ? local.surah : 1;
  }

  async function loadSurahs() {
    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب قائمة السور');
      const data = await response.json();
      surahs = Array.isArray(data.data) ? data.data : [];
      if (!surahs.length) throw new Error('قائمة السور فارغة');

      renderSurahSelect();
      renderSurahs();
      loadSurah(await getStartSurah());
    } catch (error) {
      elements.select.innerHTML = '<option>تعذّر تحميل السور</option>';
      elements.list.innerHTML = '<div class="empty-state">تعذّر تحميل قائمة السور. تحقق من اتصال الإنترنت ثم أعد المحاولة.</div>';
    }
  }

  function setAudioSourceForCurrentReciter() {
    if (currentVerseIndex < 0 || !verses[currentVerseIndex]) return;
    const wasPlaying = !elements.audio.paused;
    const ayah = verses[currentVerseIndex];
    elements.audio.src = audioUrl(ayah);
    elements.audio.load();
    updateAudioTimeline();
    if (wasPlaying) elements.audio.play().catch(() => {});
  }

  elements.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-surah]');
    if (button) loadSurah(button.dataset.surah);
  });
  elements.select.addEventListener('change', (event) => loadSurah(event.target.value));
  elements.verses.addEventListener('click', (event) => {
    const button = event.target.closest('[data-verse]');
    if (!button) return;
    playVerse(verses.findIndex((ayah) => ayah.numberInSurah === Number(button.dataset.verse)));
  });
  elements.surahSearch.addEventListener('input', (event) => renderSurahs(event.target.value));
  elements.verseSearch.addEventListener('input', (event) => renderVerses(event.target.value));
  elements.increaseFont.addEventListener('click', () => { fontSize += 2; applyFontSize(); });
  elements.decreaseFont.addEventListener('click', () => { fontSize -= 2; applyFontSize(); });
  elements.reciter.addEventListener('change', setAudioSourceForCurrentReciter);

  elements.play.addEventListener('click', () => {
    if (currentVerseIndex < 0) playVerse(0);
    else if (elements.audio.paused) elements.audio.play().catch(() => setStatus('تعذّر تشغيل التلاوة حالياً.'));
    else elements.audio.pause();
  });
  elements.previous.addEventListener('click', () => playVerse(Math.max(0, currentVerseIndex - 1)));
  elements.next.addEventListener('click', () => playVerse(Math.min(verses.length - 1, currentVerseIndex < 0 ? 0 : currentVerseIndex + 1)));
  elements.audioProgress.addEventListener('input', () => {
    if (Number.isFinite(elements.audio.duration)) {
      elements.audio.currentTime = (Number(elements.audioProgress.value) / 100) * elements.audio.duration;
    }
  });
  elements.audio.addEventListener('loadedmetadata', updateAudioTimeline);
  elements.audio.addEventListener('timeupdate', updateAudioTimeline);
  elements.audio.addEventListener('play', () => {
    elements.play.textContent = '❚❚';
    elements.play.setAttribute('aria-label', 'إيقاف مؤقت');
  });
  elements.audio.addEventListener('pause', () => {
    if (!elements.audio.ended) {
      elements.play.textContent = '▶';
      elements.play.setAttribute('aria-label', 'تشغيل');
    }
  });
  elements.audio.addEventListener('ended', () => {
    markCurrentVerseComplete();
    if (elements.repeat.checked) {
      elements.audio.currentTime = 0;
      elements.audio.play().catch(() => {});
      return;
    }
    if (currentVerseIndex < verses.length - 1) {
      playVerse(currentVerseIndex + 1);
    } else {
      elements.play.textContent = '▶';
      elements.play.setAttribute('aria-label', 'تشغيل');
      elements.nowPlaying.textContent = `أتممت سورة ${currentSurah.name}`;
    }
  });
  elements.audio.addEventListener('error', () => setStatus('تعذّر تحميل صوت هذه الآية. جرّب قارئاً آخر أو أعد المحاولة.'));

  // علامات "✓ محفوظة" مصدرها حساب المستخدم في قاعدة البيانات.
  async function loadMemorizationBadges() {
    try {
      const user = await Huda.getSession();
      if (!user) return;
      const data = await HudaMemorization.listSurahProgress();
      memorizationProgress = new Map(data.surahs.map((surah) => [surah.surahNumber, surah]));
      renderSurahs(elements.surahSearch.value);
    } catch (error) {
      if (!(error instanceof HudaMemorization.AuthRequiredError)) {
        console.warn('Memorization badges failed:', error);
      }
    }
  }

  document.addEventListener('huda-memorization-updated', loadMemorizationBadges);

  document.addEventListener('DOMContentLoaded', () => {
    applyFontSize();
    loadSurahs();
    loadMemorizationBadges();
  });
})();
