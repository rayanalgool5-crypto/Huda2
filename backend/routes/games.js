// مسارات "ألعاب هُدى" — استوديو هُدى (توليد الألعاب بالذكاء الاصطناعي) وإدارة
// الألعاب المحفوظة. كل شيء هنا خلف requireAuth: لا توليد ولا حفظ ولا عرض
// بدون تسجيل دخول.

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const { generateGameSpec, editGameSpec, GeminiError } = require('../lib/gemini-client');
const { validateGameSpec, ValidationError } = require('../lib/game-spec-validator');
const { enforceDailyLimit, logGeneration } = require('../lib/game-generation-limiter');
const { GAME_TYPES, DIMENSIONS, DIFFICULTIES } = require('../lib/game-elements');

const router = express.Router();
router.use(requireAuth);

// يمنع الحرق السريع (عدة طلبات توليد خلال ثوانٍ) بينما الحد اليومي في
// game-generation-limiter.js يمنع الاستهلاك التراكمي على مدار اليوم.
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'طلبات إنشاء كثيرة جداً خلال وقت قصير. حاول مرة أخرى بعد قليل.' },
});

const MAX_DESCRIPTION_LEN = 500;
const MAX_EDIT_INSTRUCTION_LEN = 200;
const MAX_TITLE_LEN = 80;
const VISIBILITY_VALUES = ['private', 'friends'];

function mapGameRow(row) {
  return {
    id: row.id,
    title: row.title,
    spec: JSON.parse(row.spec_json),
    thumbnail: row.thumbnail,
    visibility: row.visibility,
    dimension: row.dimension,
    playersMin: row.players_min,
    playersMax: row.players_max,
    createdAt: row.created_at,
    ownerId: row.owner_id,
  };
}

function isNonEmptyString(value, maxLen) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

// ---------- توليد Game Specification جديدة (بدون حفظ) ----------
router.post('/generate', generateLimiter, enforceDailyLimit, async (req, res) => {
  const userId = req.session.userId;
  try {
    const { description, gameCategory, dimension, players, difficulty } = req.body || {};

    if (!isNonEmptyString(description, MAX_DESCRIPTION_LEN)) {
      return res.status(400).json({ message: `وصف اللعبة مطلوب (بحد أقصى ${MAX_DESCRIPTION_LEN} حرفاً).` });
    }
    // القيم المُقيَّدة القادمة من واجهة الاستوديو (أزرار/قوائم اختيار وليست نصًا حرًا).
    if (dimension !== undefined && !DIMENSIONS.includes(dimension)) {
      return res.status(400).json({ message: 'النمط غير صالح.' });
    }
    if (difficulty !== undefined && !DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({ message: 'مستوى الصعوبة غير صالح.' });
    }
    const playersNum = players !== undefined ? Number(players) : undefined;
    if (playersNum !== undefined && (!Number.isInteger(playersNum) || playersNum < 1 || playersNum > 4)) {
      return res.status(400).json({ message: 'عدد اللاعبين غير صالح.' });
    }

    const rawSpec = await generateGameSpec({
      description: description.trim(),
      gameCategory: typeof gameCategory === 'string' ? gameCategory.slice(0, 30) : undefined,
      dimension,
      players: playersNum,
      difficulty,
    });

    const cleanSpec = validateGameSpec(rawSpec);
    logGeneration(userId, 'success');
    return res.json({ spec: cleanSpec });
  } catch (err) {
    logGeneration(userId, 'failed');
    if (err instanceof ValidationError) {
      return res.status(422).json({ message: 'تعذّر إنشاء لعبة صالحة من هذا الوصف. جرّب وصفًا أوضح أو أبسط.', reason: err.reason });
    }
    if (err instanceof GeminiError) {
      console.error('Gemini error:', err.message, err.cause || '');
      return res.status(502).json({ message: 'تعذّر الاتصال بخدمة إنشاء الألعاب حالياً. حاول لاحقاً.' });
    }
    console.error('Unexpected /games/generate error:', err);
    return res.status(500).json({ message: 'حدث خطأ غير متوقع.' });
  }
});

// ---------- تعديل Game Specification بأمر طبيعي (بدون حفظ) ----------
router.post('/generate/edit', generateLimiter, enforceDailyLimit, async (req, res) => {
  const userId = req.session.userId;
  try {
    const { spec, editInstruction } = req.body || {};
    if (!isNonEmptyString(editInstruction, MAX_EDIT_INSTRUCTION_LEN)) {
      return res.status(400).json({ message: `طلب التعديل مطلوب (بحد أقصى ${MAX_EDIT_INSTRUCTION_LEN} حرفاً).` });
    }
    let currentSpec;
    try {
      currentSpec = validateGameSpec(spec);
    } catch {
      return res.status(400).json({ message: 'اللعبة الحالية غير صالحة. أنشئ لعبة جديدة أولاً.' });
    }

    const rawSpec = await editGameSpec({ currentSpec, editInstruction: editInstruction.trim() });
    const cleanSpec = validateGameSpec(rawSpec);
    logGeneration(userId, 'success');
    return res.json({ spec: cleanSpec });
  } catch (err) {
    logGeneration(userId, 'failed');
    if (err instanceof ValidationError) {
      return res.status(422).json({ message: 'تعذّر تنفيذ هذا التعديل. جرّب صياغة أبسط.', reason: err.reason });
    }
    if (err instanceof GeminiError) {
      console.error('Gemini error:', err.message, err.cause || '');
      return res.status(502).json({ message: 'تعذّر الاتصال بخدمة إنشاء الألعاب حالياً. حاول لاحقاً.' });
    }
    console.error('Unexpected /games/generate/edit error:', err);
    return res.status(500).json({ message: 'حدث خطأ غير متوقع.' });
  }
});

