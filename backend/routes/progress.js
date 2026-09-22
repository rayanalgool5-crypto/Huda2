const express = require('express');
const db = require('../db');

const router = express.Router();

// Middleware: Require authentication
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  }
  next();
}

// Helper: Get today's date in YYYY-MM-DD format
const today = () => new Date().toISOString().slice(0, 10);

// ===== TASBEEH PROGRESS =====

// GET /progress/tasbeeh - جلب تقدم التسبيح لليوم الحالي
router.get('/tasbeeh', requireAuth, (req, res) => {
  try {
    const row = db
      .prepare('SELECT day, count, total, azkar_json, sound, vibration FROM tasbeeh_progress WHERE user_id = ? AND day = ?')
      .get(req.session.userId, today());

    if (!row) {
      return res.json({
        day: today(),
        count: 0,
        total: 0,
        azkar: {},
        sound: false,
        vibration: false
      });
    }

    return res.json({
      day: row.day,
      count: row.count,
      total: row.total,
      azkar: JSON.parse(row.azkar_json || '{}'),
      sound: Boolean(row.sound),
      vibration: Boolean(row.vibration),
    });
  } catch (error) {
    console.error('Tasbeeh GET error:', error);
    return res.status(500).json({ message: 'خطأ في جلب بيانات التسبيح' });
  }
});

// PUT /progress/tasbeeh - حفظ/تحديث تقدم التسبيح لليوم الحالي
router.put('/tasbeeh', requireAuth, (req, res) => {
  try {
    const { count = 0, total = 0, azkar = {}, sound = false, vibration = false } = req.body || {};

    // Validation
    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({ message: 'العدد يجب أن يكون قيمة موجبة' });
    }
    if (typeof total !== 'number' || total < 0) {
      return res.status(400).json({ message: 'الإجمالي يجب أن يكون قيمة موجبة' });
    }

    const day = today();

    db.prepare(
      `INSERT INTO tasbeeh_progress 
       (user_id, day, count, total, azkar_json, sound, vibration, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, day) DO UPDATE SET
         count = excluded.count,
         total = excluded.total,
         azkar_json = excluded.azkar_json,
         sound = excluded.sound,
         vibration = excluded.vibration,
         updated_at = datetime('now')`
    ).run(
      req.session.userId,
      day,
      count,
      total,
      JSON.stringify(azkar),
      sound ? 1 : 0,
      vibration ? 1 : 0
    );

    return res.json({ success: true, message: 'تم حفظ التقدم' });
  } catch (error) {
    console.error('Tasbeeh PUT error:', error);
    return res.status(500).json({ message: 'تعذر حفظ التقدم' });
  }
});

// ===== READING PROGRESS =====

// GET /progress/reading - جلب آخر موضع قراءة
router.get('/reading', requireAuth, (req, res) => {
  try {
    const row = db
      .prepare('SELECT last_surah, last_verse FROM reading_progress WHERE user_id = ?')
      .get(req.session.userId);

    return res.json({
      lastSurah: row?.last_surah ?? null,
      lastVerse: row?.last_verse ?? null
    });
  } catch (error) {
    console.error('Reading GET error:', error);
    return res.status(500).json({ message: 'خطأ في جلب بيانات القراءة' });
  }
});

// PUT /progress/reading - حفظ آخر موضع قراءة
router.put('/reading', requireAuth, (req, res) => {
  try {
    const { surah, verse } = req.body || {};

    // Validation
    if (!surah || typeof surah !== 'number' || surah < 1 || surah > 114) {
      return res.status(400).json({ message: 'رقم السورة يجب أن يكون بين 1 و 114' });
    }
    if (verse && (typeof verse !== 'number' || verse < 1)) {
      return res.status(400).json({ message: 'رقم الآية يجب أن يكون قيمة موجبة' });
    }

    db.prepare(
      `INSERT INTO reading_progress (user_id, last_surah, last_verse, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         last_surah = excluded.last_surah,
         last_verse = excluded.last_verse,
         updated_at = datetime('now')`
    ).run(req.session.userId, surah, verse ?? null);

    return res.json({ success: true, message: 'تم حفظ موضع القراءة' });
  } catch (error) {
    console.error('Reading PUT error:', error);
    return res.status(500).json({ message: 'تعذر حفظ موضع القراءة' });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
