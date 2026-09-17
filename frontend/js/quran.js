(() => {
  const QURAN_API = 'https://api.alquran.cloud/v1';
  const MP3QURAN_API = 'https://mp3quran.net/api/v3';
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
    downloadSurah: document.getElementById('download-surah'),
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
  // التلاوة تعمل بملف سورة واحد فقط لكل قارئ. عند الضغط على آية
  // نتحرك داخل نفس الملف إلى timestamp الآية، بدل تحميل ملف MP3 جديد.
  // كل قارئ له أكثر من اسم/صيغة محتملة في مصدر mp3quran.net (مع أو بدون
  // "ال" التعريف، مع أو بدون مسافة قبل الاسم الأخير...)، فنزوّد كل قارئ
  // بأكبر عدد ممكن من الصيغ لتقليل احتمال فشل المطابقة (مثل ما كان يحصل
  // أحياناً مع "محمد اللحيدان" فقط بصيغة واحدة).
  const RECITERS = {
    Alafasy_128kbps: { aliases: ['مشاري العفاسي', 'مشاري راشد العفاسي', 'Mishary Rashid al-`Afasy'] },
    Minshawy_Mujawwad_192kbps: { aliases: ['محمد صديق المنشاوي', 'محمد صديق المنشاوي مجود', 'المنشاوي مجود'] },
    Husary_128kbps: { aliases: ['محمود خليل الحصري', 'الحصري'] },
    Abdul_Basit_Murattal_192kbps: { aliases: ['عبدالباسط عبدالصمد', 'عبدالباسط عبد الصمد', 'عبد الباسط عبد الصمد'] },
    'Yasser_Ad-Dussary_128kbps': { aliases: ['ياسر الدوسري', 'ياسر الدوسرى'] },
    'Mohammed_Al-Lohaidan_MP3QURAN': { aliases: ['محمد اللحيدان', 'محمد الحيدان', 'اللحيدان', 'الحيدان'] },
    'Maher_AlMuaiqly_64kbps': { aliases: ['ماهر المعيقلي', 'ماهر المعيقلى'] },
    'Islam_Sobhi_MP3QURAN': { aliases: ['إسلام صبحي', 'اسلام صبحي'] },
    'Abdurrahmaan_As-Sudais_192kbps': { aliases: ['عبدالرحمن السديس', 'عبد الرحمن السديس'] },
  };

  let reciterCatalog = null;
  let activeReciter = null;
  let verseTimings = [];
  const timingCache = new Map();

  const normalizeArabic = (value = '') => value
    .toString()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '')
    .toLowerCase();

  // نرجّع كل المطابقات المحتملة (وليس أول واحدة فقط)، لأن مصدر mp3quran.net
  // أحياناً يحتوي أكثر من قيد لنفس القارئ (روايات/إصدارات مختلفة)، وبعضها
  // قد لا يملك تلاوة كاملة (114 سورة) بينما يملكها قيد آخر لنفس الاسم.
  function findReciterCandidates(key) {
    const aliases = RECITERS[key]?.aliases || [];
    const normalizedAliases = aliases.map(normalizeArabic).filter(Boolean);
    if (!reciterCatalog || !normalizedAliases.length) return [];
    return reciterCatalog.filter((reciter) => {
      const name = normalizeArabic(reciter.name);
      return normalizedAliases.some((alias) => name.includes(alias) || alias.includes(name));
    });
  }

  // أفضل "moshaf" (تسجيل) لقارئ معيّن: نفضّل ما يغطي القرآن كاملاً (114 سورة)،
  // وإلا نأخذ الأوسع تغطية المتاحة، بدل الاكتفاء بأول عنصر في المصفوفة فقط
  // (وهو ما كان يسبب فشل بعض القرّاء إن لم يكن أول تسجيل عندهم هو الكامل).
  function pickBestMoshaf(reciter) {
    const list = Array.isArray(reciter?.moshaf) ? reciter.moshaf.filter((m) => m?.server && m?.id) : [];
    if (!list.length) return null;
    const full = list.find((item) => Number(item.surah_total) === 114);
    if (full) return full;
    return list.slice().sort((a, b) => Number(b.surah_total || 0) - Number(a.surah_total || 0))[0];
  }

  async function loadReciterCatalog() {
    if (reciterCatalog) return reciterCatalog;
    // زيادة المهلة والمحاولات هنا تحديداً: mp3quran.net أحياناً يكون بطيئاً،
    // وفشل هذا الطلب وحده هو ما يجعل "كل" القرّاء يبدون كأنهم لا يعملون.
    const response = await HudaUtils.fetchWithRetry(`${MP3QURAN_API}/reciters?language=ar`, { timeout: Math.max(CONFIG.API.TIMEOUT, 15000) }, 3);
    if (!response.ok) throw new Error('تعذّر تحميل قائمة القرّاء');
    const data = await response.json();
    reciterCatalog = Array.isArray(data.reciters) ? data.reciters : [];
    if (!reciterCatalog.length) throw new Error('قائمة القرّاء فارغة');
    return reciterCatalog;
  }

  async function ensureReciter() {
    const key = elements.reciter.value;
    if (activeReciter?.key === key) return activeReciter;
    try {
      await loadReciterCatalog();
    } catch (error) {
      // فشل تحميل القائمة كاملةً (مصدر خارجي بطيء/متعطل مؤقتاً) — نعيد
      // المحاولة مرة واحدة بعد تصفير الكاش، بدل الفشل الصامت النهائي.
      reciterCatalog = null;
      await loadReciterCatalog();
    }
    const candidates = findReciterCandidates(key);
    if (!candidates.length) throw new Error('تعذّر العثور على هذا القارئ في مصدر التلاوات');

    // من بين كل المطابقات، نختار أول واحد نجح باختيار moshaf صالح له.
    let reciter = null;
    let moshaf = null;
    for (const candidate of candidates) {
      const best = pickBestMoshaf(candidate);
      if (best) { reciter = candidate; moshaf = best; break; }
    }
    if (!reciter || !moshaf) throw new Error('لا توجد تلاوة كاملة متاحة لهذا القارئ حالياً');

    activeReciter = {
      key,
      reciterId: reciter.id,
      readId: moshaf.id,
      name: reciter.name,
      server: moshaf.server.endsWith('/') ? moshaf.server : `${moshaf.server}/`,
    };
    return activeReciter;
  }

  function reciterConfig() {
    return activeReciter;
  }

  function fullSurahAudioUrl(config = activeReciter) {
    if (!config || !currentSurah) return '';
    return `${config.server}${String(currentSurah.number).padStart(3, '0')}.mp3`;
  }

  async function loadVerseTimings(config = activeReciter) {
    if (!config || !currentSurah) return [];
    const cacheKey = `${config.readId}:${currentSurah.number}`;
    if (timingCache.has(cacheKey)) return timingCache.get(cacheKey);

    const response = await HudaUtils.fetchWithRetry(
      `${MP3QURAN_API}/ayat_timing?surah=${currentSurah.number}&read=${config.readId}`,
      { timeout: CONFIG.API.TIMEOUT },
      2,
    );
    if (!response.ok) throw new Error('تعذّر تحميل توقيت الآيات');
    const data = await response.json();
    const timings = Array.isArray(data)
      ? data
        .filter((item) => Number.isFinite(Number(item.ayah)) && Number(item.ayah) >= 1)
        .map((item) => ({
          ayah: Number(item.ayah),
          start: Number(item.start_time),
          end: Number(item.end_time),
        }))
        .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
      : [];
    timingCache.set(cacheKey, timings);
    return timings;
  }

  function timingForAyah(ayahNumber) {
    return verseTimings.find((item) => item.ayah === Number(ayahNumber)) || null;
  }

  function findVerseIndexAtTime(currentTimeSeconds) {
    const ms = currentTimeSeconds * 1000;
    let low = 0;
    let high = verseTimings.length - 1;
    let result = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const timing = verseTimings[mid];
      if (ms < timing.start) high = mid - 1;
      else if (ms >= timing.end) low = mid + 1;
      else { result = mid; break; }
    }
    if (result < 0 && verseTimings.length && ms >= verseTimings[verseTimings.length - 1].start) result = verseTimings.length - 1;
    if (result < 0) return -1;
    const ayahNumber = verseTimings[result].ayah;
    return verses.findIndex((ayah) => ayah.numberInSurah === ayahNumber);
  }

  function highlightVerse(index, { scroll = false } = {}) {
    if (index < 0 || index >= verses.length || currentVerseIndex === index) return;
    currentVerseIndex = index;
    const current = verses[index];
    document.querySelectorAll('#verses .verse.active, #verses .listen-verse.active').forEach((node) => node.classList.remove('active'));
    const article = document.getElementById(`verse-${current.numberInSurah}`);
    article?.classList.add('active');
    article?.querySelector('.listen-verse')?.classList.add('active');
    const button = article?.querySelector('.listen-verse');
    if (button) button.textContent = '❚❚';
    updateNowPlaying(current);
    if (scroll) article?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    saveReadingProgress(currentSurah.number, current.numberInSurah);
  }

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
      const copyButton = document.createElement('button');
      copyButton.type = 'button'; copyButton.className = 'copy-verse'; copyButton.dataset.copyVerse = String(ayah.numberInSurah);
      copyButton.setAttribute('aria-label', `نسخ الآية ${arabicNumber(ayah.numberInSurah)}`); copyButton.textContent = 'نسخ الآية';
      article.append(number, text, button, copyButton);
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
      activeReciter = null;
      verseTimings = [];
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
      setAudioSourceForCurrentReciter().catch(() => {});
    } catch (error) {
      if (loadId !== requestNumber) return;
      elements.verses.innerHTML = '<div class="empty-state">تعذّر تحميل الآيات حالياً. تحقق من اتصال الإنترنت ثم أعد المحاولة.</div>';
      setStatus('تعذّر تحديث مؤشر الإنجاز حتى يتم تحميل السورة.');
    }
  }

  function updateNowPlaying(ayah) {
    elements.nowPlaying.textContent = `${currentSurah.name} — الآية ${arabicNumber(ayah.numberInSurah)}`;
  }

  async function playVerse(index) {
    const ayah = verses[index];
    if (!ayah || !currentSurah) return;

    try {
      const config = await ensureReciter();
      verseTimings = await loadVerseTimings(config);
      const timing = timingForAyah(ayah.numberInSurah);
      if (!timing) throw new Error('لا يوجد توقيت موثوق لهذه الآية');

      currentVerseIndex = index;
      const url = fullSurahAudioUrl(config);
      if (elements.audio.src !== url) {
        elements.audio.src = url;
        elements.audio.load();
        await new Promise((resolve, reject) => {
          const onReady = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('تعذّر تحميل ملف السورة')); };
          const cleanup = () => {
            elements.audio.removeEventListener('loadedmetadata', onReady);
            elements.audio.removeEventListener('error', onError);
          };
          elements.audio.addEventListener('loadedmetadata', onReady, { once: true });
          elements.audio.addEventListener('error', onError, { once: true });
        });
      }

      elements.audio.currentTime = timing.start / 1000;
      highlightVerse(index, { scroll: true });
      elements.play.textContent = '❚❚';
      elements.play.setAttribute('aria-label', 'إيقاف مؤقت');
      setStatus(`تلاوة ${config.name} — اضغط أي آية للانتقال إليها داخل نفس الصوت.`);
      await elements.audio.play();
    } catch (error) {
      console.error('Quran audio error:', error);
      setStatus('تعذّر تحميل تلاوة هذا القارئ حالياً. حاول مرة أخرى أو اختر قارئاً آخر.');
      HudaUtils.showToast('تعذّر تحميل التلاوة حالياً', 'error');
    }
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

  async function setAudioSourceForCurrentReciter() {
    if (!currentSurah) return;
    const wasPlaying = !elements.audio.paused;
    try {
      const config = await ensureReciter();
      verseTimings = await loadVerseTimings(config);
      const url = fullSurahAudioUrl(config);
      if (elements.audio.src !== url) {
        elements.audio.pause();
        elements.audio.src = url;
        elements.audio.load();
      }
      if (currentVerseIndex >= 0 && verses[currentVerseIndex]) {
        const timing = timingForAyah(verses[currentVerseIndex].numberInSurah);
        if (timing) elements.audio.currentTime = timing.start / 1000;
      }
      setStatus(`تم اختيار القارئ: ${config.name}`);
      if (wasPlaying) await elements.audio.play();
    } catch (error) {
      console.error('Reciter switch error:', error);
      setStatus('تعذّر تحميل القارئ المختار. جرّب قارئاً آخر.');
      HudaUtils.showToast('تعذّر تحميل التلاوة', 'error');
    }
  }

  elements.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-surah]');
    if (button) loadSurah(button.dataset.surah);
  });
  elements.select.addEventListener('change', (event) => loadSurah(event.target.value));
  elements.verses.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-copy-verse]');
    if (copyButton) {
      const ayah = verses.find((item) => item.numberInSurah === Number(copyButton.dataset.copyVerse));
      if (!ayah || !currentSurah) return;
      const value = `${currentSurah.name} — الآية ${ayah.numberInSurah}: ${ayah.text}`;
      try { await navigator.clipboard.writeText(value); HudaUtils.showToast('تم نسخ الآية بنجاح', 'success'); }
      catch { HudaUtils.showToast('تعذّر نسخ الآية. اسمح للمتصفح بالوصول إلى الحافظة ثم حاول مجدداً.', 'error', 4500); }
      return;
    }
    const button = event.target.closest('[data-verse]');
    if (!button) return;
    playVerse(verses.findIndex((ayah) => ayah.numberInSurah === Number(button.dataset.verse)));
  });
  elements.surahSearch.addEventListener('input', (event) => renderSurahs(event.target.value));
  elements.verseSearch.addEventListener('input', (event) => renderVerses(event.target.value));
  elements.increaseFont.addEventListener('click', () => { fontSize += 2; applyFontSize(); });
  elements.decreaseFont.addEventListener('click', () => { fontSize -= 2; applyFontSize(); });
  elements.reciter.addEventListener('change', setAudioSourceForCurrentReciter);

  async function downloadCurrentSurah() {
    if (!currentSurah) {
      HudaUtils.showToast('اختر سورة أولاً', 'error');
      return;
    }
    try {
      const config = await ensureReciter();
      const url = fullSurahAudioUrl(config);
      if (!url) throw new Error('لا يوجد ملف تلاوة لهذه السورة');
      const params = new URLSearchParams({
        url,
        title: currentSurah.name,
        artist: config.name || 'هُدى',
        filename: `هُدى - ${currentSurah.name} - ${config.name || 'قارئ'}.mp3`,
      });
      const base = CONFIG.API.BASE_URL.replace(/\/$/, '');
      elements.downloadSurah.disabled = true;
      elements.downloadSurah.querySelector('span').textContent = 'جاري التجهيز…';
      const response = await fetch(`${base}/quran/download?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) {
        let message = 'تعذّر تجهيز السورة للتنزيل حالياً.';
        try { message = (await response.json()).message || message; } catch { /* non-json */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = params.get('filename');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      HudaUtils.showToast('بدأ تنزيل السورة', 'success');
    } catch (error) {
      console.error('Quran download error:', error);
      HudaUtils.showToast(error.message || 'تعذّر تنزيل السورة حالياً', 'error', 4500);
    } finally {
      elements.downloadSurah.disabled = false;
      elements.downloadSurah.querySelector('span').textContent = 'تنزيل السورة';
    }
  }

  elements.downloadSurah?.addEventListener('click', downloadCurrentSurah);

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
  elements.audio.addEventListener('timeupdate', () => {
    updateAudioTimeline();
    const index = findVerseIndexAtTime(elements.audio.currentTime);
    if (index >= 0) highlightVerse(index);
  });
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
    if (elements.repeat.checked) {
      const timing = timingForAyah(currentVerseIndex >= 0 ? verses[currentVerseIndex]?.numberInSurah : 1);
      elements.audio.currentTime = timing ? timing.start / 1000 : 0;
      elements.audio.play().catch(() => {});
      return;
    }
    if (currentVerseIndex >= 0) markCurrentVerseComplete();
    if (currentVerseIndex < verses.length - 1) {
      playVerse(currentVerseIndex + 1);
    } else {
      elements.play.textContent = '▶';
      elements.play.setAttribute('aria-label', 'تشغيل');
      elements.nowPlaying.textContent = `أتممت سورة ${currentSurah.name}`;
      verses.forEach((ayah) => completedAyahs.add(ayah.numberInSurah));
      saveCompletion();
      renderCompletion();
      renderVerses(elements.verseSearch.value);
    }
  });
  elements.audio.addEventListener('error', () => setStatus('تعذّر تحميل ملف تلاوة السورة. جرّب قارئاً آخر أو أعد المحاولة.'));

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
