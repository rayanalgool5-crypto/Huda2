const express = require('express');
const fs = require('fs');
const path = require('path');
const { categories, searchHadiths } = require('../lib/hadith-search');

const router = express.Router();

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

module.exports = router;
