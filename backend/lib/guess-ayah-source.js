'use strict';

// مصدر بيانات لعبة "تخمين الآية": نعتمد نفس مصدر القرآن المستخدم أصلاً في
// صفحة القرآن بالفرونت اند (api.alquran.cloud برواية "quran-uthmani")، بدل
// تخزين آيات يدوياً هنا، تفادياً لأي خطأ نسخ/تشكيل في نص القرآن.
const QURAN_API = 'https://api.alquran.cloud/v1';

let surahListCache = null; // [{number, name, numberOfAyahs}]
const surahTextCache = new Map(); // number -> [ayahText,...]

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getSurahList() {
  if (surahListCache) return surahListCache;
  const data = await fetchJson(`${QURAN_API}/surah`);
  const list = Array.isArray(data?.data) ? data.data : [];
  if (!list.length) throw new Error('quran_surah_list_empty');
  surahListCache = list.map((s) => ({ number: s.number, name: s.name, numberOfAyahs: s.numberOfAyahs }));
  return surahListCache;
}

async function getSurahAyahs(number) {
  if (surahTextCache.has(number)) return surahTextCache.get(number);
  const data = await fetchJson(`${QURAN_API}/surah/${number}/quran-uthmani`);
  const ayahs = Array.isArray(data?.data?.ayahs) ? data.data.ayahs.map((a) => a.text) : [];
  if (!ayahs.length) throw new Error('quran_surah_empty');
  surahTextCache.set(number, ayahs);
  return ayahs;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickDistractors(surahList, excludeNumber, count) {
  const pool = surahList.filter((s) => s.number !== excludeNumber);
  const chosen = new Set();
  while (chosen.size < count && chosen.size < pool.length) {
    chosen.add(pickRandom(pool).number);
  }
  return [...chosen].map((num) => surahList.find((s) => s.number === num));
}

// نولّد جولة عشوائية: آية بطول معقول (ليست مقطعاً قصيراً جداً كـ "الٓمّٓ"
// يصعب التعرف عليه، وليست طويلة جداً تُتعب القارئ)، مع 4 اختيارات لاسم
// السورة (واحد صحيح + 3 مموّهة).
async function generateRound({ excludeSurahs = [] } = {}) {
  const surahList = await getSurahList();
  const candidates = surahList.filter((s) => !excludeSurahs.includes(s.number));
  const pool = candidates.length >= 8 ? candidates : surahList;

  let text = null;
  let surah = null;
  for (let attempt = 0; attempt < 6 && !text; attempt += 1) {
    const candidate = pickRandom(pool);
    const ayahs = await getSurahAyahs(candidate.number);
    const validAyahs = ayahs.filter((t) => t.replace(/[^\u0600-\u06FF]/g, '').length >= 18);
    const chosenText = pickRandom(validAyahs.length ? validAyahs : ayahs);
    if (chosenText) {
      text = chosenText;
      surah = candidate;
    }
  }
  if (!text || !surah) throw new Error('guess_ayah_generation_failed');

  const distractors = pickDistractors(surahList, surah.number, 3);
  const options = [{ number: surah.number, name: surah.name }, ...distractors]
    .sort(() => Math.random() - 0.5);
  const correctIndex = options.findIndex((o) => o.number === surah.number);

  return {
    text,
    surahNumber: surah.number,
    surahName: surah.name,
    options: options.map((o) => o.name),
    correctIndex,
  };
}

module.exports = { generateRound, getSurahList };
