const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { categories, searchHadiths } = require('../lib/hadith-search');
const { askIslamicAI } = require('../lib/ai-client');

const router = express.Router();

// حماية بسيطة لمسار "إضافة شرح" لأنه يستدعي Gemini (له تكلفة/حصة استخدام)،
// وهذا المسار لا يتطلب تسجيل دخول أصلاً (بيانات الحديث عامة).
const explainLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'طلبات شرح كثيرة جداً. حاول بعد قليل.' },
});

// تخزين مؤقت بالذاكرة لكل حديث تم توليد شرح له، حتى لا نستدعي الذكاء
// الاصطناعي مرة أخرى لنفس الحديث لكل زائر (يُصفَّر مع إعادة تشغيل السيرفر).
const explanationCache = new Map();

// تحميل بيانات الأحاديث مرة واحدة عند إقلاع الخادم (مجموعة بيانات صغيرة، ما بتحتاج DB).
const hadiths = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'hadith-seed.json'), 'utf8')
);

const categoryCounts = (book) => {
  const pool = book ? hadiths.filter((h) => h.book === book) : hadiths;
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: pool.filter((h) => h.category === c.id).length,
  }));
};

// GET /api/hadith/categories?book=bukhari|muslim - قائمة التصنيفات مع عدد الأحاديث بكل واحد
router.get('/categories', (req, res) => {
  res.json({ categories: categoryCounts(req.query.book) });
});

// GET /api/hadith?book=bukhari|muslim&category=<id>&q=<نص البحث>
router.get('/', (req, res) => {
  const { book, category, q } = req.query;
  let result = hadiths;

  if (book === 'bukhari' || book === 'muslim') {
    result = result.filter((h) => h.book === book);
  }
  if (category && category !== 'all') {
    result = result.filter((h) => h.category === category);
  }
  if (q && q.trim()) {
    result = searchHadiths(result, q);
  }

  res.json({
    total: result.length,
    query: q || null,
    hadiths: result,
  });
});

// POST /api/hadith/:id/explain — يولّد شرحاً موجزاً للحديث عند عدم وجود
// شرح جاهز في قاعدة البيانات، عبر مساعد "مسلم" الذكي (Gemini). يتطلب أن
// يكون GEMINI_API_KEY مضبوطاً في .env على الخادم.
router.post('/:id/explain', explainLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hadith = hadiths.find((h) => h.id === id);
    if (!hadith) return res.status(404).json({ message: 'الحديث غير موجود.' });

    if (hadith.explanation) {
      return res.json({ explanation: hadith.explanation, source: hadith.explanationSource || 'من بيانات المشروع', generated: false });
    }

    if (explanationCache.has(id)) {
      return res.json({ ...explanationCache.get(id), generated: true, cached: true });
    }

    const bookName = hadith.book === 'bukhari' ? 'صحيح البخاري' : hadith.book === 'muslim' ? 'صحيح مسلم' : (hadith.book || 'غير مذكور');
    const question = [
      'اشرح لي هذا الحديث النبوي شرحاً موجزاً وواضحاً (فقرة أو فقرتين):',
      `النص: "${hadith.text}"`,
      `الراوي: ${hadith.narrator || 'غير مذكور'}`,
      `المصدر: ${bookName}${hadith.agreed ? ' (متفق عليه)' : ''}`,
      'اذكر المعنى العام والفائدة/الحكم المستفاد فقط، بدون مقدمات طويلة، ودون اختلاق نسبة الشرح لعالم بعينه ما لم تكن متأكداً.',
    ].join('\n');

    const explanation = await askIslamicAI(question, '', []);
    const payload = { explanation, source: 'شرح مولَّد بواسطة الذكاء الاصطناعي (مسلم) — راجع كتب الشروح المعتمدة للتفصيل' };
    explanationCache.set(id, payload);
    return res.json({ ...payload, generated: true });
  } catch (error) {
    console.error('Hadith explain error:', error.message);
    if (error.message === 'ai_not_configured') {
      return res.status(503).json({ message: 'ميزة الشرح الذكي غير مفعّلة على الخادم بعد.' });
    }
    return res.status(502).json({ message: 'تعذّر توليد الشرح الآن. حاول لاحقاً.' });
  }
});

module.exports = router;
