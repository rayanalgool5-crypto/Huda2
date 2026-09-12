// منطق التكرار المتباعد (Spaced Repetition).
// الجدول: يوم → ٣ أيام → أسبوع → أسبوعان → شهر → شهران.
// كل مراجعة ناجحة ترفع المرحلة درجة، وكل خطأ يُرجعها للبداية لتثبيت الحفظ.

const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];

function clampStage(stage) {
  if (!Number.isFinite(stage) || stage < 0) return 0;
  return Math.min(Math.round(stage), INTERVALS_DAYS.length - 1);
}

function intervalForStage(stage) {
  return INTERVALS_DAYS[clampStage(stage)];
}

function nextStage(currentStage, success) {
  if (!success) return 0;
  return clampStage((Number(currentStage) || 0) + 1);
}

function addDays(isoDate, days) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

// تُرجع مرحلة المراجعة القادمة وتاريخها بعد محاولة مراجعة.
function schedule(currentStage, success, now = new Date()) {
  const stage = nextStage(currentStage, success);
  const nowIso = now.toISOString();
  return {
    stage,
    lastReviewAt: nowIso,
    nextReviewAt: addDays(nowIso, intervalForStage(stage)),
  };
}

function isDue(nextReviewAt, now = new Date()) {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() <= now.getTime();
}

module.exports = { INTERVALS_DAYS, intervalForStage, nextStage, schedule, isDue };
