// مسارات الحفظ والمراجعة — كلها محمية بتسجيل الدخول ومرتبطة بحساب المستخدم.

const express = require('express');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const sr = require('../lib/spaced-repetition');
const stats = require('../lib/stats');

const router = express.Router();
router.use(requireAuth);

const ERROR_TYPES = new Set(['missing', 'extra', 'substituted']);
const MAX_ERRORS_PER_ATTEMPT = 200;

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function mapSurah(row) {
  return {
    surahNumber: row.surah_number,
    surahName: row.surah_name,
    totalAyahs: row.total_ayahs,
    memorizedAyahs: row.memorized_ayahs,
    accuracy: row.accuracy,
    completed: Boolean(row.completed),
    completedAt: row.completed_at,
    reviewStage: row.review_stage,
    lastReviewAt: row.last_review_at,
    nextReviewAt: row.next_review_at,
    due: Boolean(row.memorized_ayahs) && sr.isDue(row.next_review_at),
  };
}

function mapAyah(row) {
  return {
    surahNumber: row.surah_number,
    ayahNumber: row.ayah_number,
    attempts: row.attempts,
    perfectAttempts: row.perfect_attempts,
    errorCount: row.error_count,
    hintsUsed: row.hints_used,
    accuracy: row.accuracy,
    mastered: Boolean(row.mastered),
    reviewStage: row.review_stage,
    lastReviewAt: row.last_review_at,
    nextReviewAt: row.next_review_at,
  };
}

function getSurahRow(userId, surahNumber) {
  return db
    .prepare('SELECT * FROM surah_progress WHERE user_id = ? AND surah_number = ?')
    .get(userId, surahNumber);
}

// إعادة حساب ملخّص السورة من آياتها؛ تُرجع الصف بعد التحديث.
function recomputeSurah(userId, surahNumber, { surahName, totalAyahs } = {}) {
  const existing = getSurahRow(userId, surahNumber);
  const total = Number(totalAyahs) || existing?.total_ayahs || 0;
  const name = surahName || existing?.surah_name || null;

  const aggregate = db
    .prepare(
      `SELECT COUNT(*) AS tracked,
              SUM(mastered) AS mastered,
              SUM(accuracy) AS accuracy_sum
       FROM ayah_progress WHERE user_id = ? AND surah_number = ?`
    )
    .get(userId, surahNumber);

  const memorized = aggregate.mastered || 0;
  const accuracy = total ? clampPercent((aggregate.accuracy_sum || 0) / total) : 0;
  const completed = total > 0 && memorized >= total ? 1 : 0;
  const wasCompleted = existing?.completed === 1;
  const completedAt = completed ? existing?.completed_at || new Date().toISOString() : null;

  db.prepare(
    `INSERT INTO surah_progress
       (user_id, surah_number, surah_name, total_ayahs, memorized_ayahs, accuracy, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, surah_number) DO UPDATE SET
       surah_name = COALESCE(excluded.surah_name, surah_name),
       total_ayahs = excluded.total_ayahs,
       memorized_ayahs = excluded.memorized_ayahs,
       accuracy = excluded.accuracy,
       completed = excluded.completed,
       completed_at = excluded.completed_at,
       updated_at = datetime('now')`
  ).run(userId, surahNumber, name, total, memorized, accuracy, completed, completedAt);

  return { row: getSurahRow(userId, surahNumber), justCompleted: completed === 1 && !wasCompleted };
}

// ---------- قائمة السور مع حالة الحفظ ("✓ محفوظة") ----------
router.get('/surahs', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM surah_progress WHERE user_id = ? ORDER BY surah_number')
    .all(req.session.userId);
  res.json({ surahs: rows.map(mapSurah) });
});

// ---------- تفاصيل سورة واحدة مع آياتها ----------
router.get('/surahs/:number', (req, res) => {
  const surahNumber = Number(req.params.number);
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
    return res.status(400).json({ message: 'رقم السورة يجب أن يكون بين ١ و١١٤.' });
  }

  const row = getSurahRow(req.session.userId, surahNumber);
  const ayahs = db
    .prepare('SELECT * FROM ayah_progress WHERE user_id = ? AND surah_number = ? ORDER BY ayah_number')
    .all(req.session.userId, surahNumber);

  res.json({
    surah: row ? mapSurah(row) : null,
    ayahs: ayahs.map(mapAyah),
  });
});

