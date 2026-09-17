const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { generateRound } = require('../lib/guess-ayah-source');
const rooms = require('../lib/guess-ayah-rooms');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90, // يسمح بالاستطلاع المتكرر (polling) لغرف اللعب الجماعي
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'طلبات كثيرة جداً. حاول بعد قليل.' },
});
router.use(limiter);

setInterval(() => { try { rooms.cleanup(); } catch { /* تجاهل */ } }, 1000 * 60 * 30);

// ---------- اللعب الفردي ----------
// كل جولة تُخزَّن مؤقتاً بالذاكرة (لا تُرسَل الإجابة الصحيحة للعميل قبل أن يجيب).
const soloRounds = new Map(); // id -> { correctIndex, surahName, expiresAt }
const SOLO_TTL_MS = 3 * 60 * 1000;

function cleanupSolo() {
  const now = Date.now();
  for (const [id, entry] of soloRounds.entries()) {
    if (now > entry.expiresAt) soloRounds.delete(id);
  }
}

router.get('/solo/round', async (req, res) => {
  try {
    cleanupSolo();
    const round = await generateRound();
    const id = crypto.randomBytes(12).toString('hex');
    soloRounds.set(id, { correctIndex: round.correctIndex, surahName: round.surahName, expiresAt: Date.now() + SOLO_TTL_MS });
    res.json({ roundId: id, text: round.text, options: round.options });
  } catch (error) {
    console.error('Guess-ayah solo round error:', error.message);
    res.status(502).json({ message: 'تعذّر تجهيز آية جديدة الآن. حاول لاحقاً.' });
  }
});

router.post('/solo/round/:id/answer', (req, res) => {
  const entry = soloRounds.get(req.params.id);
  if (!entry) return res.status(404).json({ message: 'انتهت صلاحية هذه الجولة، اطلب آية جديدة.' });
  soloRounds.delete(req.params.id);
  const optionIndex = Number(req.body?.optionIndex);
  const correct = optionIndex === entry.correctIndex;
  res.json({ correct, correctIndex: entry.correctIndex, surahName: entry.surahName });
});

// ---------- اللعب الجماعي (غرفة بكود) ----------
router.post('/rooms', async (req, res) => {
  try {
    const { room, token } = await rooms.createRoom(req.body?.name);
    res.status(201).json({ code: room.code, token, state: rooms.publicState(room, token) });
  } catch (error) {
    console.error('Create room error:', error.message);
    res.status(500).json({ message: 'تعذّر إنشاء الغرفة. حاول لاحقاً.' });
  }
});

router.post('/rooms/:code/join', (req, res) => {
  const result = rooms.joinRoom(req.params.code, req.body?.name);
  if (result.error === 'room_not_found') return res.status(404).json({ message: 'لا توجد غرفة بهذا الكود.' });
  if (result.error === 'room_full') return res.status(409).json({ message: 'الغرفة ممتلئة.' });
  res.json({ code: result.room.code, token: result.token, state: rooms.publicState(result.room, result.token) });
});

router.get('/rooms/:code', (req, res) => {
  const room = rooms.getRoom(req.params.code);
  if (!room) return res.status(404).json({ message: 'لا توجد غرفة بهذا الكود.' });
  const token = String(req.query?.token || '');
  res.json({ state: rooms.publicState(room, token) });
});

router.post('/rooms/:code/start', async (req, res) => {
  try {
    const result = await rooms.startRound(req.params.code, req.body?.token);
    if (result.error === 'room_not_found') return res.status(404).json({ message: 'لا توجد غرفة بهذا الكود.' });
    if (result.error === 'not_host') return res.status(403).json({ message: 'فقط صاحب الغرفة يمكنه بدء الجولة.' });
    if (result.error === 'need_more_players') return res.status(400).json({ message: 'بانتظار انضمام لاعب ثانٍ لبدء التحدي.' });
    if (result.error === 'round_in_progress') return res.status(409).json({ message: 'الجولة ما زالت جارية.' });
    res.json({ state: rooms.publicState(result.room, req.body?.token) });
  } catch (error) {
    console.error('Start round error:', error.message);
    res.status(502).json({ message: 'تعذّر تجهيز الآية الآن. حاول مرة أخرى.' });
  }
});

router.post('/rooms/:code/answer', (req, res) => {
  const result = rooms.submitAnswer(req.params.code, req.body?.token, req.body?.optionIndex);
  if (result.error === 'room_not_found') return res.status(404).json({ message: 'لا توجد غرفة بهذا الكود.' });
  if (result.error === 'not_in_room') return res.status(403).json({ message: 'لست ضمن هذه الغرفة.' });
  if (result.error === 'no_active_round') return res.status(400).json({ message: 'لا توجد جولة نشطة الآن.' });
  if (result.error === 'already_answered') return res.status(409).json({ message: 'لقد أجبت على هذه الجولة بالفعل.' });
  res.json({ state: rooms.publicState(result.room, req.body?.token) });
});

router.post('/rooms/:code/leave', (req, res) => {
  rooms.leaveRoom(req.params.code, req.body?.token);
  res.json({ success: true });
});

module.exports = router;
