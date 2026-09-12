// المدقّق الصارم لـ Game Specification.
//
// أي JSON يخرج من Gemini (أو يصل من الفرونت اند لأي سبب) يجب أن يمر من هنا
// قبل حفظه أو إرساله إلى محرك اللعب. هذه الطبقة هي خط الدفاع الحقيقي ضد:
// - إضافة عناصر غير معروفة (خارج game-elements.js)
// - حقن HTML/JS داخل حقول نصية (title, content, prompt...)
// - قيم غير منطقية (مؤقت سالب، عدد لاعبين خارج المسموح، إلخ)
// - أي حقل زائد غير متوقع في الـ JSON (نتجاهله بدل قبوله كما هو)
//
// المبدأ: allow-list صارمة في كل مستوى. أي شيء غير معرّف صراحةً يُحذف أو يُرفض،
// ولا يُمرَّر كما هو أبدًا ("لا تثق بأي حقل لم تتحقق منه بنفسك").

'use strict';

const {
  GAME_TYPES,
  DIMENSIONS,
  DIFFICULTIES,
  THEMES,
  MAX_SHORT_TEXT,
  MAX_LONG_TEXT,
  ELEMENT_DEFINITIONS,
  ALLOWED_ELEMENT_TYPES,
  WIN_CONDITION_TYPES,
} = require('./game-elements');

const MAX_OBJECTS = 60; // حد أعلى لعدد عناصر اللعبة الواحدة (يمنع أحمال ضخمة/DoS بسيطة)
const MAX_RULES = 20;
const MAX_TITLE_LEN = MAX_SHORT_TEXT;

// أي وسم HTML أو محارف قد تُستخدم لحقن/تشغيل كود — تُرفض النصوص التي تحتويها،
// بدل محاولة "تنظيفها"، لأن العناصر النصية تُعرض دائمًا عبر textContent وليس
// عبر innerHTML، فلا حاجة أصلاً لأي وسم HTML داخلها.
const DANGEROUS_PATTERN = /<\s*script|<\s*\/?\s*[a-z]+[\s>]|javascript:|on\w+\s*=|\{\{|\$\{/i;

class ValidationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ValidationError';
    this.reason = reason;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value, maxLen, fieldName) {
  if (typeof value !== 'string') throw new ValidationError(`invalid_field:${fieldName}`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`empty_field:${fieldName}`);
  if (trimmed.length > maxLen) throw new ValidationError(`field_too_long:${fieldName}`);
  if (DANGEROUS_PATTERN.test(trimmed)) throw new ValidationError(`unsafe_content:${fieldName}`);
  return trimmed;
}

function cleanId(value, fieldName) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(value)) {
    throw new ValidationError(`invalid_id:${fieldName}`);
  }
  return value;
}

function cleanNumber(value, { min = -100000, max = 100000 } = {}, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new ValidationError(`invalid_number:${fieldName}`);
  if (num < min || num > max) throw new ValidationError(`out_of_range:${fieldName}`);
  return num;
}

function cleanBoolean(value, fieldName) {
  if (typeof value !== 'boolean') throw new ValidationError(`invalid_boolean:${fieldName}`);
  return value;
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
function cleanColor(value, fieldName) {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    throw new ValidationError(`invalid_color:${fieldName}`);
  }
  return value;
}

function cleanEnum(value, values, fieldName) {
  if (!values.includes(value)) throw new ValidationError(`invalid_enum:${fieldName}`);
  return value;
}

// يتحقق من خصائص عنصر واحد مقابل تعريفه في ELEMENT_DEFINITIONS، ويرمي أي
// خاصية غير مُعرَّفة بدل تمريرها كما هي.
function validateElementProps(type, rawProps, path) {
  const definition = ELEMENT_DEFINITIONS[type];
  const clean = {};
  const props = isPlainObject(rawProps) ? rawProps : {};

  for (const [propName, propDef] of Object.entries(definition.allowedProps)) {
    if (!(propName in props)) continue; // خاصية اختيارية غير مرسلة — تجاهلها
    const raw = props[propName];
    const fieldName = `${path}.${propName}`;

    switch (propDef.type) {
      case 'number':
        clean[propName] = cleanNumber(raw, { min: propDef.min, max: propDef.max }, fieldName);
        break;
      case 'boolean':
        clean[propName] = cleanBoolean(raw, fieldName);
        break;
      case 'color':
        clean[propName] = cleanColor(raw, fieldName);
        break;
      case 'id':
        clean[propName] = cleanId(raw, fieldName);
        break;
      case 'shortText':
        clean[propName] = cleanText(raw, MAX_SHORT_TEXT, fieldName);
        break;
      case 'longText':
        clean[propName] = cleanText(raw, MAX_LONG_TEXT, fieldName);
        break;
      case 'enum':
        clean[propName] = cleanEnum(raw, propDef.values, fieldName);
        break;
      default:
        // لا نصل هنا أبدًا إن كانت game-elements.js متسقة، لكن الأمان أولًا:
        throw new ValidationError(`unknown_prop_type:${fieldName}`);
    }
  }
  // أي خاصية أخرى موجودة في raw ولم تُذكر في allowedProps تُحذف بصمت — لا تُمرَّر أبدًا.
  return clean;
}