// ---------- تسجيل محاولة على آية ----------
// المحاولة الناجحة فقط تُعلّم الآية كمُتقنة وتجدول مراجعتها القادمة.
router.post('/attempts', (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      surahNumber,
      surahName,
      totalAyahs,
      ayahNumber,
      success = false,
      accuracy,
      hintsUsed = 0,
      errors = [],
    } = req.body || {};

    if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
      return res.status(400).json({ message: 'رقم السورة يجب أن يكون بين ١ و١١٤.' });
    }
    if (!Number.isInteger(ayahNumber) || ayahNumber < 1) {
      return res.status(400).json({ message: 'رقم الآية غير صحيح.' });
    }
    if (!Array.isArray(errors) || errors.length > MAX_ERRORS_PER_ATTEMPT) {
      return res.status(400).json({ message: 'قائمة الأخطاء غير صالحة.' });
    }

    const attemptAccuracy = clampPercent(accuracy ?? (success ? 100 : 0));
    const hints = Math.max(0, Math.min(50, Number(hintsUsed) || 0));
    const isSuccess = Boolean(success);

    const existing = db
      .prepare('SELECT * FROM ayah_progress WHERE user_id = ? AND surah_number = ? AND ayah_number = ?')
      .get(userId, surahNumber, ayahNumber);

    const attempts = (existing?.attempts || 0) + 1;
    const perfectAttempts = (existing?.perfect_attempts || 0) + (isSuccess ? 1 : 0);
    const errorCount = (existing?.error_count || 0) + errors.length;
    // متوسط متحرك: يعكس الإتقان عبر كل المحاولات لا آخر محاولة فقط.
    const rollingAccuracy = clampPercent(
      ((existing?.accuracy || 0) * (attempts - 1) + attemptAccuracy) / attempts
    );

    const schedule = isSuccess
      ? sr.schedule(existing?.review_stage || 0, true)
      : { stage: 0, lastReviewAt: new Date().toISOString(), nextReviewAt: new Date().toISOString() };

    const firstMasteredAt = isSuccess
      ? existing?.first_mastered_at || new Date().toISOString()
      : existing?.first_mastered_at || null;

    const persist = db.transaction(() => {
      db.prepare(
        `INSERT INTO ayah_progress
           (user_id, surah_number, ayah_number, attempts, perfect_attempts, error_count, hints_used,
            accuracy, mastered, review_stage, last_review_at, next_review_at, first_mastered_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, surah_number, ayah_number) DO UPDATE SET
           attempts = excluded.attempts,
           perfect_attempts = excluded.perfect_attempts,
           error_count = excluded.error_count,
           hints_used = ayah_progress.hints_used + ?,
           accuracy = excluded.accuracy,
           mastered = MAX(ayah_progress.mastered, excluded.mastered),
           review_stage = excluded.review_stage,
           last_review_at = excluded.last_review_at,
           next_review_at = excluded.next_review_at,
           first_mastered_at = COALESCE(ayah_progress.first_mastered_at, excluded.first_mastered_at),
           updated_at = datetime('now')`
      ).run(
        userId,
        surahNumber,
        ayahNumber,
        attempts,
        perfectAttempts,
        errorCount,
        hints,
        rollingAccuracy,
        isSuccess ? 1 : 0,
        schedule.stage,
        schedule.lastReviewAt,
        schedule.nextReviewAt,
        firstMasteredAt,
        hints
      );

      const insertError = db.prepare(
        `INSERT INTO error_events (user_id, surah_number, ayah_number, word_index, error_type, expected_word, actual_word)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      errors
        .filter((error) => error && ERROR_TYPES.has(error.type))
        .forEach((error) => {
          insertError.run(
            userId,
            surahNumber,
            ayahNumber,
            Number.isInteger(error.wordIndex) ? error.wordIndex : -1,
            error.type,
            typeof error.expected === 'string' ? error.expected.slice(0, 80) : null,
            typeof error.actual === 'string' ? error.actual.slice(0, 80) : null
          );
        });
    });

    persist();

    const { row: surahRow, justCompleted } = recomputeSurah(userId, surahNumber, { surahName, totalAyahs });
    stats.recordActivity(userId, {
      reviewed: 1,
      mastered: isSuccess && !existing?.mastered ? 1 : 0,
      errors: errors.length,
    });
    stats.refreshTotals(userId);

    const ayahRow = db
      .prepare('SELECT * FROM ayah_progress WHERE user_id = ? AND surah_number = ? AND ayah_number = ?')
      .get(userId, surahNumber, ayahNumber);

    res.json({
      success: true,
      ayah: mapAyah(ayahRow),
      surah: surahRow ? mapSurah(surahRow) : null,
      surahJustCompleted: justCompleted,
      stats: stats.getStats(userId),
    });
  } catch (error) {
    console.error('Attempt error:', error);
    res.status(500).json({ message: 'تعذّر حفظ نتيجة المحاولة.' });
  }
});

// ---------- تسجيل مراجعة سورة كاملة (جدولة متباعدة على مستوى السورة) ----------
router.post('/surahs/:number/review', (req, res) => {
  try {
    const surahNumber = Number(req.params.number);
    if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
      return res.status(400).json({ message: 'رقم السورة يجب أن يكون بين ١ و١١٤.' });
    }

    const row = getSurahRow(req.session.userId, surahNumber);
    if (!row) {
      return res.status(404).json({ message: 'لا يوجد تقدّم محفوظ لهذه السورة.' });
    }

    const success = req.body?.success !== false;
    const schedule = sr.schedule(row.review_stage, success);

    db.prepare(
      `UPDATE surah_progress SET review_stage = ?, last_review_at = ?, next_review_at = ?, updated_at = datetime('now')
       WHERE user_id = ? AND surah_number = ?`
    ).run(schedule.stage, schedule.lastReviewAt, schedule.nextReviewAt, req.session.userId, surahNumber);

    stats.recordActivity(req.session.userId, { reviewed: 1 });

    res.json({ success: true, surah: mapSurah(getSurahRow(req.session.userId, surahNumber)) });
  } catch (error) {
    console.error('Surah review error:', error);
    res.status(500).json({ message: 'تعذّر تسجيل المراجعة.' });
  }
});

// ---------- ما استحقّ المراجعة الآن (أساس التنبيهات) ----------
router.get('/due', (req, res) => {
  const nowIso = new Date().toISOString();

  const surahs = db
    .prepare(
      `SELECT * FROM surah_progress
       WHERE user_id = ? AND memorized_ayahs > 0
         AND (next_review_at IS NULL OR next_review_at <= ?)
       ORDER BY next_review_at IS NULL DESC, next_review_at ASC`
    )
    .all(req.session.userId, nowIso);

  const ayahs = db
    .prepare(
      `SELECT * FROM ayah_progress
       WHERE user_id = ? AND mastered = 1
         AND (next_review_at IS NULL OR next_review_at <= ?)
       ORDER BY next_review_at IS NULL DESC, next_review_at ASC
       LIMIT 100`
    )
    .all(req.session.userId, nowIso);

  res.json({ surahs: surahs.map(mapSurah), ayahs: ayahs.map(mapAyah) });
});

// ---------- مراجعة سريعة: أقدم الآيات المتقنة عهداً ----------
router.get('/quick-review', (req, res) => {
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 10));
  const surahFilter = Number(req.query.surah);

  const rows = Number.isInteger(surahFilter) && surahFilter >= 1 && surahFilter <= 114
    ? db
        .prepare(
          `SELECT * FROM ayah_progress WHERE user_id = ? AND mastered = 1 AND surah_number = ?
           ORDER BY next_review_at IS NULL DESC, next_review_at ASC LIMIT ?`
        )
        .all(req.session.userId, surahFilter, limit)
    : db
        .prepare(
          `SELECT * FROM ayah_progress WHERE user_id = ? AND mastered = 1
           ORDER BY next_review_at IS NULL DESC, next_review_at ASC LIMIT ?`
        )
        .all(req.session.userId, limit);

  const names = new Map(
    db
      .prepare('SELECT surah_number, surah_name FROM surah_progress WHERE user_id = ?')
      .all(req.session.userId)
      .map((row) => [row.surah_number, row.surah_name])
  );

  res.json({
    items: rows.map((row) => ({ ...mapAyah(row), surahName: names.get(row.surah_number) || null })),
  });
});

module.exports = router;
