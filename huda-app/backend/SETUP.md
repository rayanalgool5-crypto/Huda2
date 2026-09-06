# هُدى - Backend Setup Guide

## المتطلبات
- **Node.js** v14+ و **npm** أو **yarn**
- **SQLite3** (مضمن في better-sqlite3)

## التثبيت

### 1. استنساخ المشروع
```bash
git clone <repo-url>
cd huda-app/backend
```

### 2. تثبيت المكتبات
```bash
npm install
```

### 3. إنشاء ملف .env
انسخ `.env.example` إلى `.env` وحدث القيم:

```bash
cp .env.example .env
```

ثم عدّل القيم حسب احتياجك:
```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-strong-secret-key-min-32-chars
DB_PATH=./data/huda.db
CLIENT_URL=http://localhost:3000
```

### 4. بدء التطبيق

#### بيئة التطوير (مع إعادة تحميل تلقائي):
```bash
npm run dev
```

#### بيئة الإنتاج:
```bash
NODE_ENV=production npm start
```

## هيكل المشروع

```
backend/
├── server.js              # ملف البداية الرئيسي
├── db.js                  # إعداد قاعدة البيانات
├── package.json          # المكتبات
├── .env.example          # نموذج الإعدادات
├── .gitignore            # الملفات المتجاهلة
├── data/
│   └── huda.db          # قاعدة البيانات (تُنشأ تلقائياً)
└── routes/
    ├── auth.js          # مسارات المصادقة
    └── progress.js      # مسارات تتبع التقدم
```

## API Endpoints

### Authentication (`/api/auth`)

#### تسجيل حساب جديد
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "محمد",
  "email": "mohammed@example.com",
  "password": "secure-password-min-8-chars"
}

Response: 201
{
  "success": true,
  "user": {
    "id": 1,
    "name": "محمد",
    "email": "mohammed@example.com"
  }
}
```

#### تسجيل الدخول
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "mohammed@example.com",
  "password": "secure-password"
}

Response: 200
{
  "success": true,
  "user": {
    "id": 1,
    "name": "محمد",
    "email": "mohammed@example.com"
  }
}
```

#### الحصول على بيانات الجلسة
```
GET /api/auth/session

Response: 200
{
  "authenticated": true,
  "user": {
    "id": 1,
    "name": "محمد",
    "email": "mohammed@example.com"
  }
}
```

#### تسجيل الخروج
```
POST /api/auth/logout

Response: 200
{
  "success": true
}
```

### Progress (`/api/progress`)

#### جلب تقدم التسبيح لليوم
```
GET /api/progress/tasbeeh

Response: 200
{
  "day": "2024-01-15",
  "count": 100,
  "total": 1000,
  "azkar": {},
  "sound": true,
  "vibration": false
}
```

#### حفظ تقدم التسبيح
```
PUT /api/progress/tasbeeh
Content-Type: application/json

{
  "count": 150,
  "total": 1000,
  "azkar": {},
  "sound": true,
  "vibration": false
}

Response: 200
{
  "success": true
}
```

## الأمان

- **كلمات المرور**: مشفرة مع bcrypt (12 جولة salt)
- **Sessions**: محمية بـ httpOnly cookies
- **CORS**: مكون بشكل آمن لـ development و production
- **Environment Variables**: جميع الأسرار في `.env`

## استكشاف الأخطاء

### خطأ: `EADDRINUSE` (المنفذ مستخدم)
```bash
# غيّر المنفذ في .env
PORT=3001
```

### خطأ: `database is locked`
- أغلق جميع نسخ البرنامج
- احذف ملف `data/huda.db-wal` إن وجد

### لا توجد استجابة من API
- تأكد من أن الخادم يعمل: `npm run dev`
- افحص CORS في server.js
- تحقق من رسائل الأخطاء في Console

## الخطوات التالية

- [ ] إضافة validation أشمل
- [ ] إضافة rate limiting
- [ ] إضافة logging محترف
- [ ] إضافة مزيد من tests
- [ ] نشر على production

## الملفات المهمة

| الملف | الوصف |
|------|--------|
| `.env` | الإعدادات والأسرار (DO NOT COMMIT) |
| `db.js` | إعداد قاعدة البيانات والمخطط |
| `routes/auth.js` | نقاط نهاية المصادقة |
| `routes/progress.js` | نقاط نهاية تتبع التقدم |

## الدعم

لأي استفسارات أو مشاكل، يرجى فتح issue على GitHub.


## استعادة كلمة المرور عبر البريد الإلكتروني

ميزة «نسيت كلمة السر؟» تستخدم رمز تحقق من 6 أرقام يُرسل إلى البريد الإلكتروني، ثم يجب إدخال الرمز قبل فتح صفحة تغيير كلمة المرور.

ثبّت الاعتمادية:

```bash
npm install
```

ثم انسخ `.env.example` إلى `.env` واضبط:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Huda <your-email@gmail.com>
```

إذا استخدمت Gmail، استخدم **App Password** مخصصاً للتطبيق بعد تفعيل التحقق بخطوتين، ولا تضع كلمة مرور حساب Gmail العادية داخل المشروع.

تسلسل الاستعادة:
1. المستخدم يدخل بريده.
2. الخادم يولّد رمزاً عشوائياً من 6 أرقام ويخزّن تجزئته فقط.
3. الرمز يصل إلى البريد وصلاحيته 10 دقائق.
4. بعد إدخال الرمز الصحيح، يحصل المستخدم على صلاحية مؤقتة لفتح صفحة تغيير كلمة المرور.
5. رابط تغيير كلمة المرور مؤقت وأحادي الاستخدام.
6. بعد تغيير كلمة المرور يُعاد المستخدم إلى صفحة تسجيل الدخول.
