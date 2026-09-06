/**
 * مقارنة دقيقة بين الآية المطلوبة وما نطقه/كتبه المستخدم.
 * تعتمد على أطول تسلسل مشترك (LCS) لتصنيف الأخطاء:
 *   missing     = كلمة ناقصة (موجودة في الآية وغير منطوقة)
 *   extra       = كلمة زائدة (نطقها المستخدم وليست في الآية)
 *   substituted = كلمة مبدلة (نطق كلمة مكان أخرى)
 */

const HudaVerseDiff = (() => {
  const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670]/g;

  function normalizeWord(word) {
    return String(word || '')
      .replace(DIACRITICS, '')
      .replace(/\u0640/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\u0621-\u064A]/g, '')
      .trim();
  }

  function splitWords(text) {
    return String(text || '')
      .split(/\s+/)
      .filter(Boolean);
  }

  function normalizeWords(text) {
    return splitWords(text).map(normalizeWord).filter(Boolean);
  }

  // مصفوفة LCS بين الكلمات المتوقعة والمنطوقة.
  function lcsMatrix(expected, actual) {
    const rows = expected.length + 1;
    const cols = actual.length + 1;
    const table = Array.from({ length: rows }, () => new Uint32Array(cols));

    for (let i = expected.length - 1; i >= 0; i--) {
      for (let j = actual.length - 1; j >= 0; j--) {
        table[i][j] = expected[i] === actual[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    return table;
  }

  /**
   * تُرجع:
   *  - operations: تسلسل العمليات (match / missing / extra / substituted)
   *  - errors: الأخطاء فقط، جاهزة للإرسال إلى قاعدة البيانات
   *  - matchedPrefix: عدد الكلمات الصحيحة المتتابعة من البداية (بوابة التقدّم)
   *  - accuracy: نسبة الإتقان لهذه المحاولة
   *  - perfect: صحيحة 100% (بلا أي خطأ ولا نقص ولا زيادة)
   */
  function compare(expectedText, actualText) {
    const expectedRaw = splitWords(expectedText);
    const expected = expectedRaw.map(normalizeWord).filter(Boolean);
    const actualRaw = splitWords(actualText);
    const actual = actualRaw.map(normalizeWord).filter(Boolean);

    const table = lcsMatrix(expected, actual);
    const operations = [];
    let i = 0;
    let j = 0;

    while (i < expected.length && j < actual.length) {
      if (expected[i] === actual[j]) {
        operations.push({ type: 'match', wordIndex: i, expected: expectedRaw[i], actual: actualRaw[j] });
        i++;
        j++;
      } else if (table[i + 1][j] === table[i][j + 1]) {
        // كلمة مبدلة: حذف من الآية + إضافة من المستخدم في نفس الموضع
        operations.push({ type: 'substituted', wordIndex: i, expected: expectedRaw[i], actual: actualRaw[j] });
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        operations.push({ type: 'missing', wordIndex: i, expected: expectedRaw[i], actual: null });
        i++;
      } else {
        operations.push({ type: 'extra', wordIndex: i, expected: null, actual: actualRaw[j] });
        j++;
      }
    }

    while (i < expected.length) {
      operations.push({ type: 'missing', wordIndex: i, expected: expectedRaw[i], actual: null });
      i++;
    }
    while (j < actual.length) {
      operations.push({ type: 'extra', wordIndex: expected.length, expected: null, actual: actualRaw[j] });
      j++;
    }

    const errors = operations.filter((operation) => operation.type !== 'match');

    let matchedPrefix = 0;
    for (const operation of operations) {
      if (operation.type !== 'match') break;
      matchedPrefix++;
    }

    const matches = operations.filter((operation) => operation.type === 'match').length;
    const extras = operations.filter((operation) => operation.type === 'extra').length;
    // الكلمات الزائدة تُخصم من الرصيد حتى لا يرفع الحشو النسبة.
    const scored = Math.max(0, matches - extras);
    const accuracy = expected.length ? Math.round((scored / expected.length) * 100) : 0;

    return {
      operations,
      errors,
      matchedPrefix,
      accuracy,
      perfect: errors.length === 0 && expected.length > 0 && matches === expected.length,
      expectedWords: expectedRaw,
      expectedCount: expected.length,
      actualCount: actual.length,
    };
  }

  const ERROR_LABELS = {
    missing: 'كلمة ناقصة',
    extra: 'كلمة زائدة',
    substituted: 'كلمة مبدلة',
  };

  function describeError(error) {
    if (!error) return '';
    if (error.type === 'missing') return `كلمة ناقصة: «${error.expected}»`;
    if (error.type === 'extra') return `كلمة زائدة: «${error.actual}»`;
    return `كلمة مبدلة: قلت «${error.actual}» والصواب «${error.expected}»`;
  }

  // تلميح: الحرف الأول فقط من الكلمة المطلوبة، والباقي نقاط.
  function hintFor(word) {
    const letters = splitWords(word).join('');
    if (!letters) return '';
    const first = Array.from(letters)[0];
    const rest = Math.max(0, Array.from(letters).length - 1);
    return `${first}${'ـ'.repeat(Math.min(rest, 8))}`;
  }

  return { normalizeWord, normalizeWords, splitWords, compare, describeError, hintFor, ERROR_LABELS };
})();

if (typeof window !== 'undefined') {
  window.HudaVerseDiff = HudaVerseDiff;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HudaVerseDiff;
}