// ---------- حفظ لعبة (Spec متحقَّق منه من الفرونت اند بعد المعاينة) ----------
router.post('/', (req, res) => {
  const userId = req.session.userId;
  try {
    const { spec, title, thumbnail, visibility } = req.body || {};
    const cleanSpec = validateGameSpec(spec);
    const finalTitle = isNonEmptyString(title, MAX_TITLE_LEN) ? title.trim() : cleanSpec.title;
    const finalVisibility = VISIBILITY_VALUES.includes(visibility) ? visibility : 'private';
    // thumbnail: نخزن فقط معرّف/اسم صورة مصغّرة معروفة مسبقًا (من مجموعة ثابتة على الفرونت اند)
    // وليس رابطًا خارجيًا حرًا أو بيانات صورة خام — يمنع تخزين محتوى غير متحكَّم به.
    const cleanThumbnail = typeof thumbnail === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(thumbnail) ? thumbnail : 'default';

    const result = db
      .prepare(
        `INSERT INTO games (owner_id, title, spec_json, thumbnail, visibility, dimension, players_min, players_max, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`
      )
      .run(userId, finalTitle, JSON.stringify(cleanSpec), cleanThumbnail, finalVisibility, cleanSpec.dimension, cleanSpec.players);

    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(mapGameRow(row));
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(422).json({ message: 'اللعبة غير صالحة للحفظ.', reason: err.reason });
    }
    console.error('Unexpected POST /games error:', err);
    return res.status(500).json({ message: 'حدث خطأ غير متوقع.' });
  }
});

// ---------- ألعابي ----------
router.get('/mine', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM games WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.session.userId);
  res.json(rows.map(mapGameRow));
});

// ---------- تفاصيل لعبة واحدة (المالك، أو صديق إن كانت visibility=friends) ----------
router.get('/:id', (req, res) => {
  const gameId = Number(req.params.id);
  if (!Number.isInteger(gameId)) return res.status(400).json({ message: 'معرّف غير صالح.' });

  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!row) return res.status(404).json({ message: 'اللعبة غير موجودة.' });

  const userId = req.session.userId;
  if (row.owner_id === userId) return res.json(mapGameRow(row));

  if (row.visibility === 'friends') {
    const friendship = db
      .prepare(
        `SELECT 1 FROM friendships
         WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`
      )
      .get(userId, row.owner_id, row.owner_id, userId);
    if (friendship) return res.json(mapGameRow(row));
  }
  return res.status(403).json({ message: 'لا تملك صلاحية الوصول لهذه اللعبة.' });
});

// ---------- حذف لعبة (المالك فقط) ----------
router.delete('/:id', (req, res) => {
  const gameId = Number(req.params.id);
  if (!Number.isInteger(gameId)) return res.status(400).json({ message: 'معرّف غير صالح.' });

  const row = db.prepare('SELECT owner_id FROM games WHERE id = ?').get(gameId);
  if (!row) return res.status(404).json({ message: 'اللعبة غير موجودة.' });
  if (row.owner_id !== req.session.userId) return res.status(403).json({ message: 'لا تملك صلاحية حذف هذه اللعبة.' });

  db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
  res.json({ success: true });
});

// ---------- تغيير مشاركة اللعبة (خاصة / الأصدقاء فقط) ----------
router.patch('/:id/visibility', (req, res) => {
  const gameId = Number(req.params.id);
  const { visibility } = req.body || {};
  if (!Number.isInteger(gameId)) return res.status(400).json({ message: 'معرّف غير صالح.' });
  if (!VISIBILITY_VALUES.includes(visibility)) return res.status(400).json({ message: 'قيمة المشاركة غير صالحة.' });

  const row = db.prepare('SELECT owner_id FROM games WHERE id = ?').get(gameId);
  if (!row) return res.status(404).json({ message: 'اللعبة غير موجودة.' });
  if (row.owner_id !== req.session.userId) return res.status(403).json({ message: 'لا تملك صلاحية تعديل هذه اللعبة.' });

  db.prepare('UPDATE games SET visibility = ? WHERE id = ?').run(visibility, gameId);
  res.json({ success: true, visibility });
});

// ---------- بيانات مرجعية ثابتة للواجهة (القوائم المسموحة) ----------
router.get('/meta/options', (req, res) => {
  res.json({ gameTypes: GAME_TYPES, dimensions: DIMENSIONS, difficulties: DIFFICULTIES });
});

module.exports = router;
