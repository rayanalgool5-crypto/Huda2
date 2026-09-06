// طبقة الاتصال بقاعدة البيانات (SQLite عبر وحدة node:sqlite المدمجة بـ Node.js).
// SQLite مناسبة هنا لأن حجم البيانات صغير (مستخدمون + تقدم يومي بسيط)
// ولأنها لا تحتاج خادم قاعدة بيانات منفصل — كل شيء بملف واحد قابل للنسخ.
//
// ملاحظة: كنا نستخدم مكتبة better-sqlite3 سابقاً، لكنها تحتاج تجميع C++
// (native build) عند عدم توفر نسخة جاهزة لإصدار Node.js/النظام المستخدَم،
// وهذا يتطلب تثبيت Visual Studio Build Tools على ويندوز. للتخلص من هذا
// الشرط تماماً، ننتقل إلى node:sqlite المدمجة في Node.js نفسه (Node 22.5+)
// — بدون أي اعتمادية خارجية أو تجميع مطلوب على أي نظام تشغيل.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'huda.db');

// إنشاء مجلد قاعدة البيانات تلقائياً إن لم يكن موجوداً (مثلاً data/ عند أول تشغيل).
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// --- طبقة توافق بسيطة مع الواجهة القديمة (better-sqlite3-like) ---
// db.pragma('...'): better-sqlite3 عندها دالة pragma مخصوصة، node:sqlite لأ،
// فبننفذها كـ PRAGMA عادي عبر exec.
db.pragma = (statement) => db.exec(`PRAGMA ${statement}`);

// db.transaction(fn): better-sqlite3 بترجع دالة قابلة للاستدعاء بتغلّف
// العملية بمعاملة (transaction) تلقائياً. node:sqlite ما عندها هذا الهيلبر
// جاهز، فبنبنيه يدوياً بـ BEGIN/COMMIT/ROLLBACK.
db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- المخطط (Schema) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name_change_count INTEGER NOT NULL DEFAULT 0,
  name_last_changed_at TEXT
);

-- طلبات إعادة تعيين كلمة المرور (رموز مؤقتة أحادية الاستخدام).
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

-- رموز التحقق المرسلة إلى البريد الإلكتروني قبل السماح بتغيير كلمة المرور.
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user
  ON password_reset_codes(user_id, created_at);
CREATE TABLE IF NOT EXISTS tasbeeh_progress (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,               -- تاريخ اليوم بصيغة YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  azkar_json TEXT NOT NULL DEFAULT '{}',
  sound INTEGER NOT NULL DEFAULT 0,
  vibration INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id INTEGER PRIMARY KEY,
  last_surah INTEGER,
  last_verse INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasbeeh_user ON tasbeeh_progress(user_id);

-- ---------- الحفظ والمراجعة ----------

-- حالة حفظ كل آية لكل مستخدم (وحدة التكرار المتباعد الأصغر).
CREATE TABLE IF NOT EXISTS ayah_progress (
  user_id INTEGER NOT NULL,
  surah_number INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,          -- عدد المحاولات الكلي
  perfect_attempts INTEGER NOT NULL DEFAULT 0,  -- المحاولات الصحيحة 100%
  error_count INTEGER NOT NULL DEFAULT 0,       -- مجموع الأخطاء (كلمات)
  hints_used INTEGER NOT NULL DEFAULT 0,
  accuracy INTEGER NOT NULL DEFAULT 0,          -- نسبة الإتقان 0..100
  mastered INTEGER NOT NULL DEFAULT 0,          -- 1 عند إتمامها 100%
  review_stage INTEGER NOT NULL DEFAULT 0,      -- مرحلة التكرار المتباعد
  last_review_at TEXT,
  next_review_at TEXT,
  first_mastered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, surah_number, ayah_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ملخّص كل سورة (مشتق من ayah_progress ويُعاد حسابه بعد كل تحديث).
CREATE TABLE IF NOT EXISTS surah_progress (
  user_id INTEGER NOT NULL,
  surah_number INTEGER NOT NULL,
  surah_name TEXT,
  total_ayahs INTEGER NOT NULL DEFAULT 0,
  memorized_ayahs INTEGER NOT NULL DEFAULT 0,
  accuracy INTEGER NOT NULL DEFAULT 0,          -- متوسط نسبة الإتقان 0..100
  completed INTEGER NOT NULL DEFAULT 0,         -- 1 = "✓ محفوظة"
  completed_at TEXT,
  review_stage INTEGER NOT NULL DEFAULT 0,
  last_review_at TEXT,
  next_review_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, surah_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- سجل الأخطاء المصنّفة (ناقصة / زائدة / مبدلة) لتحليل نقاط الضعف.
CREATE TABLE IF NOT EXISTS error_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  surah_number INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  word_index INTEGER NOT NULL,
  error_type TEXT NOT NULL CHECK (error_type IN ('missing', 'extra', 'substituted')),
  expected_word TEXT,
  actual_word TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- نشاط يومي: أساس عدّاد الأيام المتتالية (Streak).
CREATE TABLE IF NOT EXISTS daily_activity (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,                            -- YYYY-MM-DD
  ayahs_reviewed INTEGER NOT NULL DEFAULT 0,
  ayahs_mastered INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- إحصائيات مجمّعة لكل مستخدم (تُحدَّث مع كل نشاط).
CREATE TABLE IF NOT EXISTS user_stats (
  user_id INTEGER PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_day TEXT,
  total_ayahs_memorized INTEGER NOT NULL DEFAULT 0,
  total_surahs_completed INTEGER NOT NULL DEFAULT 0,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ayah_progress_due ON ayah_progress(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_surah_progress_due ON surah_progress(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_error_events_user ON error_events(user_id, surah_number, ayah_number);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user ON daily_activity(user_id, day);

-- ---------- إشعارات الأذان الحقيقية (Web Push) ----------
-- كل صف = اشتراك متصفح واحد (جهاز/متصفح) تابع لمستخدم مسجّل دخول، مع موقعه
-- المفضّل لحساب مواقيت الصلاة. المجدول (backend/lib/prayer-push-scheduler.js)
-- يمر على هذا الجدول كل دقيقة ويبعت Push عبر web-push عند دخول وقت كل صلاة.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'city', -- 'city' أو 'coords'
  city TEXT,
  country TEXT,
  method TEXT NOT NULL DEFAULT '3',
  latitude REAL,
  longitude REAL,
  -- منع تكرار نفس الإشعار أكثر من مرة بنفس اليوم (تُصفَّر تلقائياً عند تغيّر التاريخ).
  last_notified_date TEXT,
  last_notified_prayers TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
`);


const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('name_change_count')) {
  db.exec("ALTER TABLE users ADD COLUMN name_change_count INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes('name_last_changed_at')) {
  db.exec("ALTER TABLE users ADD COLUMN name_last_changed_at TEXT");
}

module.exports = db;
