/**
 * صفحة "الإحصائيات والتقدم": تعرض بيانات حساب المستخدم فقط (لا تخزين محلي).
 */

(() => {
  const elements = {
    gate: document.getElementById('stats-auth-gate'),
    content: document.getElementById('stats-content'),
    streak: document.getElementById('stat-streak'),
    longestStreak: document.getElementById('stat-longest-streak'),
    ayahs: document.getElementById('stat-ayahs'),
    reviews: document.getElementById('stat-reviews'),
    surahs: document.getElementById('stat-surahs'),
    inProgressCount: document.getElementById('stat-inprogress'),
    accuracy: document.getElementById('stat-accuracy'),
    errors: document.getElementById('stat-errors'),
    encouragement: document.getElementById('stats-encouragement'),
    completed: document.getElementById('completed-surahs'),
    inProgress: document.getElementById('inprogress-surahs'),
    errorMissing: document.getElementById('error-missing'),
    errorExtra: document.getElementById('error-extra'),
    errorSubstituted: document.getElementById('error-substituted'),
    weakest: document.getElementById('weakest-ayahs'),
    chart: document.getElementById('activity-chart'),
  };

  if (!elements.content) return;

  const arabicNumber = (number) => new Intl.NumberFormat('ar-EG').format(Number(number) || 0);

  function encouragementFor(summary, completedCount) {
    if (completedCount > 0 && summary.currentStreak >= 7) {
      return `ما شاء الله! ${arabicNumber(completedCount)} سورة كاملة وسلسلة ${arabicNumber(summary.currentStreak)} يوم — ثبّتك الله.`;
    }
    if (completedCount > 0) {
      return `مبارك إتمامك ${arabicNumber(completedCount)} سورة 🎉 واصل، فالقرآن يرفع صاحبه.`;
    }
    if (summary.totalAyahsMemorized > 0) {
      return `أتقنت ${arabicNumber(summary.totalAyahsMemorized)} آية — أكمل سورتك الأولى وستجد التبريك هنا.`;
    }
    return 'ابدأ اليوم بآية واحدة، وستُبنى سلسلتك يوماً بعد يوم بإذن الله.';
  }

  function surahItem(surah, { completed }) {
    const item = document.createElement('li');
    item.className = `surah-progress-item${completed ? ' completed' : ''}`;

    const title = document.createElement('span');
    title.className = 'surah-progress-name';
    title.textContent = `${surah.surahName || `سورة ${arabicNumber(surah.surahNumber)}`}${completed ? ' ✓ محفوظة' : ''}`;

    const meta = document.createElement('span');
    meta.className = 'surah-progress-meta';
    meta.textContent = `${arabicNumber(surah.memorizedAyahs)}/${arabicNumber(surah.totalAyahs)} آية — ${arabicNumber(surah.accuracy)}٪ صح`;

    const bar = document.createElement('div');
    bar.className = 'surah-progress-bar';
    const fill = document.createElement('span');
    const percent = surah.totalAyahs ? Math.round((surah.memorizedAyahs / surah.totalAyahs) * 100) : 0;
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);

    item.append(title, meta, bar);
    return item;
  }

  function renderList(container, items, renderItem, emptyMessage) {
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }
    items.forEach((item) => container.appendChild(renderItem(item)));
  }

  function renderChart(activity) {
    elements.chart.replaceChildren();
    const days = [...activity].reverse();
    if (!days.length) {
      elements.chart.textContent = 'لا يوجد نشاط مسجّل بعد.';
      return;
    }
    const max = Math.max(...days.map((day) => day.reviewed), 1);
    days.forEach((day) => {
      const bar = document.createElement('div');
      bar.className = 'activity-bar';
      bar.style.setProperty('--height', `${Math.round((day.reviewed / max) * 100)}%`);
      bar.title = `${day.day}: ${arabicNumber(day.reviewed)} مراجعة، ${arabicNumber(day.mastered)} إتقان`;
      elements.chart.appendChild(bar);
    });
  }

  function averageAccuracy(surahs) {
    if (!surahs.length) return 0;
    return Math.round(surahs.reduce((sum, surah) => sum + surah.accuracy, 0) / surahs.length);
  }

  async function render() {
    const user = await Huda.getSession();
    if (!user) {
      elements.gate.hidden = false;
      elements.content.hidden = true;
      return;
    }

    elements.gate.hidden = true;
    elements.content.hidden = false;

    let data;
    try {
      data = await HudaMemorization.getStats();
    } catch (error) {
      if (error instanceof HudaMemorization.AuthRequiredError) {
        elements.gate.hidden = false;
        elements.content.hidden = true;
        return;
      }
      HudaUtils.showToast('تعذّر جلب الإحصائيات، حاول لاحقاً.', 'error');
      return;
    }

    const { summary, completedSurahs, inProgressSurahs, errorBreakdown, weakestAyahs, activity } = data;
    const totalErrors = errorBreakdown.missing + errorBreakdown.extra + errorBreakdown.substituted;

    elements.streak.textContent = arabicNumber(summary.currentStreak);
    elements.longestStreak.textContent = `أطول سلسلة: ${arabicNumber(summary.longestStreak)}`;
    elements.ayahs.textContent = arabicNumber(summary.totalAyahsMemorized);
    elements.reviews.textContent = `عدد المراجعات: ${arabicNumber(summary.totalReviews)}`;
    elements.surahs.textContent = arabicNumber(summary.totalSurahsCompleted);
    elements.inProgressCount.textContent = `قيد الحفظ: ${arabicNumber(inProgressSurahs.length)}`;
    elements.accuracy.textContent = `${arabicNumber(averageAccuracy([...completedSurahs, ...inProgressSurahs]))}٪`;
    elements.errors.textContent = `الأخطاء: ${arabicNumber(totalErrors)}`;
    elements.encouragement.textContent = encouragementFor(summary, completedSurahs.length);

    renderList(elements.completed, completedSurahs, (surah) => surahItem(surah, { completed: true }), 'لم تُتم أي سورة بعد — بدايتك القريبة إن شاء الله.');
    renderList(elements.inProgress, inProgressSurahs, (surah) => surahItem(surah, { completed: false }), 'ابدأ الحفظ من تبويب «الحفظ» في صفحة القرآن.');

    elements.errorMissing.textContent = arabicNumber(errorBreakdown.missing);
    elements.errorExtra.textContent = arabicNumber(errorBreakdown.extra);
    elements.errorSubstituted.textContent = arabicNumber(errorBreakdown.substituted);

    renderList(
      elements.weakest,
      weakestAyahs,
      (ayah) => {
        const item = document.createElement('li');
        item.className = 'surah-progress-item';
        item.textContent = `سورة ${arabicNumber(ayah.surahNumber)} — آية ${arabicNumber(ayah.ayahNumber)}: ${arabicNumber(ayah.accuracy)}٪ صح (${arabicNumber(ayah.errorCount)} خطأ)`;
        return item;
      },
      'لا توجد بيانات كافية بعد.'
    );

    renderChart(activity);
  }

  document.addEventListener('DOMContentLoaded', render);
  document.addEventListener('huda-auth-ready', (event) => {
    // The first render may happen before the global session check completes.
    // Re-render with the authoritative session result.
    if (event.detail?.user) render();
    else {
      elements.gate.hidden = false;
      elements.content.hidden = true;
    }
  });
})();
