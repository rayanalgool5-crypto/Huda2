// تجميع الإحصائيات وعدّاد الأيام المتتالية (Streak) لكل مستخدم.

const db = require('../db');

const today = (now = new Date()) => now.toISOString().slice(0, 10);

function dayDifference(fromDay, toDay) {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

function ensureStatsRow(userId) {
  db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
}

// تسجيل نشاط اليوم وتحديث السلسلة اليومية.
function recordActivity(userId, { reviewed = 0, mastered = 0, errors = 0 } = {}, now = new Date()) {
  const day = today(now);

  db.prepare(
    `INSERT INTO daily_activity (user_id, day, ayahs_reviewed, ayahs_mastered, errors, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, day) DO UPDATE SET
       ayahs_reviewed = ayahs_reviewed + excluded.ayahs_reviewed,
       ayahs_mastered = ayahs_mastered + excluded.ayahs_mastered,
       errors = errors + excluded.errors,
       updated_at = datetime('now')`
  ).run(userId, day, reviewed, mastered, errors);

  const stats = ensureStatsRow(userId);
  const gap = stats.last_activity_day ? dayDifference(stats.last_activity_day, day) : null;

  let currentStreak = stats.current_streak;
  if (gap === 0) {
    currentStreak = Math.max(1, currentStreak);
  } else if (gap === 1) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  db.prepare(
    `UPDATE user_stats SET
       current_streak = ?,
       longest_streak = MAX(longest_streak, ?),
       last_activity_day = ?,
       total_reviews = total_reviews + ?,
       updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(currentStreak, currentStreak, day, reviewed, userId);

  return currentStreak;
}

// إعادة احتساب الإجماليات من جداول التقدم (مصدر الحقيقة الوحيد).
function refreshTotals(userId) {
  const totals = db
    .prepare('SELECT COUNT(*) AS memorized FROM ayah_progress WHERE user_id = ? AND mastered = 1')
    .get(userId);
  const surahs = db
    .prepare('SELECT COUNT(*) AS completed FROM surah_progress WHERE user_id = ? AND completed = 1')
    .get(userId);

  ensureStatsRow(userId);
  db.prepare(
    `UPDATE user_stats SET
       total_ayahs_memorized = ?,
       total_surahs_completed = ?,
       updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(totals.memorized, surahs.completed, userId);
}

// السلسلة الحالية تنكسر إذا لم يُسجَّل نشاط اليوم أو أمس.
function effectiveStreak(stats, now = new Date()) {
  if (!stats.last_activity_day) return 0;
  const gap = dayDifference(stats.last_activity_day, today(now));
  return gap !== null && gap <= 1 ? stats.current_streak : 0;
}

function getStats(userId, now = new Date()) {
  refreshTotals(userId);
  const stats = ensureStatsRow(userId);
  return {
    currentStreak: effectiveStreak(stats, now),
    longestStreak: stats.longest_streak,
    lastActivityDay: stats.last_activity_day,
    totalAyahsMemorized: stats.total_ayahs_memorized,
    totalSurahsCompleted: stats.total_surahs_completed,
    totalReviews: stats.total_reviews,
  };
}

module.exports = { today, recordActivity, refreshTotals, getStats, ensureStatsRow };
