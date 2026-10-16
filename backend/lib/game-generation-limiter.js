// حد يومي لعدد مرات توليد/تعديل الألعاب لكل مستخدم — لمنع استهلاك مستخدم
// واحد لكامل حصة Gemini API. هذا حد مبني على قاعدة البيانات (وليس فقط على
// الذاكرة كما في express-rate-limit)، لأنه مرتبط بحساب المستخدم لا بعنوان IP،
// ويبقى صحيحًا حتى لو أعاد السيرفر التشغيل.
//
// يُستخدم إلى جانب rate limiter عادي بالدقائق (routes/games.js) يمنع الحرق
// السريع، بينما هذا الملف يمنع الاستهلاك التراكمي خلال اليوم.

'use strict';

const db = require('../db');

const DAILY_LIMIT = Number(process.env.GAME_GENERATION_DAILY_LIMIT || 20);

function countTodayGenerations(userId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM game_generation_log
       WHERE user_id = ? AND created_at >= datetime('now', '-1 day')`
    )
    .get(userId);
  return row ? row.count : 0;
}

function logGeneration(userId, status) {
  db.prepare(
    `INSERT INTO game_generation_log (user_id, status, created_at) VALUES (?, ?, datetime('now'))`
  ).run(userId, status);
}

/**
 * Middleware: يرفض الطلب إن تجاوز المستخدم حده اليومي، وإلا يكمل.
 */
function enforceDailyLimit(req, res, next) {
  const userId = req.session.userId;
  const used = countTodayGenerations(userId);
  if (used >= DAILY_LIMIT) {
    return res.status(429).json({
      message: `وصلت للحد الأقصى لإنشاء/تعديل الألعاب اليوم (${DAILY_LIMIT}). حاول مرة أخرى غدًا.`,
    });
  }
  next();
}

module.exports = { enforceDailyLimit, logGeneration, countTodayGenerations, DAILY_LIMIT };
