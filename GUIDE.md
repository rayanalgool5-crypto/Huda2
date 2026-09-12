# هُدى - تطبيق إسلامي شامل 📿

> **مساحتك الهادئة لقراءة القرآن، وتأمل الحديث، والمحافظة على الذكر**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-development-yellow)

## 🎯 نظرة عامة

**هُدى** هو تطبيق ويب حديث يجمع بين ثلاث محاور إسلامية مهمة:

1. **القرآن الكريم** ☪️ - تلاوة واضحة، بحث سريع، واستماع لقراء متميزين
2. **الحديث الشريف** 📖 - مجموعة مختارة من صحيح البخاري ومسلم
3. **التسبيح والأذكار** 🤲 - عداد بسيط وأذكار مرتبة لبداية اليوم ونهايته

مع نظام مصادقة كامل وتتبع التقدم الشخصي للمستخدمين.

## 📋 المميزات الرئيسية

✅ **نظام مصادقة آمن** - تسجيل وتسجيل دخول مع تشفير bcrypt  
✅ **تتبع التقدم** - حفظ تقدم المستخدم يومياً  
✅ **واجهة عصرية** - تصميم جميل ومستجيب  
✅ **دعم الوضع الليلي** - راحة العيون في الليل  
✅ **تطبيق Full-Stack** - Frontend + Backend + Database  
✅ **قابل للتوسع** - بنية نظيفة وسهلة التعديل  

## 🏗️ البنية المعمارية

```
huda-app/
├── index.html                    # الصفحة الرئيسية
├── pages/
│   ├── login.html               # صفحة تسجيل الدخول
│   ├── register.html            # صفحة التسجيل
│   ├── quran.html               # صفحة القرآن
│   ├── hadith.html              # صفحة الحديث
│   └── tasbeeh.html             # صفحة التسبيح
├── js/
│   ├── app.js                   # التطبيق الرئيسي
│   ├── config.js                # الثوابت والإعدادات
│   ├── utils.js                 # الدوال المساعدة
│   ├── quran.js                 # منطق القرآن
│   ├── hadith.js                # منطق الحديث
│   └── tasbeeh.js               # منطق التسبيح
├── css/
│   └── style.css                # الأنماط
├── assets/                      # الصور والموارد
└── backend/
    ├── server.js                # خادم Express
    ├── db.js                    # إعداد قاعدة البيانات
    ├── package.json             # المكتبات
    ├── .env.example             # نموذج الإعدادات
    ├── SETUP.md                 # دليل الإعداد
    └── routes/
        ├── auth.js              # مسارات المصادقة
        └── progress.js          # مسارات التقدم
```

## 🚀 البدء السريع

### المتطلبات
- Node.js v14+
- npm أو yarn
- متصفح حديث

### خطوات التثبيت

#### 1. استنساخ المشروع
```bash
git clone <repo-url>
cd huda-app
```

#### 2. إعداد Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

#### 3. فتح التطبيق
```
http://localhost:3000
```

**ملاحظة**: التطبيق الآن جاهز للاستخدام! ✨

## 📚 دليل الاستخدام

### للمستخدمين الجدد
1. اضغط على "إنشاء حساب"
2. أدخل اسمك، بريدك، وكلمة مرور قوية
3. ستُعاد توجيهك للصفحة الرئيسية
4. استكشف القرآن والأحاديث والتسبيح

### للمستخدمين الموجودين
1. اضغط على "تسجيل الدخول"
2. أدخل بريدك وكلمة المرور
3. سيُحفظ تقدمك تلقائياً

## 🔧 التطوير والمساهمة

### المكتبات المستخدمة

**Backend:**
- Express.js - إطار عمل الويب
- SQLite - قاعدة البيانات
- bcrypt - تشفير كلمات المرور
- express-session - إدارة الجلسات

**Frontend:**
- HTML5 + CSS3 + JavaScript
- بدون frameworks (Vanilla JS)
- مشفر ومنسق يدويًا

### إضافة ميزات جديدة

#### 1. إضافة endpoint API جديد
```javascript
// في backend/routes/[feature].js
router.get('/new-endpoint', requireAuth, (req, res) => {
  // Your logic here
  res.json({ success: true });
});
```

#### 2. استدعاء الـ API من Frontend
```javascript
// في frontend
const data = await Huda.apiGet('/new-endpoint');
```

#### 3. إضافة جدول قاعدة البيانات جديد
```javascript
// في backend/db.js
db.exec(`
CREATE TABLE IF NOT EXISTS new_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  data TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);
```

## 🛡️ الأمان

### Best Practices المطبقة

✅ **كلمات المرور**
- مشفرة مع bcrypt (12 rounds)
- يجب ≥ 8 أحرف

✅ **Sessions**
- محمية بـ httpOnly cookies
- صلاحية 30 يوماً
- secure flag في production

✅ **API Security**
- CORS محدود
- Validation على جميع المدخلات
- Error messages آمنة

✅ **Database**
- Foreign keys مفعلة
- Prepared statements فقط
- WAL mode للأمان

### Environment Variables
**لا تضع أبداً** أسرارك في الكود! استخدم `.env`:

```bash
SESSION_SECRET=your-strong-secret
DB_PATH=./data/huda.db
NODE_ENV=production
```

## 📊 قاعدة البيانات

### جداول المستخدمين
```sql
users
├── id (PRIMARY KEY)
├── name
├── email (UNIQUE)
├── password_hash
└── created_at
```

### جداول التقدم
```sql
tasbeeh_progress
├── user_id (FK)
├── day
├── count
├── total
├── azkar_json
├── sound
├── vibration
└── updated_at

reading_progress
├── user_id (PK, FK)
├── last_surah
├── last_verse
└── updated_at
```

## 🐛 استكشاف الأخطاء

| المشكلة | الحل |
|--------|-----|
| `EADDRINUSE` | غيّر المنفذ في `.env` |
| Database locked | احذف `data/huda.db-wal` |
| API connection failed | تأكد من تشغيل Backend |
| Session expired | أعد تسجيل الدخول |

للمزيد، انظر [backend/SETUP.md](backend/SETUP.md)

## 📈 الخطوات التالية

- [ ] إضافة بيانات القرآن والأحاديث الفعلية
- [ ] تصميم صفحات القرآن والحديث والتسبيح
- [ ] اختبارات شاملة (Unit & Integration)
- [ ] Deployment على production
- [ ] إضافة تطبيق Mobile (React Native)
- [ ] نظام الإشعارات
- [ ] مجتمع وتفاعل بين المستخدمين

## 📝 الترخيص

هذا المشروع مرخص تحت [MIT License](LICENSE)

## 👥 المساهمين

- **بناء الأساسيات**: 100% ✅

## 📞 التواصل والدعم

- **GitHub Issues**: [Report a bug](https://github.com/your-repo/issues)
- **Email**: support@example.com
- **Twitter**: [@huda_app](https://twitter.com/huda_app)

---

**شُكر لك على استخدام هُدى** 💚  
*صُمّم بهدوء ليعينك على ذكر الله*

### آية للتدبر
> ﴿ أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ ﴾  
> الرعد — ٢٨

---

**آخر تحديث**: يناير 2024  
**حالة المشروع**: 🔄 قيد التطوير
