// نظام العناصر المغلق لمحرك ألعاب هُدى.
//
// هذا هو "القاموس" الوحيد المسموح لأنواع عناصر اللعبة. لا الذكاء الاصطناعي
// ولا المستخدم يستطيع إضافة نوع عنصر جديد من تلقاء نفسه — أي عنصر في
// Game Specification نوعه غير موجود هنا يُرفض في backend/lib/game-spec-validator.js
// قبل أن يصل لأي محرك تشغيل.
//
// كل عنصر معرّف بخصائصه المسموحة فقط (allowedProps) مع نوع كل خاصية،
// حتى لا يستطيع أحد تمرير خاصية غريبة (مثلاً كود أو HTML) داخل عنصر شكليًا سليم.

'use strict';

// أنواع اللعبة المسموحة (تحدّد القواعد العامة وليس العناصر).
const GAME_TYPES = Object.freeze([
  'collect', // جمع العناصر
  'avoid', // تجنب العقبات
  'puzzle', // ألغاز
  'quiz', // أسئلة وأجوبة
  'match', // مطابقة
  'memory', // ذاكرة
  'sort', // ترتيب
  'word', // ألعاب كلمات
  'speed', // سرعة
  'educational', // ألعاب تعليمية
]);

const DIMENSIONS = Object.freeze(['2D', '2.5D']);
const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
const THEMES = Object.freeze([
  'space', 'ocean', 'desert', 'forest', 'city', 'islamic', 'classroom', 'neutral',
]);

// أنواع الخصائص البدائية المسموحة داخل تعريف أي عنصر.
const PROP_TYPES = Object.freeze(['string', 'number', 'boolean']);

// حدود عامة لأي نص حر (عناوين، أسئلة، إجابات...) لمنع الإسراف/الحقن عبر نص ضخم.
const MAX_SHORT_TEXT = 80;
const MAX_LONG_TEXT = 300;

// تعريف كل عنصر مسموح: الخصائص المسموحة فقط ونوعها وحدودها.
// أي خاصية غير مذكورة هنا تُحذف (strip) في مرحلة التحقق، ولا تُقبل أبدًا كنص حر بلا حدود.
const ELEMENT_DEFINITIONS = Object.freeze({
  PLAYER: {
    allowedProps: {
      x: { type: 'number' }, y: { type: 'number' },
      speed: { type: 'number', min: 1, max: 20 },
      color: { type: 'color' },
      lives: { type: 'number', min: 1, max: 9 },
    },
  },
  ENEMY: {
    allowedProps: {
      x: { type: 'number' }, y: { type: 'number' },
      speed: { type: 'number', min: 1, max: 20 },
      pattern: { type: 'enum', values: ['static', 'patrol', 'chase', 'random'] },
      color: { type: 'color' },
    },
  },
  STAR: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, value: { type: 'number', min: 1, max: 1000 } },
  },
  COIN: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, value: { type: 'number', min: 1, max: 1000 } },
  },
  OBSTACLE: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
  },
  PLATFORM: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
  },
  DOOR: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, locked: { type: 'boolean' }, targetKeyId: { type: 'id' } },
  },
  KEY: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, id: { type: 'id' } },
  },
  BUTTON: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, label: { type: 'shortText' }, actionId: { type: 'id' } },
  },
  TIMER: {
    allowedProps: { seconds: { type: 'number', min: 5, max: 3600 } },
  },
  SCORE: {
    allowedProps: { startValue: { type: 'number', min: 0, max: 1000000 } },
  },
  TEXT: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' }, content: { type: 'shortText' } },
  },
  QUESTION: {
    allowedProps: { id: { type: 'id' }, prompt: { type: 'longText' }, correctAnswerId: { type: 'id' } },
  },
  ANSWER: {
    allowedProps: { id: { type: 'id' }, questionId: { type: 'id' }, label: { type: 'shortText' } },
  },
  CHECKPOINT: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' } },
  },
  GOAL: {
    allowedProps: { x: { type: 'number' }, y: { type: 'number' } },
  },
  BACKGROUND: {
    allowedProps: { theme: { type: 'enum', values: THEMES } },
  },
});

const ALLOWED_ELEMENT_TYPES = Object.freeze(Object.keys(ELEMENT_DEFINITIONS));

// أنواع شروط الفوز المسموحة فقط — بدون أي تعبير حر (لا "expression" ولا كود).
const WIN_CONDITION_TYPES = Object.freeze([
  'reachScore', // scoreAtLeast
  'collectAll', // جمع كل عناصر من نوع معيّن
  'surviveTime', // البقاء حيًا حتى نهاية المؤقت
  'reachGoal', // الوصول لعنصر GOAL
  'answerAllCorrect', // الإجابة الصحيحة على كل الأسئلة
]);

module.exports = {
  GAME_TYPES,
  DIMENSIONS,
  DIFFICULTIES,
  THEMES,
  PROP_TYPES,
  MAX_SHORT_TEXT,
  MAX_LONG_TEXT,
  ELEMENT_DEFINITIONS,
  ALLOWED_ELEMENT_TYPES,
  WIN_CONDITION_TYPES,
};
