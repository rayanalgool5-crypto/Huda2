// مسارات صفحة "الإحصائيات والتقدم" — مرتبطة بحساب المستخدم.

const express = require('express');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const stats = require('../lib/stats');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const userId = req.session.userId;
    const summary = stats.getStats(userId);

    const completedSurahs = db
      .prepare(
        `SELECT surah_number, surah_name, accuracy, memorized_ayahs, total_ayahs, completed_at
         FROM surah_progress WHERE user_id = ? AND completed = 1
         ORDER BY completed_at DESC`
      )
      .all(userId);

    const inProgressSurahs = db
      .prepare(
        `SELECT surah_number, surah_name, accuracy, memorized_ayahs, total_ayahs
         FROM surah_progress WHERE user_id = ? AND completed = 0 AND memorized_ayahs > 0
         ORDER BY memorized_ayahs DESC`
      )
      .all(userId);

    const last30Days = db
      .prepare(
        `SELECT day, ayahs_reviewed, ayahs_mastered, errors FROM daily_activity
         WHERE user_id = ? ORDER BY day DESC LIMIT 30`
      )
      .all(userId);

    const errorBreakdown = db
      .prepare(
        `SELECT error_type, COUNT(*) AS count FROM error_events WHERE user_id = ? GROUP BY error_type`
      )
      .all(userId);

    const weakestAyahs = db
      .prepare(
        `SELECT surah_number, ayah_number, accuracy, attempts, error_count
         FROM ayah_progress WHERE user_id = ? AND attempts > 0
         ORDER BY accuracy ASC, error_count DESC LIMIT 10`
      )
      .all(userId);

    res.json({
      summary,
      completedSurahs: completedSurahs.map((row) => ({
        surahNumber: row.surah_number,
        surahName: row.surah_name,
        accuracy: row.accuracy,
        memorizedAyahs: row.memorized_ayahs,
        totalAyahs: row.total_ayahs,
        completedAt: row.completed_at,
      })),
      inProgressSurahs: inProgressSurahs.map((row) => ({
        surahNumber: row.surah_number,
        surahName: row.surah_name,
        accuracy: row.accuracy,
        memorizedAyahs: row.memorized_ayahs,
        totalAyahs: row.total_ayahs,
      })),
      activity: last30Days.map((row) => ({
        day: row.day,
        reviewed: row.ayahs_reviewed,
        mastered: row.ayahs_mastered,
        errors: row.errors,
      })),
      errorBreakdown: errorBreakdown.reduce(
        (acc, row) => ({ ...acc, [row.error_type]: row.count }),
        { missing: 0, extra: 0, substituted: 0 }
      ),
      weakestAyahs: weakestAyahs.map((row) => ({
        surahNumber: row.surah_number,
        ayahNumber: row.ayah_number,
        accuracy: row.accuracy,
        attempts: row.attempts,
        errorCount: row.error_count,
      })),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'تعذّر جلب الإحصائيات.' });
  }
});

module.exports = router;