function validateObjects(rawObjects) {
  if (!Array.isArray(rawObjects)) throw new ValidationError('objects_not_array');
  if (rawObjects.length > MAX_OBJECTS) throw new ValidationError('too_many_objects');

  return rawObjects.map((rawObj, index) => {
    if (!isPlainObject(rawObj)) throw new ValidationError(`invalid_object_at_${index}`);
    const type = rawObj.type;
    if (typeof type !== 'string' || !ALLOWED_ELEMENT_TYPES.includes(type)) {
      // هذا هو صلب "النظام المغلق": أي نوع عنصر غير موجود في القائمة المسموحة يُرفض فورًا.
      throw new ValidationError(`disallowed_element_type:${String(type)}`);
    }
    const id = rawObj.id !== undefined ? cleanId(rawObj.id, `objects[${index}].id`) : `obj_${index}`;
    const props = validateElementProps(type, rawObj.props, `objects[${index}]`);
    return { id, type, props };
  });
}

function validateRules(rawRules) {
  if (rawRules === undefined) return [];
  if (!Array.isArray(rawRules)) throw new ValidationError('rules_not_array');
  if (rawRules.length > MAX_RULES) throw new ValidationError('too_many_rules');
  // القواعد نصوص وصفية عربية قصيرة تُعرض للمستخدم فقط (مثلاً "اجمع كل النجوم")؛
  // لا تحتوي أبدًا على منطق قابل للتنفيذ — المنطق الفعلي يأتي من winCondition/scoreSystem فقط.
  return rawRules.map((r, i) => cleanText(r, MAX_SHORT_TEXT, `rules[${i}]`));
}

function validateWinCondition(raw) {
  if (!isPlainObject(raw)) throw new ValidationError('winCondition_missing');
  const type = cleanEnum(raw.type, WIN_CONDITION_TYPES, 'winCondition.type');
  const clean = { type };
  if (raw.targetScore !== undefined) clean.targetScore = cleanNumber(raw.targetScore, { min: 0, max: 1000000 }, 'winCondition.targetScore');
  if (raw.targetType !== undefined) clean.targetType = cleanEnum(raw.targetType, ALLOWED_ELEMENT_TYPES, 'winCondition.targetType');
  return clean;
}

function validateScoreSystem(raw) {
  const clean = { pointsPerAction: 10 };
  if (raw === undefined) return clean;
  if (!isPlainObject(raw)) throw new ValidationError('invalid_scoreSystem');
  if (raw.pointsPerAction !== undefined) {
    clean.pointsPerAction = cleanNumber(raw.pointsPerAction, { min: 0, max: 10000 }, 'scoreSystem.pointsPerAction');
  }
  if (raw.penaltyPerMistake !== undefined) {
    clean.penaltyPerMistake = cleanNumber(raw.penaltyPerMistake, { min: 0, max: 10000 }, 'scoreSystem.penaltyPerMistake');
  }
  return clean;
}

/**
 * يتحقق من Game Specification كاملة ويُرجع نسخة نظيفة منها فقط
 * (لا يُعيد أبدًا أي حقل لم يمرّ عبر دالة تنظيف صريحة).
 * يرمي ValidationError عند أي مخالفة.
 */
function validateGameSpec(raw) {
  if (!isPlainObject(raw)) throw new ValidationError('spec_not_object');

  // شكل رفض صريح يمكن لـ Gemini إرجاعه حسب system instruction (القسم 10).
  if (raw.valid === false) {
    throw new ValidationError(typeof raw.reason === 'string' ? raw.reason : 'unsupported_game');
  }

  const clean = {};
  clean.title = cleanText(raw.title, MAX_TITLE_LEN, 'title');
  clean.type = cleanEnum(raw.type, GAME_TYPES, 'type');
  clean.dimension = cleanEnum(raw.dimension, DIMENSIONS, 'dimension');
  clean.players = Math.round(cleanNumber(raw.players, { min: 1, max: 4 }, 'players'));
  clean.duration = Math.round(cleanNumber(raw.duration, { min: 10, max: 600 }, 'duration'));
  clean.theme = cleanEnum(raw.theme, THEMES, 'theme');
  clean.difficulty = cleanEnum(raw.difficulty, DIFFICULTIES, 'difficulty');
  clean.objects = validateObjects(raw.objects || []);
  clean.rules = validateRules(raw.rules);
  clean.winCondition = validateWinCondition(raw.winCondition);
  clean.scoreSystem = validateScoreSystem(raw.scoreSystem);

  return clean;
}

module.exports = { validateGameSpec, ValidationError };
