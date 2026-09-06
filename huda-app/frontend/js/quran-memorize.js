/**
 * تبويب الحفظ: تسميع صارم كلمة بكلمة (نطقاً أو كتابةً)، تصنيف دقيق للأخطاء،
 * تلميح بالحرف الأول، تسجيل ومقارنة، ومزامنة كل التقدّم مع قاعدة بيانات المستخدم.
 * لا يعمل هذا القسم إلا بعد تسجيل الدخول.
 */

(() => {
  const QURAN_API = 'https://api.alquran.cloud/v1';
  const RECITER = 'Alafasy_128kbps';

  const elements = {
    panel: document.getElementById('tab-memorize'),
    authGate: document.getElementById('mem-auth-gate'),
    workspace: document.getElementById('mem-workspace'),
    surahSelect: document.getElementById('mem-surah-select'),
    hideText: document.getElementById('mem-hide-text'),
    progress: document.getElementById('mem-progress'),
    progressValue: document.getElementById('mem-progress-value'),
    accuracy: document.getElementById('mem-accuracy'),
    warning: document.getElementById('mem-support-warning'),
    surahTitle: document.getElementById('mem-surah-title'),
    verseCounter: document.getElementById('mem-verse-counter'),
    verseText: document.getElementById('mem-verse-text'),
    feedback: document.getElementById('mem-feedback'),
    errorList: document.getElementById('mem-errors'),
    micButton: document.getElementById('mem-mic-button'),
    micLabel: document.getElementById('mem-mic-label'),
    typedInput: document.getElementById('mem-typed-input'),
    typedSubmit: document.getElementById('mem-typed-submit'),
    hintButton: document.getElementById('mem-hint'),
    listenCorrect: document.getElementById('mem-listen-correct'),
    repeatVerse: document.getElementById('mem-repeat-verse'),
    nextVerse: document.getElementById('mem-next-verse'),
    recordButton: document.getElementById('mem-record'),
    compareBox: document.getElementById('mem-compare'),
    playUser: document.getElementById('mem-play-user'),
    playSheikh: document.getElementById('mem-play-sheikh'),
    discardRecording: document.getElementById('mem-discard'),
    quickReview: document.getElementById('mem-quick-review'),
    reviewBanner: document.getElementById('mem-review-banner'),
    audio: document.getElementById('mem-audio'),
    userAudio: document.getElementById('mem-user-audio'),
  };

  if (!elements.panel) return;

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(number);

  let surahs = [];
  let surahProgress = new Map();
  let currentSurah = null;
  let ayahs = [];
  let ayahIndex = -1;
  let expectedWords = [];
  let wordSpans = [];
  let wordIndex = 0;
  let attemptErrors = [];
  let hintsUsed = 0;
  let recognition = null;
  let listening = false;
  let restartTimer = null;
  let loaded = false;
  let recorder = null;

  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ===== واجهة =====

  function setFeedback(message, tone = 'info') {
    elements.feedback.textContent = message;
    elements.feedback.dataset.tone = tone;
  }

  function renderErrors() {
    elements.errorList.replaceChildren();
    if (!attemptErrors.length) {
      elements.errorList.hidden = true;
      return;
    }
    elements.errorList.hidden = false;
    attemptErrors.slice(-5).forEach((error) => {
      const item = document.createElement('li');
      item.className = `mem-error mem-error-${error.type}`;
      item.textContent = HudaVerseDiff.describeError(error);
      elements.errorList.appendChild(item);
    });
  }

  function renderSurahOptions() {
    const options = [Object.assign(document.createElement('option'), { value: '', textContent: 'اختر سورة…' })];
    surahs.forEach((surah) => {
      const progress = surahProgress.get(surah.number);
      const option = document.createElement('option');
      option.value = String(surah.number);
      const badge = progress?.completed
        ? ' ✓ محفوظة'
        : progress?.memorizedAyahs
          ? ` (${arabicNumber(progress.memorizedAyahs)}/${arabicNumber(progress.totalAyahs || surah.numberOfAyahs)})`
          : '';
      const accuracy = progress?.accuracy ? ` — ${arabicNumber(progress.accuracy)}٪ صح` : '';
      option.textContent = `${arabicNumber(surah.number)} — ${surah.name}${badge}${accuracy}`;
      options.push(option);
    });
    const selected = elements.surahSelect.value;
    elements.surahSelect.replaceChildren(...options);
    if (selected) elements.surahSelect.value = selected;
  }

  function renderProgress() {
    if (!currentSurah) return;
    const progress = surahProgress.get(currentSurah.number);
    const total = progress?.totalAyahs || ayahs.length;
    const done = progress?.memorizedAyahs || 0;
    const percent = total ? Math.round((done / total) * 100) : 0;

    elements.progress.style.setProperty('--progress', percent);
    elements.progressValue.textContent = `${arabicNumber(percent)}٪`;
    elements.progress.setAttribute('aria-label', `تم إتقان ${arabicNumber(done)} من ${arabicNumber(total)} آية`);
    elements.accuracy.textContent = progress?.accuracy
      ? `نسبة الإتقان: ${arabicNumber(progress.accuracy)}٪ صح`
      : 'نسبة الإتقان: —';
    elements.surahTitle.textContent = progress?.completed
      ? `سورة ${currentSurah.name} ✓ محفوظة`
      : `سورة ${currentSurah.name}`;
  }

  function paintWords() {
    wordSpans.forEach((span, index) => {
      span.classList.toggle('mem-word-correct', index < wordIndex);
      span.classList.toggle('revealed', index < wordIndex || !elements.hideText.checked);
      span.classList.toggle('mem-word-current', index === wordIndex);
      if (index > wordIndex) span.classList.remove('mem-word-wrong');
    });
  }

  function flagCurrentWord() {
    const span = wordSpans[wordIndex];
    if (span) span.classList.add('mem-word-wrong');
  }

  function updateControls() {
    const hasVerse = ayahIndex >= 0 && Boolean(ayahs[ayahIndex]);
    const verseDone = hasVerse && wordIndex >= expectedWords.length;
    elements.repeatVerse.disabled = !hasVerse;
    elements.listenCorrect.disabled = !hasVerse;
    elements.hintButton.disabled = !hasVerse || verseDone;
    elements.typedInput.disabled = !hasVerse || verseDone;
    elements.typedSubmit.disabled = !hasVerse || verseDone;
    elements.recordButton.disabled = !hasVerse || !HudaRecorder.SUPPORTED;
    // بوابة صارمة: لا انتقال للآية التالية قبل إتقان الحالية 100%.
    elements.nextVerse.disabled = !verseDone || ayahIndex >= ayahs.length - 1;
    elements.nextVerse.title = verseDone ? '' : 'أتقن الآية الحالية 100% أولاً';
  }

  // ===== منطق التسميع الصارم =====

  function renderCurrentVerse() {
    const ayah = ayahs[ayahIndex];
    if (!ayah) return;

    const words = HudaVerseDiff.splitWords(ayah.text);
    expectedWords = words.map(HudaVerseDiff.normalizeWord);
    wordIndex = 0;
    attemptErrors = [];
    hintsUsed = 0;

    elements.verseCounter.textContent = `${arabicNumber(ayah.numberInSurah)} / ${arabicNumber(ayahs.length)}`;
    elements.verseText.replaceChildren();
    elements.verseText.classList.toggle('mem-hide-text', elements.hideText.checked);

    wordSpans = words.map((word) => {
      const span = document.createElement('span');
      span.className = 'mem-word';
      span.textContent = word;
      elements.verseText.appendChild(span);
      elements.verseText.appendChild(document.createTextNode(' '));
      return span;
    });

    elements.typedInput.value = '';
    discardRecording();
    renderErrors();
    paintWords();
    updateControls();
    setFeedback('اقرأ الآية بالمايك أو اكتبها كلمة كلمة — لن تنتقل قبل الإتقان الكامل.', 'info');
  }

  // مقارنة ما قاله/كتبه المستخدم بالكلمات المتبقية، والتقدّم بمقدار الكلمات الصحيحة فقط.
  function submitAttemptText(text) {
    if (ayahIndex < 0 || wordIndex >= expectedWords.length) return;

    const remaining = wordSpans.slice(wordIndex).map((span) => span.textContent).join(' ');
    const result = HudaVerseDiff.compare(remaining, text);
    if (!result.actualCount) return;

    const advanced = result.matchedPrefix;
    wordIndex += advanced;
    paintWords();
    updateControls();

    const blockingError = result.operations[advanced];
    if (blockingError && blockingError.type !== 'match') {
      attemptErrors.push({ ...blockingError, wordIndex });
      renderErrors();
      flagCurrentWord();
      setFeedback(`${HudaVerseDiff.describeError(blockingError)} — أعد المحاولة على هذه الكلمة.`, 'error');
      return;
    }

    if (wordIndex >= expectedWords.length) {
      completeVerse();
      return;
    }

    setFeedback(
      advanced
        ? `أحسنت — ${arabicNumber(advanced)} كلمة صحيحة، تابع…`
        : 'لم أتبيّن الكلمة، أعد المحاولة أو استخدم التلميح.',
      advanced ? 'success' : 'info'
    );
  }

  async function completeVerse() {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;

    stopListening();
    wordSpans.forEach((span) => span.classList.add('revealed', 'mem-word-correct'));
    setFeedback('أتممت الآية بشكل صحيح ١٠٠٪ ✔', 'success');

    const totalWords = expectedWords.length || 1;
    const accuracy = Math.max(0, Math.round(((totalWords - attemptErrors.length) / totalWords) * 100));

    try {
      const response = await HudaMemorization.recordAttempt({
        surahNumber: currentSurah.number,
        surahName: currentSurah.name,
        totalAyahs: ayahs.length,
        ayahNumber: ayah.numberInSurah,
        success: true,
        accuracy,
        hintsUsed,
        errors: attemptErrors.map((error) => ({
          type: error.type,
          wordIndex: error.wordIndex,
          expected: error.expected,
          actual: error.actual,
        })),
      });

      if (response.surah) surahProgress.set(response.surah.surahNumber, response.surah);
      renderProgress();
      renderSurahOptions();
      document.dispatchEvent(new CustomEvent('huda-memorization-updated'));

      if (response.surahJustCompleted) {
        celebrateSurah(response);
      }
    } catch (error) {
      if (error instanceof HudaMemorization.AuthRequiredError) {
        showAuthGate();
        return;
      }
      HudaUtils.showToast('تعذّر حفظ التقدّم في حسابك، حاول مجدداً.', 'error');
    }

    updateControls();

    window.setTimeout(() => {
      if (ayahIndex < ayahs.length - 1) {
        ayahIndex += 1;
        renderCurrentVerse();
      } else {
        setFeedback('أتممت جميع آيات هذه السورة، بارك الله فيك! 🎉', 'success');
      }
    }, 1200);
  }

  function celebrateSurah(response) {
    const streak = response.stats?.currentStreak || 0;
    HudaUtils.showToast(
      `🎉 مبارك! أتممت حفظ سورة ${currentSurah.name} كاملة — سلسلتك ${arabicNumber(streak)} يوم.`,
      'success',
      6000
    );
    elements.panel.classList.add('mem-celebrate');
    window.setTimeout(() => elements.panel.classList.remove('mem-celebrate'), 2500);
  }

  // ===== التلميح =====

  function showHint() {
    const span = wordSpans[wordIndex];
    if (!span) return;
    hintsUsed += 1;
    const hint = HudaVerseDiff.hintFor(span.textContent);
    span.classList.add('mem-word-hinted');
    setFeedback(`تلميح: الكلمة تبدأ بـ «${hint}»`, 'info');
  }

  // ===== المايك =====

  function ensureRecognition() {
    if (recognition || !SpeechRecognitionImpl) return recognition;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) submitAttemptText(result[0].transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setFeedback('لم يُسمح بالوصول إلى المايك. فعّل إذن المايك من إعدادات المتصفح.', 'error');
        listening = false;
        updateMicUI();
      }
    };

    recognition.onend = () => {
      if (!listening) return;
      clearTimeout(restartTimer);
      restartTimer = window.setTimeout(() => {
        try { recognition.start(); } catch { /* already running */ }
      }, 250);
    };

    return recognition;
  }

  function updateMicUI() {
    elements.micButton.classList.toggle('mic-active', listening);
    elements.micButton.setAttribute('aria-pressed', String(listening));
    elements.micLabel.textContent = listening ? 'إيقاف التسميع' : 'ابدأ التسميع';
  }

  function startListening() {
    if (!SpeechRecognitionImpl) return;
    if (ayahIndex === -1) {
      setFeedback('اختر سورة أولاً لتبدأ التسميع.', 'error');
      return;
    }
    const engine = ensureRecognition();
    if (!engine) return;
    listening = true;
    updateMicUI();
    setFeedback('🎙 أستمع إليك الآن…', 'info');
    try { engine.start(); } catch { /* already started */ }
  }

  function stopListening() {
    listening = false;
    clearTimeout(restartTimer);
    updateMicUI();
    if (recognition) {
      try { recognition.stop(); } catch { /* not started */ }
    }
  }

  // ===== سجّل وقارن =====

  function discardRecording() {
    recorder?.discard();
    recorder = null;
    elements.userAudio.removeAttribute('src');
    elements.compareBox.hidden = true;
    elements.recordButton.classList.remove('mic-active');
    elements.recordButton.textContent = '🎙 سجّل وقارن';
  }

  async function toggleRecording() {
    if (!HudaRecorder.SUPPORTED) {
      HudaUtils.showToast('متصفحك لا يدعم التسجيل الصوتي.', 'error');
      return;
    }

    if (recorder?.isRecording()) {
      const url = await recorder.stop();
      elements.userAudio.src = url;
      elements.compareBox.hidden = false;
      elements.recordButton.classList.remove('mic-active');
      elements.recordButton.textContent = '🎙 سجّل مرة أخرى';
      setFeedback('قارن تسجيلك بتلاوة الشيخ — يُحذف التسجيل تلقائياً بعد المقارنة.', 'info');
      return;
    }

    try {
      recorder = HudaRecorder.create();
      await recorder.start();
      elements.recordButton.classList.add('mic-active');
      elements.recordButton.textContent = '■ إيقاف التسجيل';
    } catch (error) {
      HudaUtils.showToast('تعذّر الوصول إلى المايك للتسجيل.', 'error');
    }
  }

  function sheikhAudioUrl(ayah) {
    return `https://everyayah.com/data/${RECITER}/${String(currentSurah.number).padStart(3, '0')}${String(ayah.numberInSurah).padStart(3, '0')}.mp3`;
  }

  // ===== تحميل البيانات =====

  async function loadSurahList() {
    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب قائمة السور');
      const data = await response.json();
      surahs = Array.isArray(data.data) ? data.data : [];
      renderSurahOptions();
    } catch (error) {
      elements.surahSelect.innerHTML = '<option>تعذّر تحميل السور</option>';
    }
  }

  async function loadProgress() {
    try {
      const data = await HudaMemorization.listSurahProgress();
      surahProgress = new Map(data.surahs.map((surah) => [surah.surahNumber, surah]));
      renderSurahOptions();
      renderProgress();
    } catch (error) {
      if (error instanceof HudaMemorization.AuthRequiredError) showAuthGate();
    }
  }

  async function loadSurah(surahNumber) {
    if (!surahNumber) return;
    try {
      elements.surahTitle.textContent = 'جاري تحميل السورة…';
      const response = await HudaUtils.fetchWithRetry(
        `${QURAN_API}/surah/${surahNumber}/quran-simple`,
        { timeout: CONFIG.API.TIMEOUT },
        2
      );
      if (!response.ok) throw new Error('تعذّر جلب السورة');
      const data = await response.json();
      currentSurah = data.data;
      ayahs = currentSurah.ayahs || [];
      ayahIndex = ayahs.length ? 0 : -1;
      stopListening();
      renderProgress();
      if (ayahIndex >= 0) renderCurrentVerse();
    } catch (error) {
      elements.surahTitle.textContent = 'تعذّر تحميل السورة';
      HudaUtils.showToast('تعذّر تحميل آيات هذه السورة حالياً.', 'error');
    }
  }

  // ===== المراجعة السريعة =====

  async function startQuickReview() {
    try {
      const data = await HudaMemorization.getQuickReview(10);
      if (!data.items.length) {
        HudaUtils.showToast('لا توجد آيات جاهزة للمراجعة بعد — أتقن آيات أولاً.', 'info');
        return;
      }
      const item = data.items[0];
      elements.reviewBanner.hidden = false;
      elements.reviewBanner.textContent = `مراجعة سريعة: ${arabicNumber(data.items.length)} آية بحاجة للتثبيت — نبدأ بسورة ${item.surahName || arabicNumber(item.surahNumber)} آية ${arabicNumber(item.ayahNumber)}.`;

      if (currentSurah?.number !== item.surahNumber) {
        elements.surahSelect.value = String(item.surahNumber);
        await loadSurah(item.surahNumber);
      }
      const index = ayahs.findIndex((ayah) => ayah.numberInSurah === item.ayahNumber);
      if (index >= 0) {
        ayahIndex = index;
        renderCurrentVerse();
      }
    } catch (error) {
      if (error instanceof HudaMemorization.AuthRequiredError) showAuthGate();
      else HudaUtils.showToast('تعذّر بدء المراجعة السريعة.', 'error');
    }
  }

  // ===== بوابة تسجيل الدخول =====

  function showAuthGate() {
    elements.authGate.hidden = false;
    elements.workspace.hidden = true;
  }

  function hideAuthGate() {
    elements.authGate.hidden = true;
    elements.workspace.hidden = false;
  }

  // ===== الأحداث =====

  elements.surahSelect.addEventListener('change', (event) => loadSurah(Number(event.target.value)));

  elements.micButton.addEventListener('click', () => (listening ? stopListening() : startListening()));

  elements.typedSubmit.addEventListener('click', () => {
    const value = elements.typedInput.value.trim();
    if (!value) return;
    submitAttemptText(value);
    elements.typedInput.value = '';
    updateControls();
  });

  elements.typedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      elements.typedSubmit.click();
    }
  });

  elements.hintButton.addEventListener('click', showHint);

  elements.repeatVerse.addEventListener('click', () => renderCurrentVerse());

  elements.nextVerse.addEventListener('click', () => {
    if (wordIndex < expectedWords.length) return;
    if (ayahIndex < ayahs.length - 1) {
      ayahIndex += 1;
      renderCurrentVerse();
    }
  });

  elements.listenCorrect.addEventListener('click', () => {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;
    elements.audio.src = sheikhAudioUrl(ayah);
    elements.audio.play().catch(() => setFeedback('تعذّر تشغيل الصوت، حاول مجدداً.', 'error'));
  });

  elements.recordButton.addEventListener('click', toggleRecording);

  elements.playUser.addEventListener('click', () => {
    elements.audio.pause();
    elements.userAudio.play().catch(() => HudaUtils.showToast('تعذّر تشغيل تسجيلك.', 'error'));
  });

  elements.playSheikh.addEventListener('click', () => {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;
    elements.userAudio.pause();
    elements.audio.src = sheikhAudioUrl(ayah);
    elements.audio.play().catch(() => HudaUtils.showToast('تعذّر تشغيل تلاوة الشيخ.', 'error'));
  });

  elements.discardRecording.addEventListener('click', () => {
    discardRecording();
    HudaUtils.showToast('تم حذف التسجيل من جهازك.', 'success', 2000);
  });

  // الخصوصية: أي مغادرة للشاشة تعني حذف التسجيل فوراً.
  window.addEventListener('pagehide', discardRecording);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) discardRecording();
  });

  elements.quickReview.addEventListener('click', startQuickReview);

  elements.hideText.addEventListener('change', () => {
    elements.verseText.classList.toggle('mem-hide-text', elements.hideText.checked);
    paintWords();
  });

  async function init() {
    if (loaded) return;

    if (!SpeechRecognitionImpl) {
      elements.warning.hidden = false;
      elements.micButton.disabled = true;
    }

    const user = await Huda.getSession();
    if (!user) {
      showAuthGate();
      return;
    }

    loaded = true;
    hideAuthGate();

    await Promise.all([loadSurahList(), loadProgress()]);
    updateControls();
  }

  document.addEventListener('quran-tab-activated', (event) => {
    if (event.detail.tab === 'memorize') init();
  });

  document.addEventListener('huda-auth-ready', (event) => {
    if (event.detail?.user && document.getElementById('tab-memorize')?.hidden === false) {
      init();
    }
  });
})();
