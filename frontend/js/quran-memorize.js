/**
 * تبويب الحفظ — منهجية تسميع حقيقية متعددة المراحل (وليس مجرد اختبار كلمة بكلمة):
 *
 *   للآية الواحدة:
 *     ١) القراءة الأولى     — النص كامل وواضح، يقرؤها الطالب قراءة عادية من الصفحة.
 *     ٢) الاستماع            — يسمع تلاوة الشيخ للآية نفسها.
 *     ٣) إعادة القراءة       — يعيد قراءتها بنفسه مرة أخرى بعد الاستماع.
 *     ٤) التكرار المنظّم     — يكرر الآية عدداً محدداً من المرات (خفيف٥/متوسط٧/مكثّف١٠).
 *     ٥) القراءة مع الشيخ    — يقرأها في نفس وقت تلاوة الشيخ (تظليل الكلمات تزامناً مع الصوت).
 *     ٦) التسميع النهائي     — الصفحة تصبح فارغة تماماً؛ تظهر كل كلمة فور نطقها الصحيح؛
 *                              أي خطأ لا يعيد الآية من الصفر، بل يُصحَّح بصوت الشيخ لتلك
 *                              الكلمة تحديداً (أو نطق آلي عند تعذّر الصوت) ثم يتابع الطالب.
 *                              لا ينتقل لآية جديدة إلا بعد تسميعها ١٠٠٪ بلا أي خطأ متبقٍّ.
 *     ٧) الربط بما قبلها     — (إن وُجدت آية سابقة) يُسمِّع الآية الجديدة موصولة بالآية
 *                              التي قبلها مباشرة، بلا توقف بينهما، بنفس آلية الصفحة
 *                              الفارغة. هذا يمنع "التشتت": فالحفظ المنعزل آية بآية قد
 *                              يبدو متقناً لكل آية بمفردها بينما يضيع الطالب فور وصله
 *                              بما حولها. لا يُعتبر الطالب قد "خرج من الآية وهو حافظ
 *                              لها فعلاً" إلا بعد اجتياز هذا الربط ١٠٠٪.
 *   بعد آخر آية في السورة:
 *     ٨) تسميع السورة كاملة — نفس آلية الصفحة الفارغة، لكن من أول آية لآخرها متواصلة
 *        بدون توقف بين الآيات، وعند الإتمام تهنئة صوتية ("حسبك") وفتح السورة التالية.
 *
 * ملاحظة أمانة: لا يمكن لأي متصفح التحقق آلياً من أحكام التجويد الصوتية (مخارج/صفات/مدود)
 * بدقة — هذا يحتاج نموذج صوتي متخصص. لذلك: يُعرض النص بالرسم العثماني الكامل في كل مرحلة
 * ليتابع الطالب أحكامه بنفسه، ويبقى زر "سجّل وقارن" متاحاً ليقارن صوته بصوت الشيخ بأذنه.
 * التصحيح الآلي هنا مبني على دقة الكلمات المنطوقة (نص) لا على جودة النطق نفسها.
 */

