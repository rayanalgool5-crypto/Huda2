'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const { askIslamicAI } = require('../lib/ai-client');

const router = express.Router();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'طلبات كثيرة جداً. حاول بعد قليل.' }
});
router.use(requireAuth, limiter);

const MAX_MESSAGE = 6000;
const MAX_TITLE = 80;

function ownsConversation(id, userId) {
  return db.prepare('SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(id, userId);
}

router.get('/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
      (SELECT content FROM ai_messages m WHERE m.conversation_id=c.id AND m.role='user' ORDER BY m.id ASC LIMIT 1) AS first_message
    FROM ai_conversations c
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT 100
  `).all(req.session.userId);
  res.json({ conversations: rows });
});

router.post('/conversations', (req, res) => {
  const result = db.prepare(`
    INSERT INTO ai_conversations (user_id, title) VALUES (?, 'محادثة جديدة')
  `).run(req.session.userId);
  const conversation = db.prepare('SELECT id, title, created_at, updated_at FROM ai_conversations WHERE id=? AND user_id=?')
    .get(Number(result.lastInsertRowid), req.session.userId);
  res.status(201).json({ conversation });
});

router.get('/conversations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'معرّف المحادثة غير صحيح.' });
  const conversation = ownsConversation(id, req.session.userId);
  if (!conversation) return res.status(404).json({ message: 'المحادثة غير موجودة.' });
  const messages = db.prepare(`
    SELECT id, role, content, created_at FROM ai_messages
    WHERE conversation_id = ? AND user_id = ? ORDER BY id ASC
  `).all(id, req.session.userId);
  res.json({ conversation, messages });
});

router.patch('/conversations/:id', (req, res) => {
  const id = Number(req.params.id);
  const title = String(req.body?.title || '').trim();
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'معرّف المحادثة غير صحيح.' });
  if (!title || title.length > MAX_TITLE) return res.status(400).json({ message: 'العنوان مطلوب وبحد أقصى 80 حرفاً.' });
  const conversation = ownsConversation(id, req.session.userId);
  if (!conversation) return res.status(404).json({ message: 'المحادثة غير موجودة.' });
  db.prepare("UPDATE ai_conversations SET title=?, updated_at=datetime('now') WHERE id=? AND user_id=?")
    .run(title, id, req.session.userId);
  res.json({ conversation: ownsConversation(id, req.session.userId) });
});

router.delete('/conversations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'معرّف المحادثة غير صحيح.' });
  const conversation = ownsConversation(id, req.session.userId);
  if (!conversation) return res.status(404).json({ message: 'المحادثة غير موجودة.' });
  db.prepare('DELETE FROM ai_conversations WHERE id=? AND user_id=?').run(id, req.session.userId);
  res.json({ deleted: true });
});

router.post('/conversations/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'معرّف المحادثة غير صحيح.' });
  if (!message || message.length > MAX_MESSAGE) {
    return res.status(400).json({ message: `اكتب رسالة واضحة (حتى ${MAX_MESSAGE} حرفاً).` });
  }
  const conversation = ownsConversation(id, req.session.userId);
  if (!conversation) return res.status(404).json({ message: 'المحادثة غير موجودة.' });

  const userId = req.session.userId;
  const prior = db.prepare(`
    SELECT role, content FROM ai_messages
    WHERE conversation_id=? AND user_id=? ORDER BY id DESC LIMIT 16
  `).all(id, userId).reverse().map((row) => ({ role: row.role, text: row.content }));

  const insertUser = db.prepare(`
    INSERT INTO ai_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'user', ?)
  `).run(id, userId, message);

  // عنوان مبدئي من أول رسالة فقط؛ لا يُستبدل العنوان الذي عدّله المستخدم.
  const countUsers = db.prepare("SELECT COUNT(*) AS n FROM ai_messages WHERE conversation_id=? AND user_id=? AND role='user'")
    .get(id, userId).n;
  if (countUsers === 1 && conversation.title === 'محادثة جديدة') {
    const title = message.replace(/\s+/g, ' ').slice(0, 54) || 'محادثة جديدة';
    db.prepare("UPDATE ai_conversations SET title=?, updated_at=datetime('now') WHERE id=? AND user_id=?")
      .run(title, id, userId);
  } else {
    db.prepare("UPDATE ai_conversations SET updated_at=datetime('now') WHERE id=? AND user_id=?").run(id, userId);
  }

  try {
    const answer = await askIslamicAI(message, '', prior);
    const insertedAssistant = db.prepare(`
      INSERT INTO ai_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)
    `).run(id, userId, answer);
    db.prepare("UPDATE ai_conversations SET updated_at=datetime('now') WHERE id=? AND user_id=?").run(id, userId);
    const userMessage = db.prepare('SELECT id, role, content, created_at FROM ai_messages WHERE id=?').get(Number(insertUser.lastInsertRowid));
    const assistantMessage = db.prepare('SELECT id, role, content, created_at FROM ai_messages WHERE id=?').get(Number(insertedAssistant.lastInsertRowid));
    res.json({ answer, userMessage, assistantMessage });
  } catch (err) {
    console.error('Muslim generation failed:', err.message);
    const status = err.code === 'AI_NOT_CONFIGURED' ? 503 : (err.status === 429 ? 503 : 502);
    const messageText = err.code === 'AI_NOT_CONFIGURED'
      ? 'مسلم غير مهيّأ بعد. أضف GEMINI_API_KEY إلى متغيرات بيئة الخادم.'
      : (err.status === 429 ? 'المساعد مزدحم حالياً. حاول بعد قليل.' : 'تعذّر الحصول على إجابة من المساعد. رسالتك محفوظة ويمكنك المحاولة مجدداً.');
    res.status(status).json({ message: messageText, userMessage: db.prepare('SELECT id, role, content, created_at FROM ai_messages WHERE id=?').get(Number(insertUser.lastInsertRowid)) });
  }
});

module.exports = router;
