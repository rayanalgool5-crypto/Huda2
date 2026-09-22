const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../lib/require-auth');
const { askIslamicAI } = require('../lib/ai-client');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 25, standardHeaders: true, legacyHeaders: false, message: { message: 'أسئلة كثيرة جداً. حاول بعد قليل.' } });
router.use(requireAuth, limiter);

router.post('/ask', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8).map((item) => ({ role: item?.role === 'assistant' ? 'assistant' : 'user', text: String(item?.text || '').slice(0, 1200) })).filter((item) => item.text) : [];
  if (!question || question.length > 1200) return res.status(400).json({ message: 'اكتب سؤالاً واضحاً (حتى 1200 حرف).' });
  try {
    const answer = await askIslamicAI(question, '', history);
    res.json({ answer });
  } catch (err) {
    console.error('AI ask error:', err.message);
    if (err.message === 'ai_not_configured') return res.status(503).json({ message: 'الذكاء الاصطناعي غير مهيّأ على السيرفر بعد.' });
    res.status(502).json({ message: 'تعذّر الحصول على إجابة الآن. حاول لاحقاً.' });
  }
});
module.exports = router;
