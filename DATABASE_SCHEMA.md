# مخطط قاعدة البيانات — هُدى القرآني

قاعدة البيانات: SQLite (عبر `better-sqlite3`)، الملف الافتراضي: `backend/data/huda.db`، وتُنشأ الجداول تلقائياً عند إقلاع الخادم من `backend/db.js`.

كل جدول مرتبط بالمستخدم عبر `user_id` مع `FOREIGN KEY ... ON DELETE CASCADE`، أي أن حذف الحساب يحذف كل تقدمه. جميع مسارات التقدم والإحصائيات محمية بـ `requireAuth`، فلا يُقرأ أو يُكتب أي صف بدون جلسة مسجّلة.

## المخطط العلائقي

```
users (1) ──< ayah_progress    (PK: user_id, surah_number, ayah_number)
      (1) ──< surah_progress   (PK: user_id, surah_number)
      (1) ──< error_events     (PK: id)
      (1) ──< daily_activity   (PK: user_id, day)
      (1) ──  user_stats       (PK: user_id)
      (1) ──< tasbeeh_progress (PK: user_id, day)
      (1) ──  reading_progress (PK: user_id)
```

## الجداول

### `users`
| العمود | النوع | الوصف |
| --- | --- | --- |
| `id` | INTEGER PK | معرّف المستخدم |
| `name` | TEXT | الاسم |
| `email` | TEXT UNIQUE | البريد (تسجيل الدخول) |
| `password_hash` | TEXT | كلمة المرور المشفّرة بـ bcrypt |
| `created_at` | TEXT | تاريخ الإنشاء |

### `ayah_progress` — تقدّم كل آية
| العمود | النوع | الوصف |
| --- | --- | --- |
| `user_id`, `surah_number`, `ayah_number` | INTEGER | المفتاح المركّب |
| `attempts` | INTEGER | عدد المحاولات |
| `perfect_attempts` | INTEGER | المحاولات المتقنة ١٠٠٪ |
| `error_count` | INTEGER | مجموع الأخطاء |
| `hints_used` | INTEGER | مرات استخدام التلميح |
| `accuracy` | INTEGER | نسبة الإتقان (٠–١٠٠) |
| `mastered` | INTEGER | ١ إذا أُتقنت الآية |
| `review_stage` | INTEGER | مرحلة التكرار المتباعد |
| `last_review_at` / `next_review_at` | TEXT | تاريخ آخر مراجعة والمراجعة القادمة (ISO) |
| `first_mastered_at` | TEXT | أول إتقان |
| `updated_at` | TEXT | آخر تحديث |

### `surah_progress` — تقدّم كل سورة
`user_id`, `surah_number` (PK)، مع `surah_name`, `total_ayahs`, `memorized_ayahs`, `accuracy`, `completed`, `completed_at`, `review_stage`, `last_review_at`, `next_review_at`, `updated_at`.

منها تُشتق علامة «✓ محفوظة» (`completed = 1`) ونسبة الإتقان المعروضة بجانب السورة.

### `error_events` — سجل الأخطاء التفصيلي
`id` (PK), `user_id`, `surah_number`, `ayah_number`, `word_index`, `error_type`, `expected_word`, `actual_word`, `created_at`.

```sql
CHECK (error_type IN ('missing', 'extra', 'substituted'))
```
أي: كلمة ناقصة / كلمة زائدة / كلمة مبدلة.

### `daily_activity` — النشاط اليومي
`user_id`, `day` (PK) مع `ayahs_reviewed`, `ayahs_mastered`, `errors`. تُبنى منه سلسلة الأيام المتتالية ومخطط آخر ٣٠ يوماً.

### `user_stats` — ملخّص الحساب
`user_id` (PK) مع `current_streak`, `longest_streak`, `last_activity_day`, `total_ayahs_memorized`, `total_surahs_completed`, `total_reviews`, `updated_at`.

### جداول سابقة
`tasbeeh_progress` (عدّاد التسبيح اليومي) و`reading_progress` (آخر موضع قراءة) كما كانت.

## الفهارس
```sql
idx_ayah_progress_user      ON ayah_progress(user_id)
idx_ayah_progress_due       ON ayah_progress(user_id, next_review_at)
idx_surah_progress_due      ON surah_progress(user_id, next_review_at)
idx_error_events_user       ON error_events(user_id, created_at)
idx_daily_activity_user     ON daily_activity(user_id, day)
```

## التكرار المتباعد
`backend/lib/spaced-repetition.js`:

```js
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];
```
كل مراجعة ناجحة ترفع `review_stage` درجة وتؤجل `next_review_at` بالفاصل الجديد، وأي إخفاق يعيد المرحلة إلى الصفر (مراجعة خلال يوم).

## مسارات API المرتبطة (كلها تتطلب تسجيل الدخول)
| المسار | الوظيفة |
| --- | --- |
| `GET /api/memorization/surahs` | تقدّم كل السور + علامات ✓ |
| `GET /api/memorization/surahs/:number` | تفاصيل سورة وآياتها |
| `POST /api/memorization/attempts` | تسجيل محاولة آية مع أخطائها وتحديث الجداول كلها |
| `POST /api/memorization/surahs/:number/review` | تسجيل مراجعة سورة |
| `GET /api/memorization/due` | السور/الآيات المستحقة للمراجعة |
| `GET /api/memorization/quick-review` | عناصر وضع «المراجعة السريعة» |
| `GET /api/stats` | صفحة الإحصائيات: السلسلة، الإجماليات، الأخطاء، النشاط |

بدون جلسة يرجع كل مسار منها `401` مع `{"message":"يجب تسجيل الدخول أولاً."}`.

## الخصوصية الصوتية
تسجيل «سجّل وقارن» لا يُخزَّن في أي جدول ولا يُرفع إلى الخادم: يبقى `Blob` في ذاكرة المتصفح ويُحذف بـ `URL.revokeObjectURL` فور المقارنة أو مغادرة الشاشة.