(() => {
  const QURAN_API = 'https://api.alquran.cloud/v1';
  const RECITER = 'Alafasy_128kbps'; // صوت الآية كاملة (everyayah.com)
  const WORD_AUDIO_BASE = 'https://audio.qurancdn.com/'; // صوت كل كلمة منفردة (wbw)
  const REPEAT_KEY = 'huda_memorize_repeat_intensity';
  // عدد الآيات السابقة التي تُختبر مع كل آية جديدة في "مرحلة الربط" — هذا هو ما يمنع
  // الحفظ المبعثر (آية منعزلة تُنسى فور الانتقال للتي بعدها) ويضمن اتصال الحفظ فعلياً.
  const LINK_PREV_COUNT = 1;

  const elements = {
    panel: document.getElementById('tab-memorize'),
    authGate: document.getElementById('mem-auth-gate'),
    workspace: document.getElementById('mem-workspace'),
    surahSelect: document.getElementById('mem-surah-select'),
    repeatIntensity: document.getElementById('mem-repeat-intensity'),
    progress: document.getElementById('mem-progress'),
    progressValue: document.getElementById('mem-progress-value'),
    accuracy: document.getElementById('mem-accuracy'),
    warning: document.getElementById('mem-support-warning'),
    stageSteps: document.getElementById('mem-stage-steps'),
    surahTitle: document.getElementById('mem-page-surah-title'),
    pageLabel: document.getElementById('mem-page-label'),
    verseCounter: document.getElementById('mem-verse-counter'),
    content: document.getElementById('mem-mushaf-content'),
    feedback: document.getElementById('mem-feedback'),
    errorList: document.getElementById('mem-errors'),
    stageControls: document.getElementById('mem-stage-controls'),
    compareBox: document.getElementById('mem-compare'),
    playUser: document.getElementById('mem-play-user'),
    playSheikh: document.getElementById('mem-play-sheikh'),
    discardBtn: document.getElementById('mem-discard'),
    quickReview: document.getElementById('mem-quick-review'),
    reviewBanner: document.getElementById('mem-review-banner'),
    audio: document.getElementById('mem-audio'),
    wordAudio: document.getElementById('mem-word-audio'),
    userAudio: document.getElementById('mem-user-audio'),
  };

  if (!elements.panel) return;

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(number);
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

  const AYAH_STAGES = ['read', 'listen', 'reread', 'repeat', 'together', 'test'];
  const STAGE_SHORT = {
    read: '١ القراءة',
    listen: '٢ الاستماع',
    reread: '٣ إعادة القراءة',
    repeat: '٤ التكرار',
    together: '٥ مع الشيخ',
    test: '٦ التسميع',
  };
  const STAGE_LABELS = {
    ...STAGE_SHORT,
    link: '↺ ربط الآية بما قبلها',
    'surah-test': '٧ تسميع السورة كاملة',
  };

  // ===== الحالة العامة =====
  let surahs = [];
  let surahProgress = new Map();
  let currentSurah = null; // { number, name, ayahs:[...] } من alquran.cloud (quran-uthmani)
  let ayahs = [];
  let ayahIndex = -1;
  let stage = 'read';
  let repeatTarget = Number(HudaUtils.storage.get(REPEAT_KEY)) || 7;
  let repeatCount = 0;
  let togetherHighlightIndex = -1;
  let togetherCompleted = false;
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
  let testRefs = null;
  let linkStartIndex = -1; // بداية نطاق "الربط" الحالي (فهرس آية ضمن ayahs)
  let linkTargetIndex = -1; // الآية الجديدة التي نربطها بما قبلها (نهاية النطاق)
  // 'sequential' = جلسة حفظ عادية (تُفعّل مرحلة الربط والانتقال التلقائي للتالي).
  // 'quick-review' = تسميع آية مُتقنة سلفاً من المراجعة السريعة — لا نُقحمها في تدفّق
  // حفظ آيات جديدة (لا ربط ولا انتقال تلقائي لآية تالية لم يطلبها الطالب).
  let sessionMode = 'sequential';
  const pageCache = new Map();

  // ===== أدوات صوتية: تلاوة الشيخ + تصحيح كلمة بصوت + نطق آلي احتياطي =====

  function sheikhAyahAudioUrl(surahNumber, numberInSurah) {
    return `https://everyayah.com/data/${RECITER}/${String(surahNumber).padStart(3, '0')}${String(numberInSurah).padStart(3, '0')}.mp3`;
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ar-SA';
      utter.rate = 0.92;
      window.speechSynthesis.speak(utter);
    } catch { /* لا صوت متاح، نتجاهل بصمت */ }
  }

  // يشغّل صوت الشيخ لكلمة واحدة بعينها من مكتبة wbw، وإن تعذّر (اختلاف ترقيم البسملة
  // مثلاً) ينطقها آلياً عبر TTS كحل احتياطي فوري.
  function playWordCorrection(error) {
    const ayah = ayahs[ayahIndex];
    if (!ayah) return;
    if (error.type === 'extra') {
      speak('كلمة زائدة، تابع بدون هذه الكلمة');
      return;
    }
    const word = error.expected;
    if (!word) return;
    const bismillahOffset =
      ayah.numberInSurah === 1 && currentSurah.number !== 1 && currentSurah.number !== 9 ? 4 : 0;
    const position = (Number(error.wordIndex) || 0) + 1 + bismillahOffset;
    const url = `${WORD_AUDIO_BASE}wbw/${String(currentSurah.number).padStart(3, '0')}_${String(ayah.numberInSurah).padStart(3, '0')}_${String(position).padStart(3, '0')}.mp3`;
    elements.wordAudio.onerror = () => speak(word);
    elements.wordAudio.src = url;
    elements.wordAudio.play().catch(() => speak(word));
  }

  function playAyahAudio(withHighlightSync = false) {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;
    elements.userAudio.pause();
    elements.audio.src = sheikhAyahAudioUrl(currentSurah.number, ayah.numberInSurah);
    elements.audio.ontimeupdate = null;
    elements.audio.onended = () => {
      if (stage === 'together') {
        togetherCompleted = true;
        const nextBtn = document.getElementById('mem-together-next');
        if (nextBtn) nextBtn.disabled = false;
      }
    };
    if (withHighlightSync || stage === 'together') setupTogetherHighlight(ayah);
    elements.audio.play().catch(() => setFeedback('تعذّر تشغيل الصوت، تحقق من الاتصال وحاول مجدداً.', 'error'));
  }

  // تظليل تقريبي للكلمات أثناء "القراءة مع الشيخ": يوزّع مدة الصوت على الكلمات
  // بحسب عدد أحرف كل كلمة (تقدير معقول لعدم توفر توقيتات دقيقة لكل قارئ/آية).
  function setupTogetherHighlight(ayah) {
    const words = HudaVerseDiff.splitWords(ayah.text);
    const weights = words.map((w) => Array.from(w).length + 1);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let cumulative = 0;
    const bounds = weights.map((w) => {
      cumulative += w;
      return cumulative / total;
    });
    elements.audio.ontimeupdate = () => {
      if (!elements.audio.duration) return;
      const progress = elements.audio.currentTime / elements.audio.duration;
      let idx = bounds.findIndex((b) => progress <= b);
      if (idx === -1) idx = words.length - 1;
      togetherHighlightIndex = idx;
      paintWords();
    };
  }

  // ===== واجهة عامة =====

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
  }

  function updateHeader() {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;
    const progress = surahProgress.get(currentSurah.number);
    elements.surahTitle.textContent = progress?.completed ? `سورة ${currentSurah.name} ✓ محفوظة` : `سورة ${currentSurah.name}`;
    elements.verseCounter.textContent = `آية ${arabicNumber(ayah.numberInSurah)} / ${arabicNumber(ayahs.length)} — ${STAGE_LABELS[stage] || ''}`;
  }

  function renderStageSteps() {
    elements.stageSteps.replaceChildren();
    if (stage === 'surah-test') {
      const li = document.createElement('li');
      li.className = 'mem-stage-step active mem-stage-final';
      li.textContent = STAGE_LABELS['surah-test'];
      elements.stageSteps.appendChild(li);
      return;
    }
    if (stage === 'link') {
      const li = document.createElement('li');
      li.className = 'mem-stage-step active mem-stage-link';
      li.textContent = STAGE_LABELS.link;
      elements.stageSteps.appendChild(li);
      return;
    }
    const currentPos = AYAH_STAGES.indexOf(stage);
    AYAH_STAGES.forEach((name, index) => {
      const li = document.createElement('li');
      li.className = 'mem-stage-step';
      if (index < currentPos) li.classList.add('done');
      if (index === currentPos) li.classList.add('active');
      li.textContent = STAGE_SHORT[name];
      elements.stageSteps.appendChild(li);
    });
  }

  // ===== رسم صفحة المصحف الحقيقية (وليس آية معزولة) =====

  async function fetchPage(pageNumber) {
    if (pageCache.has(pageNumber)) return pageCache.get(pageNumber);
    const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/page/${pageNumber}/quran-uthmani`, { timeout: CONFIG.API.TIMEOUT }, 2);
    if (!response.ok) throw new Error('تعذّر جلب صفحة المصحف');
    const data = await response.json();
    pageCache.set(pageNumber, data.data);
    return data.data;
  }

  function buildWordSpan(word, index, extraClass = '') {
    const span = document.createElement('span');
    span.className = `mem-word ${extraClass}`.trim();
    span.textContent = word;
    span.dataset.wordIndex = String(index);
    return span;
  }

  async function renderPage() {
    const ayah = ayahs[ayahIndex];
    if (!ayah || !currentSurah) return;
    const blankMode = stage === 'test' || stage === 'surah-test' || stage === 'link';

    elements.content.innerHTML = '<div class="loading">جاري تحميل صفحة المصحف…</div>';

    let pageData;
    try {
      pageData = await fetchPage(ayah.page);
    } catch {
      elements.content.innerHTML = '<div class="empty-state">تعذّر تحميل صفحة المصحف. تحقق من الاتصال وحاول مجدداً.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    let lastSurahNumber = null;
    wordSpans = [];

    pageData.ayahs.forEach((pageAyah) => {
      if (pageAyah.surah.number !== lastSurahNumber) {
        lastSurahNumber = pageAyah.surah.number;
        const banner = document.createElement('div');
        banner.className = 'mushaf-surah-banner';
        banner.textContent = `سورة ${pageAyah.surah.name}`;
        fragment.appendChild(banner);
        if (pageAyah.surah.number !== 1 && pageAyah.surah.number !== 9 && pageAyah.numberInSurah === 1) {
          const basmala = document.createElement('p');
          basmala.className = 'mushaf-basmala';
          basmala.textContent = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
          fragment.appendChild(basmala);
        }
      }

      const sameSurah = pageAyah.surah.number === currentSurah.number;
      const isTarget = sameSurah && pageAyah.numberInSurah === ayah.numberInSurah;
      const isPast = sameSurah && pageAyah.numberInSurah < ayah.numberInSurah;
      const isFuture = sameSurah && pageAyah.numberInSurah > ayah.numberInSurah;

      if (blankMode && isTarget) {
        HudaVerseDiff.splitWords(pageAyah.text).forEach((word, index) => {
          const span = buildWordSpan(word, index);
          fragment.appendChild(span);
          fragment.appendChild(document.createTextNode(' '));
          wordSpans.push(span);
        });
      } else if (blankMode && isPast) {
        const done = document.createElement('span');
        done.className = 'mem-line-done';
        done.textContent = `✓ سُمِّعت الآية ${arabicNumber(pageAyah.numberInSurah)}`;
        fragment.appendChild(done);
        fragment.appendChild(document.createTextNode(' '));
      } else if (blankMode && isFuture) {
        HudaVerseDiff.splitWords(pageAyah.text).forEach((word) => {
          const blank = document.createElement('span');
          blank.className = 'mem-blank-word';
          blank.style.setProperty('--len', String(Math.min(9, Math.max(2, Array.from(word).length))));
          fragment.appendChild(blank);
          fragment.appendChild(document.createTextNode(' '));
        });
      } else if (isTarget) {
        const wrap = document.createElement('span');
        wrap.className = 'mem-target-wrap';
        HudaVerseDiff.splitWords(pageAyah.text).forEach((word, index) => {
          const span = buildWordSpan(word, index, 'revealed');
          wrap.appendChild(span);
          wrap.appendChild(document.createTextNode(' '));
          wordSpans.push(span);
        });
        fragment.appendChild(wrap);
      } else {
        fragment.appendChild(document.createTextNode(`${pageAyah.text} `));
      }

      const marker = document.createElement('span');
      marker.className = 'mushaf-ayah-marker';
      marker.textContent = arabicNumber(pageAyah.numberInSurah);
      fragment.appendChild(marker);
      fragment.appendChild(document.createTextNode(' '));
    });

    elements.content.replaceChildren(fragment);
    elements.content.classList.toggle('mem-blank-page', blankMode);
    elements.pageLabel.textContent = `صفحة ${arabicNumber(pageData.number)} · الجزء ${arabicNumber(pageData.ayahs[0]?.juz || '')}`;

    paintWords();
  }

  function paintWords() {
    wordSpans.forEach((span) => {
      const index = Number(span.dataset.wordIndex);
      if (stage === 'test' || stage === 'surah-test') {
        span.classList.toggle('mem-word-correct', index < wordIndex);
        span.classList.toggle('revealed', index < wordIndex);
        span.classList.toggle('mem-word-current', index === wordIndex);
        if (index > wordIndex) span.classList.remove('mem-word-wrong');
      } else if (stage === 'together') {
        span.classList.toggle('mem-word-current', index === togetherHighlightIndex);
      } else {
        span.classList.remove('mem-word-current', 'mem-word-wrong');
      }
    });
  }

  function flagCurrentWord() {
    const span = wordSpans.find((item) => Number(item.dataset.wordIndex) === wordIndex);
    if (span) span.classList.add('mem-word-wrong');
  }

  // ===== أزرار كل مرحلة (تُبنى ديناميكياً حسب المرحلة الحالية) =====

  function makeButton(label, cls, onClick, { disabled = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${cls}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderStageControls() {
    testRefs = null;
    elements.stageControls.replaceChildren();
    elements.compareBox.hidden = true;

    if (stage === 'read' || stage === 'reread') {
      const label = stage === 'read' ? 'قرأتها — التالي: الاستماع للشيخ ←' : 'قرأتها ثانيةً — لنبدأ التكرار ←';
      elements.stageControls.appendChild(makeButton(label, 'button-primary', () => setStage(stage === 'read' ? 'listen' : 'repeat')));
      setFeedback(
        stage === 'read'
          ? 'اقرأ الآية بصوت عادٍ من الصفحة أمامك مراعياً أحكام التجويد الظاهرة في الرسم، ثم تابع.'
          : 'أعد قراءة الآية مرة ثانية بتمعّن بعد أن استمعت لتلاوة الشيخ، ثم ابدأ الحفظ.',
        'info'
      );
      return;
    }

    if (stage === 'listen') {
      const row = document.createElement('div');
      row.className = 'mem-controls-row';
      row.appendChild(makeButton('🔁 إعادة الاستماع', 'button-secondary', () => playAyahAudio()));
      row.appendChild(makeButton('التالي: إعادة القراءة ←', 'button-primary', () => setStage('reread')));
      elements.stageControls.appendChild(row);
      setFeedback('استمع جيداً لتلاوة الشيخ لهذه الآية — لاحظ مواضع المدّ والوقف.', 'info');
      return;
    }

    if (stage === 'repeat') {
      const box = document.createElement('div');
      box.className = 'mem-repeat-box';
      const dial = document.createElement('div');
      dial.className = 'mem-repeat-dial';
      dial.textContent = `${arabicNumber(repeatCount)} / ${arabicNumber(repeatTarget)}`;
      const dots = document.createElement('div');
      dots.className = 'mem-repeat-dots';
      for (let i = 0; i < repeatTarget; i += 1) {
        const dot = document.createElement('span');
        dot.className = `mem-repeat-dot${i < repeatCount ? ' filled' : ''}`;
        dots.appendChild(dot);
      }
      box.append(dial, dots);
      elements.stageControls.appendChild(box);

      const row = document.createElement('div');
      row.className = 'mem-controls-row';
      row.appendChild(makeButton('🔁 استمع للشيخ', 'button-secondary', () => playAyahAudio()));
      row.appendChild(
        makeButton('كررتها بصوتي — سمّعتها ✓', 'button-primary', () => {
          repeatCount = Math.min(repeatTarget, repeatCount + 1);
          renderStageControls();
          if (repeatCount >= repeatTarget) {
            setFeedback(`أحسنت — أتممت التكرار ${arabicNumber(repeatTarget)} مرات. الآن اقرأها مع الشيخ.`, 'success');
            window.setTimeout(() => setStage('together'), 900);
          }
        })
      );
      elements.stageControls.appendChild(row);
      if (repeatCount < repeatTarget) {
        setFeedback(`امسك هذه الآية وكرّرها بصوتك ${arabicNumber(repeatTarget)} مرات متتالية، واضغط "سمّعتها" بعد كل مرة.`, 'info');
      }
      return;
    }

    if (stage === 'together') {
      togetherCompleted = togetherCompleted && true;
      const row = document.createElement('div');
      row.className = 'mem-controls-row';
      row.appendChild(makeButton('🔁 إعادة القراءة مع الشيخ', 'button-secondary', () => playAyahAudio(true)));
      const nextButton = makeButton('التالي: التسميع النهائي ←', 'button-primary', () => setStage('test'), {
        disabled: !togetherCompleted,
      });
      nextButton.id = 'mem-together-next';
      row.appendChild(nextButton);
      elements.stageControls.appendChild(row);
      setFeedback('اقرأ الآية بصوتك في نفس وقت قراءة الشيخ تماماً — الكلمة المضيئة تدلّك على موضعه الآن.', 'info');
      return;
    }

    if (stage === 'test' || stage === 'surah-test' || stage === 'link') {
      renderTestControls();
    }
  }

  function renderTestControls() {
    if (stage === 'surah-test') {
      const banner = document.createElement('p');
      banner.className = 'mem-surahtest-banner';
      banner.textContent = `تسميع السورة كاملة — الآية ${arabicNumber(ayahs[ayahIndex].numberInSurah)} من ${arabicNumber(ayahs.length)}`;
      elements.stageControls.appendChild(banner);
    }

    if (stage === 'link') {
      const banner = document.createElement('p');
      banner.className = 'mem-surahtest-banner mem-link-banner';
      const fromAyah = arabicNumber(ayahs[linkStartIndex]?.numberInSurah ?? '');
      const toAyah = arabicNumber(ayahs[linkTargetIndex]?.numberInSurah ?? '');
      banner.textContent = `ربط الحفظ — سمّع من الآية ${fromAyah} إلى الآية ${toAyah} متواصلة بلا توقف بينهما`;
      elements.stageControls.appendChild(banner);
    }

    const micRow = document.createElement('div');
    micRow.className = 'mem-controls-row mem-test-mic-row';
    const micButton = document.createElement('button');
    micButton.type = 'button';
    micButton.className = 'mic-button';
    micButton.disabled = !SpeechRecognitionImpl;
    micButton.innerHTML = '<span class="mic-icon" aria-hidden="true">🎙</span><span>ابدأ التسميع</span>';
    micButton.addEventListener('click', () => (listening ? stopListening() : startListening()));
    micRow.appendChild(micButton);
    elements.stageControls.appendChild(micRow);

    const typedRow = document.createElement('div');
    typedRow.className = 'memorize-typed';
    const typedInput = document.createElement('input');
    typedInput.type = 'text';
    typedInput.placeholder = 'اكتب الكلمة التالية… (بديل عن المايك)';
    typedInput.autocomplete = 'off';
    typedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitButton.click();
      }
    });
    const submitButton = makeButton('تحقّق', 'button-primary', () => {
      const value = typedInput.value.trim();
      if (!value) return;
      submitAttemptText(value);
      typedInput.value = '';
      typedInput.focus();
    });
    const hintButton = makeButton('تلميح (الحرف الأول)', 'button-secondary', showHint);
    typedRow.append(typedInput, submitButton, hintButton);
    elements.stageControls.appendChild(typedRow);

    const row2 = document.createElement('div');
    row2.className = 'mem-controls-row';
    row2.appendChild(makeButton('استمع للنطق الصحيح', 'button-secondary', () => playAyahAudio()));
    const recordButton = document.createElement('button');
    recordButton.type = 'button';
    recordButton.className = 'button button-secondary';
    recordButton.textContent = '🎙 سجّل وقارن';
    recordButton.disabled = !HudaRecorder.SUPPORTED;
    recordButton.addEventListener('click', toggleRecording);
    row2.appendChild(recordButton);
    elements.stageControls.appendChild(row2);

    testRefs = { typedInput, submitButton, hintButton, micButton, recordButton };
    updateTestDisabledState();
    updateMicUI();
    setFeedback(
      stage === 'link'
        ? 'اختبار ربط: سمّع هذه الآيات متصلة ببعضها دون توقف — هذا يثبّت الحفظ ويمنع تشتّته عند الانتقال بين الآيات.'
        : 'الصفحة أمامك فارغة الآن — سمِّع الآية عن ظهر قلب، وستظهر كل كلمة عند نطقها الصحيح. الخطأ لا يعيدك للبداية، بل تسمع تصحيحه وتتابع.',
      'info'
    );
  }

  function updateTestDisabledState() {
    if (!testRefs) return;
    const verseDone = wordIndex >= expectedWords.length;
    testRefs.submitButton.disabled = verseDone;
    testRefs.hintButton.disabled = verseDone;
    testRefs.typedInput.disabled = verseDone;
  }

  // ===== منطق التسميع (نفس محرك المقارنة الدقيق، بلا إعادة الآية من الصفر عند الخطأ) =====

  function showHint() {
    const span = wordSpans[wordIndex];
    if (!span) return;
    hintsUsed += 1;
    const hint = HudaVerseDiff.hintFor(span.textContent);
    span.classList.add('mem-word-hinted');
    setFeedback(`تلميح: الكلمة تبدأ بـ «${hint}»`, 'info');
  }

  function submitAttemptText(text) {
    if (ayahIndex < 0 || wordIndex >= expectedWords.length) return;

    const remaining = wordSpans.slice(wordIndex).map((span) => span.textContent).join(' ');
    const result = HudaVerseDiff.compare(remaining, text);
    if (!result.actualCount) return;

    const advanced = result.matchedPrefix;
    wordIndex += advanced;
    paintWords();
    updateTestDisabledState();

    const blockingError = result.operations[advanced];
    if (blockingError && blockingError.type !== 'match') {
      // نُخزّن الموضع المطلق للكلمة داخل الآية (وليس موضعها داخل الجزء المتبقي فقط).
      attemptErrors.push({ ...blockingError, wordIndex });
      renderErrors();
      flagCurrentWord();
      setFeedback(`${HudaVerseDiff.describeError(blockingError)} — استمع للتصحيح، ثم أكمل من نفس الموضع.`, 'error');
      playWordCorrection(attemptErrors[attemptErrors.length - 1]);
      return;
    }

    if (wordIndex >= expectedWords.length) {
      finishAyahTest();
      return;
    }

    setFeedback(
      advanced ? `أحسنت — ${arabicNumber(advanced)} كلمة صحيحة، تابع…` : 'لم أتبيّن الكلمة، أعد المحاولة أو استخدم التلميح.',
      advanced ? 'success' : 'info'
    );
  }

  async function finishAyahTest() {
    stopListening();
    wordSpans.forEach((span) => span.classList.add('revealed', 'mem-word-correct'));
    setFeedback('أتممت الآية بشكل صحيح ١٠٠٪ ✔', 'success');

    const ayah = ayahs[ayahIndex];
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
    } catch (error) {
      if (error instanceof HudaMemorization.AuthRequiredError) {
        showAuthGate();
        return;
      }
      HudaUtils.showToast('تعذّر حفظ التقدّم في حسابك، حاول مجدداً.', 'error');
    }

    if (stage === 'test') {
      const isLastAyah = ayahIndex >= ayahs.length - 1;
      const wasQuickReview = sessionMode === 'quick-review';
      window.setTimeout(async () => {
        sessionMode = 'sequential';
        if (wasQuickReview) {
          elements.reviewBanner.hidden = true;
          setFeedback('أحسنت — ثبّتنا هذه الآية بالمراجعة السريعة.', 'success');
          return;
        }
        if (isLastAyah) {
          setFeedback('أتممت جميع آيات هذه السورة كلمة كلمة! الآن التسميع النهائي للسورة كاملة متواصلة.', 'success');
          await startSurahFinalTest();
        } else if (ayahIndex >= LINK_PREV_COUNT) {
          // لا ننتقل مباشرة لآية جديدة؛ أولاً نتأكد أن الآية التي أتقنّاها للتو
          // ما زالت متصلة بذاكرة الطالب مع ما قبلها — هذا هو ضمان أنه "حفظها فعلاً"
          // لا أنه فقط طابق كلماتها منعزلة عن سياقها.
          await startLinkTest(ayahIndex);
        } else {
          // أول آية في السورة: لا توجد آية سابقة لنربط بها بعد.
          await enterAyah(ayahIndex + 1, 'read');
        }
      }, 1200);
    } else if (stage === 'link') {
      window.setTimeout(async () => {
        if (ayahIndex < linkTargetIndex) {
          await advanceLink(ayahIndex + 1);
        } else {
          await completeLink();
        }
      }, 600);
    } else {
      window.setTimeout(async () => {
        if (ayahIndex < ayahs.length - 1) {
          await advanceSurahTest(ayahIndex + 1);
        } else {
          await completeSurahFinalTest();
        }
      }, 700);
    }
  }

  // ===== مرحلة الربط: تسميع الآية الجديدة موصولة بالآية (أو الآيات) التي قبلها =====
  // هذا يعالج جوهر مشكلة "التشتت": اختبار كل آية بمعزل عمّا حولها يسمح للطالب
  // بالانتقال للتالية رغم أن حفظه غير متّصل فعلياً. الربط يجبره على استذكار
  // الآيتين معاً بلا توقف قبل اعتبار الآية الجديدة "محفوظة" ومتابعة السورة.

  async function startLinkTest(newAyahIndex) {
    linkTargetIndex = newAyahIndex;
    linkStartIndex = Math.max(0, newAyahIndex - LINK_PREV_COUNT);
    ayahIndex = linkStartIndex;
    stage = 'link';
    prepareTestState();
    discardRecording();
    renderStageSteps();
    updateHeader();
    renderErrors();
    await renderPage();
    renderStageControls();
  }

  async function advanceLink(nextIndex) {
    ayahIndex = nextIndex;
    prepareTestState();
    discardRecording();
    renderStageSteps();
    updateHeader();
    renderErrors();
    await renderPage();
    renderStageControls();
  }

  async function completeLink() {
    const finishedIndex = linkTargetIndex;
    linkStartIndex = -1;
    linkTargetIndex = -1;
    if (finishedIndex < ayahs.length - 1) {
      HudaUtils.showToast('أحسنت — تم ربط الآية بما قبلها بنجاح.', 'success', 1800);
      await enterAyah(finishedIndex + 1, 'read');
    } else {
      setFeedback('أتممت جميع آيات هذه السورة كلمة كلمة وربطاً بينها! الآن التسميع النهائي للسورة كاملة متواصلة.', 'success');
      await startSurahFinalTest();
    }
  }

  async function startSurahFinalTest() {
    stage = 'surah-test';
    ayahIndex = 0;
    prepareTestState();
    discardRecording();
    renderStageSteps();
    updateHeader();
    renderErrors();
    await renderPage();
    renderStageControls();
  }

  async function advanceSurahTest(nextIndex) {
    ayahIndex = nextIndex;
    prepareTestState();
    discardRecording();
    renderStageSteps();
    updateHeader();
    renderErrors();
    await renderPage();
    renderStageControls();
  }

  function prepareTestState() {
    const ayah = ayahs[ayahIndex];
    expectedWords = HudaVerseDiff.splitWords(ayah.text).map(HudaVerseDiff.normalizeWord);
    wordIndex = 0;
    attemptErrors = [];
    hintsUsed = 0;
  }

  async function completeSurahFinalTest() {
    try {
      const response = await HudaMemorization.recordSurahReview(currentSurah.number, true);
      if (response.surah) surahProgress.set(response.surah.surahNumber, response.surah);
    } catch (error) {
      if (!(error instanceof HudaMemorization.AuthRequiredError)) {
        HudaUtils.showToast('تعذّر تسجيل تسميع السورة الكاملة، حاول مجدداً.', 'error');
      }
    }
    renderProgress();
    renderSurahOptions();
    document.dispatchEvent(new CustomEvent('huda-memorization-updated'));

    elements.panel.classList.add('mem-celebrate');
    window.setTimeout(() => elements.panel.classList.remove('mem-celebrate'), 2500);

    renderStageSteps();
    elements.stageControls.replaceChildren();
    const nextSurahNumber = currentSurah.number < 114 ? currentSurah.number + 1 : null;
    const row = document.createElement('div');
    row.className = 'mem-controls-row';
    if (nextSurahNumber) {
      row.appendChild(
        makeButton('ابدأ حفظ السورة التالية ←', 'button-primary', () => {
          elements.surahSelect.value = String(nextSurahNumber);
          loadSurah(nextSurahNumber);
        })
      );
    }
    row.appendChild(makeButton('إعادة تسميع السورة كاملة', 'button-secondary', () => startSurahFinalTest()));
    elements.stageControls.appendChild(row);

    setFeedback(`مبارك! أتممت تسميع سورة ${currentSurah.name} كاملة دفعة واحدة بلا توقف. حسبك، بارك الله فيك 🎉`, 'success');
    speak(`بارك الله فيك، حسبك، أتممت تسميع سورة ${currentSurah.name} كاملة`);
  }

  // ===== المايك =====

  function ensureRecognition() {
    if (recognition || !SpeechRecognitionImpl) return recognition;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
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
        try { recognition.start(); } catch { /* يعمل بالفعل */ }
      }, 250);
    };

    return recognition;
  }

  function updateMicUI() {
    if (!testRefs?.micButton) return;
    testRefs.micButton.classList.toggle('mic-active', listening);
    testRefs.micButton.setAttribute('aria-pressed', String(listening));
    const label = testRefs.micButton.querySelector('span:last-child');
    if (label) label.textContent = listening ? 'إيقاف التسميع' : 'ابدأ التسميع';
  }

  function startListening() {
    if (!SpeechRecognitionImpl) return;
    if (ayahIndex === -1) return;
    const engine = ensureRecognition();
    if (!engine) return;
    listening = true;
    updateMicUI();
    setFeedback('🎙 أستمع إليك الآن…', 'info');
    try { engine.start(); } catch { /* تعمل بالفعل */ }
  }

  function stopListening() {
    listening = false;
    clearTimeout(restartTimer);
    updateMicUI();
    if (recognition) {
      try { recognition.stop(); } catch { /* غير مُشغّلة */ }
    }
  }

  // ===== سجّل وقارن (اختياري، مساعد للتحقق الأذني من الأحكام) =====

  function discardRecording() {
    recorder?.discard();
    recorder = null;
    elements.userAudio.removeAttribute('src');
    elements.compareBox.hidden = true;
    if (testRefs?.recordButton) {
      testRefs.recordButton.classList.remove('mic-active');
      testRefs.recordButton.textContent = '🎙 سجّل وقارن';
    }
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
      if (testRefs?.recordButton) {
        testRefs.recordButton.classList.remove('mic-active');
        testRefs.recordButton.textContent = '🎙 سجّل مرة أخرى';
      }
      setFeedback('قارن تسجيلك بتلاوة الشيخ — يُحذف تلقائياً بعد المقارنة أو مغادرة الشاشة.', 'info');
      return;
    }
    try {
      recorder = HudaRecorder.create();
      await recorder.start();
      if (testRefs?.recordButton) {
        testRefs.recordButton.classList.add('mic-active');
        testRefs.recordButton.textContent = '■ إيقاف التسجيل';
      }
    } catch {
      HudaUtils.showToast('تعذّر الوصول إلى المايك للتسجيل.', 'error');
    }
  }

  elements.playUser.addEventListener('click', () => {
    elements.audio.pause();
    elements.userAudio.play().catch(() => HudaUtils.showToast('تعذّر تشغيل تسجيلك.', 'error'));
  });

  elements.playSheikh.addEventListener('click', () => {
    elements.userAudio.pause();
    playAyahAudio();
  });

  elements.discardBtn.addEventListener('click', () => {
    discardRecording();
    HudaUtils.showToast('تم حذف التسجيل من جهازك.', 'success', 2000);
  });

  window.addEventListener('pagehide', discardRecording);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) discardRecording();
  });

  // ===== الانتقال بين المراحل والآيات =====

  async function setStage(name) {
    stage = name;
    stopListening();
    elements.audio.pause();
    elements.audio.ontimeupdate = null;
    if (name === 'repeat') repeatCount = 0;
    if (name === 'together') {
      togetherHighlightIndex = -1;
      togetherCompleted = false;
    }
    renderStageSteps();
    updateHeader();
    renderErrors();
    await renderPage();
    renderStageControls();

    if (name === 'listen') window.setTimeout(() => playAyahAudio(), 350);
    if (name === 'together') window.setTimeout(() => playAyahAudio(true), 350);
  }

  async function enterAyah(index, initialStage = 'read') {
    ayahIndex = index;
    const ayah = ayahs[ayahIndex];
    if (!ayah) return;
    expectedWords = HudaVerseDiff.splitWords(ayah.text).map(HudaVerseDiff.normalizeWord);
    wordIndex = 0;
    attemptErrors = [];
    hintsUsed = 0;
    repeatCount = 0;
    discardRecording();
    await setStage(initialStage);
  }

  // ===== تحميل البيانات =====

  async function loadSurahList() {
    try {
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب قائمة السور');
      const data = await response.json();
      surahs = Array.isArray(data.data) ? data.data : [];
      renderSurahOptions();
    } catch {
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

  async function loadSurah(surahNumber, { skipAutoStart = false } = {}) {
    if (!surahNumber) return;
    sessionMode = 'sequential';
    linkStartIndex = -1;
    linkTargetIndex = -1;
    try {
      elements.surahTitle.textContent = 'جاري تحميل السورة…';
      const response = await HudaUtils.fetchWithRetry(`${QURAN_API}/surah/${surahNumber}/quran-uthmani`, { timeout: CONFIG.API.TIMEOUT }, 2);
      if (!response.ok) throw new Error('تعذّر جلب السورة');
      const data = await response.json();
      currentSurah = data.data;
      ayahs = currentSurah.ayahs || [];
      ayahIndex = ayahs.length ? 0 : -1;
      renderProgress();
      if (!skipAutoStart && ayahIndex >= 0) await enterAyah(0, 'read');
    } catch {
      elements.surahTitle.textContent = 'تعذّر تحميل السورة';
      HudaUtils.showToast('تعذّر تحميل آيات هذه السورة حالياً.', 'error');
    }
  }

  // ===== المراجعة السريعة: تنتقل مباشرة لمرحلة التسميع (الآية مفترض أنها مُتقنة أصلاً) =====

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
        await loadSurah(item.surahNumber, { skipAutoStart: true });
      }
      const index = ayahs.findIndex((a) => a.numberInSurah === item.ayahNumber);
      if (index >= 0) {
        sessionMode = 'quick-review';
        await enterAyah(index, 'test');
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

  elements.repeatIntensity.addEventListener('change', () => {
    repeatTarget = Number(elements.repeatIntensity.value) || 7;
    HudaUtils.storage.set(REPEAT_KEY, repeatTarget);
    if (stage === 'repeat') renderStageControls();
  });

  elements.quickReview.addEventListener('click', startQuickReview);

  async function init() {
    if (loaded) return;

    if (!SpeechRecognitionImpl) elements.warning.hidden = false;

    const user = await Huda.getSession();
    if (!user) {
      showAuthGate();
      return;
    }

    loaded = true;
    hideAuthGate();
    elements.repeatIntensity.value = String(repeatTarget);

    await Promise.all([loadSurahList(), loadProgress()]);
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
